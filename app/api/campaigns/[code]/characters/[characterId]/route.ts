import { requireUser, db } from "@/lib/api-helpers";
import { isNimbleLayout } from "../../../../../nimbleLayouts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string; characterId: string }> };

const ALLOWED_FIELDS = new Set([
  "characterName", "ancestryClassLevel", "heightWeightSpeed", "hitDice",
  "str", "dex", "int", "wil", "hpCurrent", "hpMax", "tempHp", "armor",
  "initiative", "wound1", "wound2", "wound3", "wound4", "wound5",
  "arcana", "examination", "finesse", "influence", "insight", "lore",
  "might", "naturecraft", "perception", "stealth", "features", "spells", "notes",
  "classLayout", "proficiencies", "classFeatures", "classResource1Current",
  "classResource1Max", "classResource2Current", "classResource2Max", "spellTier",
  "portraitUrl", "level", "subclass", "size", "speed",
]);

type Access = {
  campaignId: string;
  role: "master" | "player";
  assignedUserId: string | null;
};

async function characterAccess(supabase: any, code: string, characterId: string, email: string) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role), characters!inner(assigned_user_id)")
    .eq("code", code.toUpperCase())
    .eq("campaign_members.email", email)
    .eq("characters.id", characterId)
    .single();
  if (!data) return null;
  return {
    campaignId: data.id as string,
    role: (data.campaign_members as any[])[0].role as "master" | "player",
    assignedUserId: (data.characters as any[])[0].assigned_user_id as string | null,
  };
}

function canOpen(access: Access | null, email: string) {
  return Boolean(access && (access.role === "master" || access.assignedUserId === email));
}

export async function GET(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code, characterId } = await context.params;
  const supabase = db();
  const access = await characterAccess(supabase, code, characterId, user.email);
  if (!canOpen(access, user.email)) return Response.json({ error: "Esta ficha não foi atribuída a você." }, { status: 403 });

  const { data: rows, error } = await supabase
    .from("character_fields")
    .select("field_key, field_value")
    .eq("character_id", characterId)
    .eq("campaign_id", access!.campaignId);

  if (error) return Response.json({ error: "Não foi possível carregar a ficha." }, { status: 500 });

  return Response.json({
    fields: Object.fromEntries((rows || []).map((row: any) => [row.field_key, row.field_value])),
  });
}

export async function PATCH(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code, characterId } = await context.params;
  const payload = (await request.json()) as {
    field?: unknown;
    value?: unknown;
    name?: unknown;
    assignedUserId?: unknown;
  };
  const supabase = db();
  const access = await characterAccess(supabase, code, characterId, user.email);
  if (!access) return Response.json({ error: "Ficha não encontrada." }, { status: 404 });
  const now = new Date().toISOString();

  if (typeof payload.field === "string") {
    if (!canOpen(access, user.email)) return Response.json({ error: "Esta ficha não foi atribuída a você." }, { status: 403 });
    if (!ALLOWED_FIELDS.has(payload.field)) return Response.json({ error: "Campo inválido." }, { status: 400 });
    const value = typeof payload.value === "string" ? payload.value.slice(0, 12000) : String(payload.value ?? "");
    if (payload.field === "classLayout") {
      if (access.role !== "master") return Response.json({ error: "Apenas o Mestre pode trocar o layout da ficha." }, { status: 403 });
      if (!isNimbleLayout(value)) return Response.json({ error: "Escolha um layout Nimble válido." }, { status: 400 });
    }
    if (payload.field === "classFeatures") {
      try {
        const features = JSON.parse(value) as unknown;
        if (!Array.isArray(features) || features.some((feature) => typeof feature !== "string")) throw new Error("invalid");
      } catch {
        return Response.json({ error: "Seleção de habilidades inválida." }, { status: 400 });
      }
    }
    const { error } = await supabase.from("character_fields").upsert({
      character_id: characterId,
      campaign_id: access.campaignId,
      field_key: payload.field,
      field_value: value,
      updated_by: user.email,
      updated_by_name: user.displayName,
      updated_at: now,
    });
    if (error) return Response.json({ error: "Não foi possível salvar o campo." }, { status: 500 });

    const { data: current } = await supabase.from("campaigns").select("version").eq("id", access.campaignId).single();
    await supabase.from("characters").update({ updated_at: now }).eq("id", characterId);
    await supabase.from("campaigns").update({ version: (current?.version ?? 0) + 1, updated_at: now }).eq("id", access.campaignId);

    return Response.json({ ok: true, updatedAt: now });
  }

  if (access.role !== "master") return Response.json({ error: "Apenas o Mestre pode organizar as fichas." }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 64) : "";
    if (!name) return Response.json({ error: "Dê um nome à ficha." }, { status: 400 });
    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignedUserId")) {
    const assignedUserId = typeof payload.assignedUserId === "string" && payload.assignedUserId ? payload.assignedUserId : null;
    if (assignedUserId) {
      const { data: player } = await supabase
        .from("campaign_members")
        .select("email")
        .eq("campaign_id", access.campaignId)
        .eq("email", assignedUserId)
        .eq("role", "player")
        .single();
      if (!player) return Response.json({ error: "Escolha um Player desta campanha." }, { status: 400 });
    }
    updates.assigned_user_id = assignedUserId;
  }

  if (Object.keys(updates).length === 0) return Response.json({ error: "Nenhuma alteração recebida." }, { status: 400 });

  const { data: current } = await supabase.from("campaigns").select("version").eq("id", access.campaignId).single();
  await supabase.from("characters").update({ ...updates, updated_at: now }).eq("id", characterId).eq("campaign_id", access.campaignId);
  await supabase.from("campaigns").update({ version: (current?.version ?? 0) + 1, updated_at: now }).eq("id", access.campaignId);

  return Response.json({ ok: true, updatedAt: now });
}
