import { db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

function allowed(request: Request) {
  const expected = process.env.CIANNA_BOT_API_KEY;
  const received = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  return Boolean(expected && received && received === expected);
}

export async function POST(request: Request, context: Context) {
  if (!allowed(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { status?: unknown; errorMessage?: unknown; partIds?: unknown };
  const status = body.status === "failed" ? "failed" : "ready";
  const supabase = db();
  const { data: session } = await supabase.from("recording_sessions").select("id, part_count").eq("id", id).single();
  if (!session) return Response.json({ error: "Gravação não encontrada." }, { status: 404 });

  if (status === "ready") {
    const partIds = Array.isArray(body.partIds) ? body.partIds.filter((value): value is string => typeof value === "string") : [];
    const { data: parts } = await supabase.from("recording_parts").select("id").eq("session_id", id);
    const expected = new Set((parts || []).map((part) => part.id));
    if (partIds.length !== expected.size || partIds.some((partId) => !expected.has(partId))) return Response.json({ error: "Nem todas as partes foram enviadas." }, { status: 400 });
  }

  const { error } = await supabase.from("recording_sessions").update({
    status,
    error_message: status === "failed" ? (typeof body.errorMessage === "string" ? body.errorMessage.slice(0, 500) : "Falha no upload.") : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return Response.json({ error: "Não foi possível finalizar a gravação." }, { status: 500 });
  return Response.json({ ok: true, recordingId: id, status });
}
