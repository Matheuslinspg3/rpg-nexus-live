import { requireUser, db } from "@/lib/api-helpers";
import { getNimbleLayout, isNimbleLayout } from "../../../../nimbleLayouts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

function characterDatabaseError(stage: string, error: any) {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "Erro desconhecido do Supabase.";
  const detail = typeof error?.details === "string" ? error.details : "";

  console.error(`Character creation failed at ${stage}:`, { code, message, detail, hint: error?.hint });

  if (code === "42P01" || /relation .* does not exist|table .* does not exist/i.test(message)) {
    return `O banco não possui a tabela necessária para fichas (${stage}). Execute o schema de characters no Supabase.`;
  }
  if (code === "PGRST204" || /column .* does not exist/i.test(message)) {
    return `A tabela de fichas está desatualizada: falta uma coluna em ${stage}. Detalhe: ${message}`;
  }
  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "O Supabase bloqueou a gravação da ficha. Verifique SUPABASE_SERVICE_ROLE_KEY no Vercel.";
  }
  if (code === "23503") {
    return "A campanha desta ficha não existe mais no banco. Saia e entre novamente na mesa.";
  }
  if (code === "23502") {
    return `O banco exige um campo ausente ao criar a ficha (${stage}). Detalhe: ${message}`;
  }

  return `Falha no banco ao criar a ficha (${stage}). Detalhe: ${message}`;
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
  if (charError) {
    return Response.json({ error: characterDatabaseError("characters", charError) }, { status: 500 });
  }

  const fieldRows = [
    { character_id: id, campaign_id: campaignId, field_key: "classLayout", field_value: layout.id, updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
    { character_id: id, campaign_id: campaignId, field_key: "proficiencies", field_value: layout.proficiencies, updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
    { character_id: id, campaign_id: campaignId, field_key: "classFeatures", field_value: "[]", updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
  ];
  const { error: fieldsError } = await supabase.from("character_fields").insert(fieldRows);
  if (fieldsError) {
    // Do not leave a character that cannot be opened because its base fields failed.
    const { error: rollbackError } = await supabase.from("characters").delete().eq("id", id);
    if (rollbackError) console.error("Could not rollback incomplete character:", rollbackError);
    return Response.json({ error: characterDatabaseError("character_fields", fieldsError) }, { status: 500 });
  }

  const { data: current } = await supabase.from("campaigns").select("version").eq("id", campaignId).single();
  const { error: verError } = await supabase
    .from("campaigns")
    .update({ version: (current?.version ?? 0) + 1, updated_at: now })
    .eq("id", campaignId);
  if (verError) {
    console.error("Could not update campaign version after character creation:", verError);
    // The character is valid even if the optional version counter could not be incremented.
  }

  return Response.json(
    { character: { id, name, assignedUserId: null, assignedDisplayName: null, updatedAt: now } },
    { status: 201 },
  );
}
