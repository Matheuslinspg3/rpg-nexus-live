import { requireUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Permissões: ler/enviar texto, anexar arquivos e conectar/falar no canal de voz.
const BOT_PERMISSIONS = "36817936";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para conectar o Discord." }, { status: 401 });

  const clientId = [
    process.env.DISCORD_CLIENT_ID,
    process.env.DISCORD_APPLICATION_ID,
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  ].find((value) => typeof value === "string" && value.trim().length > 0)?.trim();

  if (!clientId) {
    return new Response(
      "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Configuração do Discord pendente</title></head><body style=\"font-family:system-ui;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5\"><h1>Configuração do Discord pendente</h1><p>O administrador ainda precisa cadastrar o Application ID do bot na Vercel.</p><p>Variável esperada: <code>DISCORD_CLIENT_ID</code>.</p><p>Depois de salvar a variável, faça um novo deploy e tente novamente.</p><p><a href=\"/\">Voltar ao RPG Nexus</a></p></body></html>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const installUrl = new URL("https://discord.com/oauth2/authorize");
  installUrl.searchParams.set("client_id", clientId);
  installUrl.searchParams.set("scope", "bot applications.commands");
  installUrl.searchParams.set("permissions", BOT_PERMISSIONS);
  return Response.redirect(installUrl.toString(), 302);
}
