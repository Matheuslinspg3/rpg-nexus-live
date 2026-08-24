import { requireUser, db } from "@/lib/api-helpers";
import { getNimbleLayout, isNimbleLayout } from "../../../../nimbleLayouts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

export async function POST(request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const payload = (await request.json()) as { name?: unknown; layout?: unknown };
  const name = cleanName(payload.name);
  if (!name) return Response.json({ error: "Dê um nome à ficha." }, { status: 400 });
  const layoutId = payload.layout ?? "BASE";
  if (!isNimbleLayout(layoutId)) return Response.json({ error: "Escolha um layout Nimble válido." }, { status: 400 });
  const layout = getNimbleLayout(layoutId);

  const supabase = db();
  const { data: membership, error: meError } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", rawCode.toUpperCase())
    .eq("campaign_members.email", user.email)
    .single();

  if (meError || !membership) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const role = (membership.campaign_members as any[])[0].role;
  if (role !== "master") return Response.json({ error: "Apenas o Mestre pode criar fichas." }, { status: 403 });

  const campaignId = membership.id as string;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: charError } = await supabase.from("characters").insert({
    id,
    campaign_id: campaignId,
    name,
    assigned_user_id: null,
    created_by: user.email,
    created_at: now,
    updated_at: now,
  });
  if (charError) return Response.json({ error: "Não foi possível criar a ficha." }, { status: 500 });

  const fieldRows = [
    { character_id: id, campaign_id: campaignId, field_key: "classLayout", field_value: layout.id, updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
    { character_id: id, campaign_id: campaignId, field_key: "proficiencies", field_value: layout.proficiencies, updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
    { character_id: id, campaign_id: campaignId, field_key: "classFeatures", field_value: "[]", updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
  ];
  const { error: fieldsError } = await supabase.from("character_fields").insert(fieldRows);
  if (fieldsError) return Response.json({ error: "Não foi possível inicializar a ficha." }, { status: 500 });

  const { data: current } = await supabase.from("campaigns").select("version").eq("id", campaignId).single();
  const { error: verError } = await supabase
    .from("campaigns")
    .update({ version: (current?.version ?? 0) + 1, updated_at: now })
    .eq("id", campaignId);
  if (verError) return Response.json({ error: "Não foi possível atualizar a campanha." }, { status: 500 });

  return Response.json(
    { character: { id, name, assignedUserId: null, assignedDisplayName: null, updatedAt: now } },
    { status: 201 },
  );
}
