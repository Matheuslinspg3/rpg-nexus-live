import { db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const BUCKET = "session-audio";
type AudioPartInput = { fileName?: unknown; sizeBytes?: unknown; durationSeconds?: unknown };

function allowed(request: Request) {
  const expected = process.env.CIANNA_BOT_API_KEY;
  const received = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  return Boolean(expected && received && received === expected);
}

function cleanCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().slice(0, 16) : "";
}

function cleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanIso(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function uploadUrl(path: string, token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\\/$/, "");
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada.");
  const encodedPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return supabaseUrl + "/storage/v1/object/upload/sign/" + BUCKET + "/" + encodedPath + "?token=" + encodeURIComponent(token);
}

export async function POST(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    code?: unknown; guildId?: unknown; voiceChannelId?: unknown; startedAt?: unknown; stoppedAt?: unknown; parts?: unknown;
  } | null;
  const code = cleanCode(body?.code);
  const guildId = cleanText(body?.guildId, 32);
  const voiceChannelId = cleanText(body?.voiceChannelId, 32);
  const parts = Array.isArray(body?.parts) ? body.parts.slice(0, 100) as AudioPartInput[] : [];
  if (!code || !guildId || parts.length === 0) return Response.json({ error: "Código, servidor e partes de áudio são obrigatórios." }, { status: 400 });

  const supabase = db();
  const { data: campaign } = await supabase.from("campaigns").select("id, code").eq("code", code).single();
  if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  const { data: integration } = await supabase.from("discord_campaign_integrations").select("enabled, guild_id, recording_text_channel_id").eq("campaign_id", campaign.id).single();
  if (!integration?.enabled) return Response.json({ error: "Integração Discord não ativada nesta campanha." }, { status: 409 });
  if (integration.guild_id !== guildId) return Response.json({ error: "A campanha está vinculada a outro servidor Discord." }, { status: 409 });

  const sessionId = crypto.randomUUID();
  const startedAt = cleanIso(body?.startedAt, new Date().toISOString());
  const stoppedAt = cleanIso(body?.stoppedAt, new Date().toISOString());
  const { error: sessionError } = await supabase.from("recording_sessions").insert({
    id: sessionId, campaign_id: campaign.id, campaign_code: code, guild_id: guildId,
    voice_channel_id: voiceChannelId || null, started_at: startedAt, stopped_at: stoppedAt,
    status: "uploading", part_count: parts.length,
  });
  if (sessionError) return Response.json({ error: "Não foi possível criar o registro da gravação." }, { status: 500 });

  const prepared: Array<{ id: string; partNumber: number; path: string; fileName: string; uploadUrl: string; sizeBytes: number; durationSeconds: number | null }> = [];
  try {
    for (let index = 0; index < parts.length; index += 1) {
      const input = parts[index] || {};
      const partNumber = index + 1;
      const fileName = cleanText(input.fileName, 140).replace(/[^a-zA-Z0-9._-]/g, "_") || ("session-part-" + String(partNumber).padStart(3, "0") + ".ogg");
      const path = campaign.id + "/recordings/" + sessionId + "/" + String(partNumber).padStart(3, "0") + "-" + fileName;
      const sizeBytes = Math.max(0, Number(input.sizeBytes) || 0);
      const durationSeconds = Number.isFinite(Number(input.durationSeconds)) ? Math.max(0, Math.round(Number(input.durationSeconds))) : null;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token) throw error || new Error("Não foi possível criar URL temporária.");
      const id = crypto.randomUUID();
      prepared.push({ id, partNumber, path, fileName, uploadUrl: uploadUrl(path, data.token), sizeBytes, durationSeconds });
    }
    const { error: partsError } = await supabase.from("recording_parts").insert(prepared.map((part) => ({
      id: part.id, session_id: sessionId, part_number: part.partNumber, file_name: part.fileName,
      storage_path: part.path, content_type: "audio/ogg", size_bytes: part.sizeBytes, duration_seconds: part.durationSeconds,
    })));
    if (partsError) throw partsError;
  } catch (error) {
    await supabase.from("recording_sessions").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Falha ao preparar upload.", updated_at: new Date().toISOString() }).eq("id", sessionId);
    return Response.json({ error: "Não foi possível preparar o upload do áudio." }, { status: 500 });
  }

  return Response.json({
    recordingId: sessionId,
    bucket: BUCKET,
    recordingTextChannelId: integration.recording_text_channel_id || null,
    parts: prepared,
  });
}
