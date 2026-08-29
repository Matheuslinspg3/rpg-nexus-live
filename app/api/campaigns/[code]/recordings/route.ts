import { db, getMembership, requireUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };

export async function GET(_: Request, context: Context) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await getMembership(code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const supabase = db();
  const { data: sessions, error: sessionsError } = await supabase
    .from("recording_sessions")
    .select("id, campaign_code, voice_channel_id, started_at, stopped_at, status, part_count")
    .eq("campaign_id", member.campaignId)
    .eq("status", "ready")
    .order("started_at", { ascending: false })
    .limit(50);
  if (sessionsError) return Response.json({ error: "Não foi possível carregar as gravações." }, { status: 500 });
  if (!sessions?.length) return Response.json({ recordings: [] });

  const ids = sessions.map((session) => session.id);
  const { data: parts, error: partsError } = await supabase
    .from("recording_parts")
    .select("id, session_id, part_number, file_name, size_bytes, duration_seconds, storage_path")
    .in("session_id", ids)
    .order("part_number", { ascending: true });
  if (partsError) return Response.json({ error: "Não foi possível carregar as partes do áudio." }, { status: 500 });

  const bySession = new Map<string, any[]>();
  for (const part of parts || []) {
    const { data: signed, error } = await supabase.storage.from("session-audio").createSignedUrl(part.storage_path, 3600);
    if (!error && signed?.signedUrl) {
      const list = bySession.get(part.session_id) || [];
      list.push({ id: part.id, partNumber: part.part_number, fileName: part.file_name, sizeBytes: part.size_bytes, durationSeconds: part.duration_seconds, url: signed.signedUrl });
      bySession.set(part.session_id, list);
    }
  }

  return Response.json({
    recordings: sessions.map((session) => ({
      id: session.id, campaignCode: session.campaign_code, voiceChannelId: session.voice_channel_id,
      startedAt: session.started_at, stoppedAt: session.stopped_at, partCount: session.part_count,
      parts: bySession.get(session.id) || [],
    })),
  });
}
