import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";
import { getNimbleLayout, isNimbleLayout } from "../../../../nimbleLayouts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

export async function POST(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const payload = (await request.json()) as { name?: unknown; layout?: unknown };
  const name = cleanName(payload.name);
  if (!name) return Response.json({ error: "Dê um nome à ficha." }, { status: 400 });
  const layoutId = payload.layout ?? "BASE";
  if (!isNimbleLayout(layoutId)) return Response.json({ error: "Escolha um layout Nimble válido." }, { status: 400 });
  const layout = getNimbleLayout(layoutId);

  const membership = await env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(rawCode.toUpperCase(), user.id).first<{ id: string; role: "master" | "player" }>();

  if (!membership || membership.role !== "master") {
    return Response.json({ error: "Apenas o Mestre pode criar fichas." }, { status: 403 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO characters
        (id, campaign_id, name, assigned_user_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    ).bind(id, membership.id, name, user.id, now, now),
    env.DB.prepare(
      `INSERT INTO character_fields
        (character_id, campaign_id, field_key, field_value, updated_by, updated_by_name, updated_at)
       VALUES (?, ?, 'classLayout', ?, ?, ?, ?)`,
    ).bind(id, membership.id, layout.id, user.id, user.displayName, now),
    env.DB.prepare(
      `INSERT INTO character_fields
        (character_id, campaign_id, field_key, field_value, updated_by, updated_by_name, updated_at)
       VALUES (?, ?, 'proficiencies', ?, ?, ?, ?)`,
    ).bind(id, membership.id, layout.proficiencies, user.id, user.displayName, now),
    env.DB.prepare(
      `INSERT INTO character_fields
        (character_id, campaign_id, field_key, field_value, updated_by, updated_by_name, updated_at)
       VALUES (?, ?, 'classFeatures', '[]', ?, ?, ?)`,
    ).bind(id, membership.id, user.id, user.displayName, now),
    env.DB.prepare("UPDATE campaigns SET version = version + 1, updated_at = ? WHERE id = ?")
      .bind(now, membership.id),
  ]);

  return Response.json({
    character: { id, name, assignedUserId: null, assignedDisplayName: null, updatedAt: now },
  }, { status: 201 });
}
