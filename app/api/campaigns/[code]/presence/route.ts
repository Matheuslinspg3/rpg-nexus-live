import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

function colorFor(value: string) {
  const colors = ["#77E3C4", "#F29AB2", "#C6A6FF", "#F4C76A", "#75B8FF", "#FF916F"];
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

function unit(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const campaign = await env.DB.prepare(
    `SELECT c.id FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(rawCode.toUpperCase(), user.id).first<{ id: string }>();
  if (!campaign) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const cutoff = new Date(Date.now() - 18_000).toISOString();
  const rows = await env.DB.prepare(
    `SELECT email, display_name AS displayName, role, color,
            cursor_x AS cursorX, cursor_y AS cursorY,
            editing_field AS editingField, active_at AS activeAt
       FROM presence
      WHERE campaign_id = ? AND active_at >= ?
      ORDER BY email`,
  ).bind(campaign.id, cutoff).all();

  return Response.json({ presence: rows.results ?? [] });
}

export async function POST(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const payload = (await request.json()) as { cursorX?: number; cursorY?: number; editingField?: string | null };
  const member = await env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(rawCode.toUpperCase(), user.id).first<{ id: string; role: "master" | "player" }>();
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const editingField = typeof payload.editingField === "string" ? payload.editingField.slice(0, 80) : null;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO presence
      (campaign_id, email, display_name, role, color, cursor_x, cursor_y, editing_field, active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, email) DO UPDATE SET
       display_name = excluded.display_name,
       role = excluded.role,
       color = excluded.color,
       cursor_x = excluded.cursor_x,
       cursor_y = excluded.cursor_y,
       editing_field = excluded.editing_field,
       active_at = excluded.active_at`,
  ).bind(
    member.id,
    user.id,
    user.displayName,
    member.role,
    colorFor(user.id),
    unit(payload.cursorX),
    unit(payload.cursorY),
    editingField,
    now,
  ).run();

  return Response.json({ ok: true });
}
