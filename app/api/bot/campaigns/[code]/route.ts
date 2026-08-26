import { db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };

function allowed(request: Request) {
  const expected = process.env.CIANNA_BOT_API_KEY;
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && received && received === expected);
}

export async function GET(request: Request, context: Context) {
  if (!allowed(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const { code } = await context.params;
  const { data: campaign } = await db().from("campaigns").select("id, code, name, system, master_name").eq("code", code.toUpperCase()).single();
  if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  const { data: integration } = await db().from("discord_campaign_integrations").select("*").eq("campaign_id", campaign.id).single();
  if (!integration?.enabled) return Response.json({ error: "Integração Discord não ativada nesta campanha." }, { status: 409 });
  return Response.json({ campaign: { code: campaign.code, name: campaign.name, system: campaign.system, masterName: campaign.master_name }, channels: { guildId: integration.guild_id, audiovisualChannelId: integration.audiovisual_channel_id, audiovisualVoiceChannelId: integration.audiovisual_voice_channel_id, diceChannelId: integration.dice_channel_id, musicChannelId: integration.music_channel_id }, policy: { pvrp: "excluded", dice: "rollem", music: "external-bot" } });
}