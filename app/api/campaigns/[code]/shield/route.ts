import { requireUser, db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { campaignId: string; role: "master" | "player" };
type ModuleId = "characters" | "cameras" | "scene" | "dice" | "recordings" | "text" | "youtube" | "pdf";
type ModuleSpan = 4 | 6 | 8 | 12;
type ShieldLayout = {
  order: ModuleId[];
  hidden: ModuleId[];
  spans: Partial<Record<ModuleId, ModuleSpan>>;
  openCharacterIds: string[];
  textNote: string;
  youtubeUrl: string;
  pdfUrl: string;
};

const MODULES = new Set<ModuleId>(["characters", "cameras", "scene", "dice", "recordings", "text", "youtube", "pdf"]);
const MODULE_SPANS: Record<ModuleId, ModuleSpan> = { characters: 8, cameras: 8, scene: 4, dice: 4, recordings: 8, text: 4, youtube: 4, pdf: 4 };
const DEFAULT_LAYOUT: ShieldLayout = {
  order: ["characters", "cameras", "scene", "dice", "recordings", "text", "youtube", "pdf"],
  hidden: [],
  spans: MODULE_SPANS,
  openCharacterIds: [],
  textNote: "Anotações rápidas do Mestre...",
  youtubeUrl: "",
  pdfUrl: "",
};

async function membership(supabase: any, code: string, email: string): Promise<Membership | null> {
  const { data } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", code.toUpperCase())
    .eq("campaign_members.email", email)
    .single();
  if (!data) return null;
  return { campaignId: data.id as string, role: (data.campaign_members as any[])[0].role as "master" | "player" };
}

function parseLayout(value: unknown): ShieldLayout {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const requestedOrder = Array.isArray(source.order)
    ? source.order.filter((item): item is ModuleId => typeof item === "string" && MODULES.has(item as ModuleId))
    : [];
  const uniqueOrder = [...new Set(requestedOrder)];
  const order = [...uniqueOrder, ...DEFAULT_LAYOUT.order.filter((item) => !uniqueOrder.includes(item))];
  const hidden = Array.isArray(source.hidden)
    ? [...new Set(source.hidden.filter((item): item is ModuleId => typeof item === "string" && MODULES.has(item as ModuleId)))]
    : [];
  const openCharacterIds = Array.isArray(source.openCharacterIds)
    ? [...new Set(source.openCharacterIds.filter((item): item is string => typeof item === "string" && item.length <= 80))].slice(0, 12)
    : [];
  const spansSource = source.spans && typeof source.spans === "object" ? source.spans as Record<string, unknown> : {};
  const spans = { ...MODULE_SPANS } as Partial<Record<ModuleId, ModuleSpan>>;
  for (const id of MODULES) {
    const span = spansSource[id];
    if (span === 4 || span === 6 || span === 8 || span === 12) spans[id] = span;
  }
  const cleanText = typeof source.textNote === "string" ? source.textNote.slice(0, 8000) : DEFAULT_LAYOUT.textNote;
  const cleanUrl = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 500) : "";
  return { order, hidden, spans, openCharacterIds, textNote: cleanText, youtubeUrl: cleanUrl(source.youtubeUrl), pdfUrl: cleanUrl(source.pdfUrl) };
}

export async function GET(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await membership(supabase, code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const { data: row } = await supabase
    .from("shield_layouts")
    .select("layout_json")
    .eq("campaign_id", member.campaignId)
    .eq("user_id", user.email)
    .eq("shield_type", member.role)
    .single();

  if (!row) return Response.json({ layout: DEFAULT_LAYOUT, shieldType: member.role });
  try {
    return Response.json({ layout: parseLayout(JSON.parse(row.layout_json)), shieldType: member.role });
  } catch {
    return Response.json({ layout: DEFAULT_LAYOUT, shieldType: member.role });
  }
}

export async function PUT(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await membership(supabase, code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const payload = (await request.json()) as { layout?: unknown };
  const layout = parseLayout(payload.layout);
  const now = new Date().toISOString();

  const { error } = await supabase.from("shield_layouts").upsert({
    campaign_id: member.campaignId,
    user_id: user.email,
    shield_type: member.role,
    layout_json: JSON.stringify(layout),
    updated_at: now,
  });
  if (error) return Response.json({ error: "Não foi possível salvar o layout." }, { status: 500 });

  return Response.json({ ok: true, layout, shieldType: member.role });
}
