import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { id: string; role: "master" | "player" };

async function getMembership(code: string, userId: string) {
  return env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
       JOIN campaign_members m ON m.campaign_id = c.id
      WHERE c.code = ? AND m.email = ?`,
  ).bind(code.toUpperCase(), userId).first<Membership>();
}

// GET /api/campaigns/:code/camera - Get all active camera states
export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { code } = await context.params;
  const member = await getMembership(code, user.id);
  if (!member) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  // Get all camera states updated in the last 30 seconds
  const cutoff = new Date(Date.now() - 30000).toISOString();
  const states = await env.DB.prepare(
    `SELECT user_id as userId, display_name as displayName, is_active as isActive, updated_at as updatedAt
       FROM camera_states
      WHERE campaign_id = ? AND updated_at > ?
      ORDER BY display_name`,
  ).bind(member.id, cutoff).all();

  return Response.json({ states: states.results || [] });
}

// POST /api/campaigns/:code/camera - Update camera state
export async function POST(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { code } = await context.params;
  const member = await getMembership(code, user.id);
  if (!member) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const body = await request.json() as { isActive: boolean };
  if (typeof body.isActive !== "boolean") {
    return Response.json({ error: "Parâmetro isActive inválido." }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO camera_states (campaign_id, user_id, display_name, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, user_id) DO UPDATE SET
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
  ).bind(member.id, user.id, user.displayName, body.isActive ? 1 : 0, now).run();

  return Response.json({ ok: true });
}
