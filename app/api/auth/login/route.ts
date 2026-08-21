import { env } from "cloudflare:workers";
import { createSession, hashPassword, normalizeUsername, PASSWORD_ITERATIONS, sessionCookie, sha256, verifyPassword } from "../../../auth";

export const dynamic = "force-dynamic";
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

type AccountRow = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

async function rateKey(request: Request, username: string) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return sha256(`${ip}:${username}`);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as { username?: unknown; password?: unknown };
  const username = normalizeUsername(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!username || !password) return Response.json({ error: "Informe usuário e senha." }, { status: 400 });

  const key = await rateKey(request, username);
  const now = new Date();
  const limit = await env.DB.prepare(
    "SELECT attempts, reset_at AS resetAt FROM auth_rate_limits WHERE key = ?",
  ).bind(key).first<{ attempts: number; resetAt: string }>();
  if (limit && limit.attempts >= MAX_ATTEMPTS && new Date(limit.resetAt) > now) {
    return Response.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const account = await env.DB.prepare(
    `SELECT id, username, display_name AS displayName,
            password_hash AS passwordHash, password_salt AS passwordSalt,
            password_iterations AS passwordIterations
       FROM users WHERE username = ?`,
  ).bind(username).first<AccountRow>();
  let valid = false;
  if (account) {
    valid = await verifyPassword(password, account.passwordSalt, account.passwordIterations, account.passwordHash);
  } else {
    await hashPassword(password, "00000000000000000000000000000000", PASSWORD_ITERATIONS);
  }

  if (!account || !valid) {
    const resetAt = new Date(now.getTime() + WINDOW_MS).toISOString();
    await env.DB.prepare(
      `INSERT INTO auth_rate_limits (key, attempts, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         attempts = CASE WHEN reset_at <= ? THEN 1 ELSE attempts + 1 END,
         reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END`,
    ).bind(key, resetAt, now.toISOString(), now.toISOString()).run();
    return Response.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }

  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE key = ?").bind(key).run();
  const session = await createSession(account.id);
  return Response.json(
    { user: { id: account.id, username: account.username, displayName: account.displayName } },
    { headers: { "set-cookie": sessionCookie(request, session.token, session.maxAge) } },
  );
}
