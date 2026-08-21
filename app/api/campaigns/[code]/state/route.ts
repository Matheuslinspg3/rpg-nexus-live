import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

const ALLOWED_FIELDS = new Set([
  "characterName", "ancestryClassLevel", "heightWeightSpeed", "hitDice",
  "str", "dex", "int", "wil", "hpCurrent", "hpMax", "tempHp", "armor",
  "initiative", "wound1", "wound2", "wound3", "wound4", "wound5",
  "arcana", "examination", "finesse", "influence", "insight", "lore",
  "might", "naturecraft", "perception", "stealth", "features", "spells", "notes",
]);

export async function PATCH(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const payload = (await request.json()) as { field?: string; value?: unknown };
  const field = typeof payload.field === "string" ? payload.field : "";
  const value = typeof payload.value === "string" ? payload.value.slice(0, 12000) : String(payload.value ?? "");
  if (!ALLOWED_FIELDS.has(field)) return Response.json({ error: "Campo inválido." }, { status: 400 });

  const membership = await env.DB.prepare(
    `SELECT c.id FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(rawCode.toUpperCase(), user.id).first<{ id: string }>();
  if (!membership) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sheet_fields
        (campaign_id, field_key, field_value, updated_by, updated_by_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaign_id, field_key) DO UPDATE SET
         field_value = excluded.field_value,
         updated_by = excluded.updated_by,
         updated_by_name = excluded.updated_by_name,
         updated_at = excluded.updated_at`,
    ).bind(membership.id, field, value, user.id, user.displayName, now),
    env.DB.prepare("UPDATE campaigns SET version = version + 1, updated_at = ? WHERE id = ?")
      .bind(now, membership.id),
  ]);

  return Response.json({ ok: true, changes: results.length, updatedAt: now });
}
