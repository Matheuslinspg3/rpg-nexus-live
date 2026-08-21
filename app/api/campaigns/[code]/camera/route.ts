import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { id: string; role: "master" | "player" };
type SignalType = "offer" | "answer" | "candidate";

async function membership(code: string, userId: string) {
  return env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(code.toUpperCase(), userId).first<Membership>();
}

function cleanSession(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value) ? value : "";
}

export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const sessionId = cleanSession(new URL(request.url).searchParams.get("sessionId"));
  if (!sessionId) return Response.json({ error: "Sessão de câmera inválida." }, { status: 400 });
  const cutoff = new Date(Date.now() - 15_000).toISOString();
  const [peerRows, signalRows] = await Promise.all([
    env.DB.prepare(
      `SELECT user_id AS userId, session_id AS sessionId, display_name AS displayName,
              role, camera_enabled AS cameraEnabled, updated_at AS updatedAt
         FROM camera_sessions
        WHERE campaign_id = ? AND user_id <> ? AND updated_at >= ?
        ORDER BY display_name`,
    ).bind(member.id, user.id, cutoff).all(),
    env.DB.prepare(
      `SELECT id, from_user_id AS fromUserId, from_name AS fromName,
              from_session_id AS fromSessionId, signal_type AS signalType,
              payload, created_at AS createdAt
         FROM camera_signals
        WHERE campaign_id = ? AND to_user_id = ? AND to_session_id = ?
        ORDER BY created_at
        LIMIT 120`,
    ).bind(member.id, user.id, sessionId).all(),
  ]);

  return Response.json({ peers: peerRows.results ?? [], signals: signalRows.results ?? [] });
}

export async function POST(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const payload = (await request.json()) as Record<string, unknown>;
  const action = typeof payload.action === "string" ? payload.action : "";
  const now = new Date().toISOString();

  if (action === "heartbeat") {
    const sessionId = cleanSession(payload.sessionId);
    if (!sessionId) return Response.json({ error: "Sessão de câmera inválida." }, { status: 400 });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO camera_sessions
          (campaign_id, user_id, session_id, display_name, role, camera_enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(campaign_id, user_id) DO UPDATE SET
           session_id = excluded.session_id,
           display_name = excluded.display_name,
           role = excluded.role,
           camera_enabled = excluded.camera_enabled,
           updated_at = excluded.updated_at`,
      ).bind(member.id, user.id, sessionId, user.displayName, member.role, payload.cameraEnabled === true ? 1 : 0, now),
      env.DB.prepare("DELETE FROM camera_signals WHERE campaign_id = ? AND created_at < ?")
        .bind(member.id, new Date(Date.now() - 120_000).toISOString()),
    ]);
    return Response.json({ ok: true });
  }

  if (action === "signal") {
    const fromSessionId = cleanSession(payload.sessionId);
    const toSessionId = cleanSession(payload.toSessionId);
    const toUserId = typeof payload.toUserId === "string" ? payload.toUserId.slice(0, 80) : "";
    const signalType = payload.signalType as SignalType;
    const signalPayload = typeof payload.payload === "string" ? payload.payload : "";
    if (!fromSessionId || !toSessionId || !toUserId || !["offer", "answer", "candidate"].includes(signalType)) {
      return Response.json({ error: "Sinal de câmera inválido." }, { status: 400 });
    }
    if (!signalPayload || signalPayload.length > 80_000) {
      return Response.json({ error: "Sinal de câmera muito grande." }, { status: 400 });
    }
    const target = await env.DB.prepare(
      `SELECT user_id AS userId FROM camera_sessions
        WHERE campaign_id = ? AND user_id = ? AND session_id = ?`,
    ).bind(member.id, toUserId, toSessionId).first();
    if (!target) return Response.json({ error: "Participante não está mais conectado." }, { status: 404 });

    await env.DB.prepare(
      `INSERT INTO camera_signals
        (id, campaign_id, from_user_id, from_name, from_session_id,
         to_user_id, to_session_id, signal_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), member.id, user.id, user.displayName, fromSessionId,
      toUserId, toSessionId, signalType, signalPayload, now,
    ).run();
    return Response.json({ ok: true });
  }

  if (action === "ack") {
    const sessionId = cleanSession(payload.sessionId);
    const ids = Array.isArray(payload.ids)
      ? payload.ids.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(id)).slice(0, 120)
      : [];
    if (!sessionId || ids.length === 0) return Response.json({ ok: true });
    const placeholders = ids.map(() => "?").join(",");
    await env.DB.prepare(
      `DELETE FROM camera_signals
        WHERE campaign_id = ? AND to_user_id = ? AND to_session_id = ?
          AND id IN (${placeholders})`,
    ).bind(member.id, user.id, sessionId, ...ids).run();
    return Response.json({ ok: true });
  }

  if (action === "leave") {
    const sessionId = cleanSession(payload.sessionId);
    if (sessionId) {
      await env.DB.prepare(
        "DELETE FROM camera_sessions WHERE campaign_id = ? AND user_id = ? AND session_id = ?",
      ).bind(member.id, user.id, sessionId).run();
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ação de câmera inválida." }, { status: 400 });
}
