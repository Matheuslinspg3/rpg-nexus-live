import { requireUser, db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  code: string;
  name: string;
  system: string;
  masterName: string;
  role: "master" | "player";
  memberCount: number;
  updatedAt: string;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function campaignCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

function cleanName(value: unknown, max = 64) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro inesperado";
  return message.includes("no such table") ? "O banco da campanha ainda não foi preparado." : message;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  try {
    const supabase = db();
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, code, name, system, master_name, updated_at, campaign_members!inner(role)")
      .eq("campaign_members.email", user.email)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const campaigns: CampaignRow[] = (data || []).map((c: any) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      system: c.system,
      masterName: c.master_name,
      role: (c.campaign_members as any[])?.[0]?.role || "player",
      memberCount: 0,
      updatedAt: c.updated_at,
    }));

    if (campaigns.length) {
      const ids = campaigns.map((c) => c.id);
      const { data: mc } = await supabase.from("campaign_members").select("campaign_id").in("campaign_id", ids);
      const countMap = new Map<string, number>();
      for (const row of mc || []) countMap.set(row.campaign_id, (countMap.get(row.campaign_id) || 0) + 1);
      for (const c of campaigns) c.memberCount = countMap.get(c.id) || 0;
    }

    return Response.json({ campaigns });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  try {
    const payload = (await request.json()) as {
      action?: "create" | "join";
      name?: string;
      system?: string;
      code?: string;
    };
    const now = new Date().toISOString();
    const supabase = db();

    if (payload.action === "create") {
      const name = cleanName(payload.name);
      const system = cleanName(payload.system, 32) || "Nimble RPG";
      if (!name) return Response.json({ error: "Dê um nome à campanha." }, { status: 400 });

      const id = crypto.randomUUID();
      let code = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = campaignCode();
        const { data: existing } = await supabase.from("campaigns").select("id").eq("code", candidate).single();
        if (!existing) { code = candidate; break; }
      }
      if (!code) throw new Error("Não foi possível gerar um código de campanha.");

      const { error: campaignError } = await supabase.from("campaigns").insert({
        id, code, name, system,
        master_email: user.email,
        master_name: user.displayName,
        version: 0, created_at: now, updated_at: now,
      });
      if (campaignError) throw campaignError;

      const { error: memberError } = await supabase.from("campaign_members").insert({
        campaign_id: id, email: user.email, display_name: user.displayName, role: "master", joined_at: now,
      });
      if (memberError) throw memberError;

      return Response.json({ code }, { status: 201 });
    }

    if (payload.action === "join") {
      const code = cleanName(payload.code, 8).toUpperCase();
      if (!code) return Response.json({ error: "Informe o código da campanha." }, { status: 400 });

      const { data: campaign, error: campaignError } = await supabase.from("campaigns").select("id").eq("code", code).single();
      if (campaignError || !campaign) return Response.json({ error: "Campanha não encontrada. Confira o código." }, { status: 404 });

      const { data: current } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaign.id).eq("email", user.email).single();
      if (!current) {
        const { error: insertError } = await supabase.from("campaign_members").insert({
          campaign_id: campaign.id, email: user.email, display_name: user.displayName, role: "player", joined_at: now,
        });
        if (insertError) throw insertError;
      }

      return Response.json({ code });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
