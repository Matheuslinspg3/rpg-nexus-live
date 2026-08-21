import { env } from "cloudflare:workers";
import { cleanDisplayName, createSession, hashPassword, normalizeUsername, sessionCookie, validUsername } from "../../../auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { displayName?: unknown; username?: unknown; password?: unknown };
    const displayName = cleanDisplayName(payload.displayName);
    const username = normalizeUsername(payload.username);
    const password = typeof payload.password === "string" ? payload.password : "";

    if (displayName.length < 2) return Response.json({ error: "O nick precisa ter pelo menos 2 caracteres." }, { status: 400 });
    if (!validUsername(username)) return Response.json({ error: "Use de 3 a 24 letras, números ou _ no usuário." }, { status: 400 });
    if (password.length < 6 || password.length > 128) return Response.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });

    const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (exists) return Response.json({ error: "Este usuário já está em uso." }, { status: 409 });

    const id = crypto.randomUUID();
    const passwordData = await hashPassword(password);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO users
        (id, username, display_name, password_hash, password_salt, password_iterations, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, username, displayName, passwordData.hash, passwordData.salt, passwordData.iterations, now).run();

    const session = await createSession(id);
    return Response.json(
      { user: { id, username, displayName } },
      { status: 201, headers: { "set-cookie": sessionCookie(request, session.token, session.maxAge) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar a conta.";
    if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "Este usuário já está em uso." }, { status: 409 });
    console.error("registration_failed", error instanceof Error ? { name: error.name, message: error.message } : "unknown_error");
    return Response.json({ error: "Não foi possível criar a conta." }, { status: 500 });
  }
}
