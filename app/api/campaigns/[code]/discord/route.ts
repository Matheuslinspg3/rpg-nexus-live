import { db, getMembership, requireUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };
type DiscordIntegration = { enabled: boolean; guildId: string; rpgChannelId: string; audiovisualChannelId: string; announcementsChannelId: string; musicChannelId: string };

const EMPTY: DiscordIntegration = { enabled: false, guildId: "", rpgChannelId: "", audiovisualChannelId: "", announcementsChannelId: "", musicChannelId: "" };
const keys = ["guildId", "rpgChannelId", "audiovisualChannelId", "announcementsChannelId", "musicChannelId"] as const;

function parse(value: unknown): DiscordIntegration {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pick = (key: typeof keys[number]) => typeof source[key] === "string" ? source[key].trim().slice(0, 32) : "";
  return { enabled: source.enabled === true, guildId: pick("guildId"), rpgChannelId: pick("rpgChannelId"), audiovisualChannelId: pick("audiovisualChannelId"), announcementsChannelId: pick("announcementsChannelId"), musicChannelId: pick("musicChannelId") };
}

export async function GET(_: Request, context: Context) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await getMembership(code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const { data } = await db().from("discord_campaign_integrations").select("*").eq("campaign_id", member.campaignId).single();
  return Response.json({ integration: data ? { enabled: data.enabled, guildId: data.guild_id || "", rpgChannelId: data.rpg_channel_id || "", audiovisualChannelId: data.audiovisual_channel_id || "", announcementsChannelId: data.announcements_channel_id || "", musicChannelId: data.music_channel_id || "" } : EMPTY, canManage: member.role === "master", pvrpExcluded: true });
}

export async function PUT(request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await getMembership(code, user.email);
  if (!member || member.role !== "master") return Response.json({ error: "Somente o Mestre pode configurar o Discord." }, { status: 403 });
  const integration = parse((await request.json() as { integration?: unknown }).integration);
  if (integration.enabled && (!integration.guildId || !integration.rpgChannelId || !integration.announcementsChannelId)) return Response.json({ error: "Informe servidor, canal RPG e canal de avisos." }, { status: 400 });
  const { error } = await db().from("discord_campaign_integrations").upsert({ campaign_id: member.campaignId, enabled: integration.enabled, guild_id: integration.guildId || null, rpg_channel_id: integration.rpgChannelId || null, audiovisual_channel_id: integration.audiovisualChannelId || null, announcements_channel_id: integration.announcementsChannelId || null, music_channel_id: integration.musicChannelId || null, updated_by: user.email, updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: "Não foi possível salvar a integração." }, { status: 500 });
  return Response.json({ ok: true, integration, pvrpExcluded: true });
}