import { requireUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Permissões: ler/enviar texto, anexar arquivos e conectar/falar no canal de voz.
const BOT_PERMISSIONS = "36817936";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para conectar o Discord." }, { status: 401 });

  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) return Response.json({ error: "A integração Discord ainda não foi configurada pelo administrador." }, { status: 503 });

  const installUrl = new URL("https://discord.com/oauth2/authorize");
  installUrl.searchParams.set("client_id", clientId);
  installUrl.searchParams.set("scope", "bot applications.commands");
  installUrl.searchParams.set("permissions", BOT_PERMISSIONS);
  return Response.redirect(installUrl.toString(), 302);
}
