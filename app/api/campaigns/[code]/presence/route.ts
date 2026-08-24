import { requireUser, db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

function colorFor(value: string) {
  const colors = ["#77E3C4", "#F29AB2", "#C6A6FF", "#F4C76A", "#75B8FF", "#FF916F"];
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

function unit(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

async function getMembershipId(supabase: any, code: string, email: string) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", code.toUpperCase())
    .eq("campaign_members.email", email)
    .single();
  if (!data) return null;
  return { campaignId: data.id as string, role: (data.campaign_members as any[])[0].role as "master" | "player" };
}

export async function GET(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const supabase = db();
  const member = await getMembershipId(supabase, rawCode, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const cutoff = new Date(Date.now() - 18_000).toISOString();
  const { data: rows, error } = await supabase
    .from("presence")
    .select("email, display_name, role, color, cursor_x, cursor_y, editing_field, active_at")
    .eq("campaign_id", member.campaignId)
    .gte("active_at", cutoff)
    .order("email", { ascending: true });

  if (error) return Response.json({ error: "Não foi possível carregar a presença." }, { status: 500 });

  return Response.json({
    presence: (rows || []).map((p: any) => ({
      email: p.email,
      displayName: p.display_name,
      role: p.role,
      color: p.color,
      cursorX: p.cursor_x,
      cursorY: p.cursor_y,
      editingField: p.editing_field,
      activeAt: p.active_at,
    })),
  });
}

export async function POST(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const payload = (await request.json()) as { cursorX?: number; cursorY?: number; editingField?: string | null };
  const supabase = db();
  const member = await getMembershipId(supabase, rawCode, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const editingField = typeof payload.editingField === "string" ? payload.editingField.slice(0, 80) : null;
  const now = new Date().toISOString();

  const { error } = await supabase.from("presence").upsert({
    campaign_id: member.campaignId,
    email: user.email,
    display_name: user.displayName,
    role: member.role,
    color: colorFor(user.email),
    cursor_x: unit(payload.cursorX),
    cursor_y: unit(payload.cursorY),
    editing_field: editingField,
    active_at: now,
  });

  if (error) return Response.json({ error: "Não foi possível atualizar a presença." }, { status: 500 });

  return Response.json({ ok: true });
}
