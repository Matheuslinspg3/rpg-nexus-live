import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../auth";

export const dynamic = "force-dynamic";

// View/send/read text, attach audio files, connect/speak in voice, and create
// the optional recordings channel. Administrator is intentionally excluded.
const BOT_PERMISSIONS = "36817936";

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para conectar o Discord." }, { status: 401 });

  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const clientId = runtimeEnv.DISCORD_CLIENT_ID?.trim();
  if (!clientId) {
    return Response.json({ error: "A integração Discord ainda não foi configurada pelo administrador." }, { status: 503 });
  }

  const installUrl = new URL("https://discord.com/oauth2/authorize");
  installUrl.searchParams.set("client_id", clientId);
  installUrl.searchParams.set("scope", "bot applications.commands");
  installUrl.searchParams.set("permissions", BOT_PERMISSIONS);

  return Response.redirect(installUrl.toString(), 302);
}
