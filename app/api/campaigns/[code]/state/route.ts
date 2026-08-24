import { requireUser, db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

const ALLOWED_FIELDS = new Set([
  "characterName", "ancestryClassLevel", "heightWeightSpeed", "hitDice",
  "str", "dex", "int", "wil", "hpCurrent", "hpMax", "tempHp", "armor",
  "initiative", "wound1", "wound2", "wound3", "wound4", "wound5",
  "arcana", "examination", "finesse", "influence", "insight", "lore",
  "might", "naturecraft", "perception", "stealth", "features", "spells", "notes",
]);

export async function PATCH(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const payload = (await request.json()) as { field?: string; value?: unknown };
  const field = typeof payload.field === "string" ? payload.field : "";
  const value = typeof payload.value === "string" ? payload.value.slice(0, 12000) : String(payload.value ?? "");
  if (!ALLOWED_FIELDS.has(field)) return Response.json({ error: "Campo inválido." }, { status: 400 });

  const supabase = db();
  const { data: membership, error: meError } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", rawCode.toUpperCase())
    .eq("campaign_members.email", user.email)
    .single();
  if (meError || !membership) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const campaignId = membership.id as string;
  const now = new Date().toISOString();

  const { error: fieldError } = await supabase.from("sheet_fields").upsert({
    campaign_id: campaignId,
    field_key: field,
    field_value: value,
    updated_by: user.email,
    updated_by_name: user.displayName,
    updated_at: now,
  });
  if (fieldError) return Response.json({ error: "Não foi possível salvar o campo." }, { status: 500 });

  const { data: current } = await supabase.from("campaigns").select("version").eq("id", campaignId).single();
  const { error: verError } = await supabase
    .from("campaigns")
    .update({ version: (current?.version ?? 0) + 1, updated_at: now })
    .eq("id", campaignId);
  if (verError) return Response.json({ error: "Não foi possível atualizar a campanha." }, { status: 500 });

  return Response.json({ ok: true, changes: 1, updatedAt: now });
}
