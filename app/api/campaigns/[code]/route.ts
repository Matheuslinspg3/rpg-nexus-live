import { requireUser, db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

type Campaign = {
  id: string;
  code: string;
  name: string;
  system: string;
  masterName: string;
  version: number;
  role: "master" | "player";
  updatedAt: string;
};

type Character = {
  id: string;
  name: string;
  assignedUserId: string | null;
  assignedDisplayName: string | null;
  updatedAt: string;
};

export async function GET(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const supabase = db();
  const { code: rawCode } = await context.params;
  const code = rawCode.toUpperCase();

  const { data: campaignData, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, code, name, system, master_name, version, updated_at, campaign_members!inner(role)")
    .eq("code", code)
    .eq("campaign_members.email", user.email)
    .single();

  if (campaignError || !campaignData) {
    return Response.json({ error: "Você não participa desta campanha." }, { status: 403 });
  }

  const campaign: Campaign = {
    id: campaignData.id,
    code: campaignData.code,
    name: campaignData.name,
    system: campaignData.system,
    masterName: campaignData.master_name,
    version: campaignData.version,
    role: (campaignData.campaign_members as any[])[0].role,
    updatedAt: campaignData.updated_at,
  };

  const cutoff = new Date(Date.now() - 18_000).toISOString();

  const charactersQuery = supabase
    .from("characters")
    .select("id, name, assigned_user_id, updated_at, campaign_members(display_name)")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: true });

  if (campaign.role !== "master") charactersQuery.eq("assigned_user_id", user.email);

  const { data: charactersData } = await charactersQuery;

  const characters: Character[] = (charactersData || []).map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    assignedUserId: ch.assigned_user_id,
    assignedDisplayName: ch.campaign_members?.[0]?.display_name || null,
    updatedAt: ch.updated_at,
  }));

  const { data: membersData } = await supabase
    .from("campaign_members")
    .select("email, display_name, role")
    .eq("campaign_id", campaign.id)
    .order("joined_at", { ascending: true });

  const members = (membersData || []).map((m: any) => ({
    email: m.email,
    displayName: m.display_name,
    role: m.role as "master" | "player",
  }));

  members.sort((a, b) => {
    if (a.role === "master" && b.role !== "master") return -1;
    if (a.role !== "master" && b.role === "master") return 1;
    return 0;
  });

  const { data: presenceData } = await supabase
    .from("presence")
    .select("email, display_name, role, color, cursor_x, cursor_y, editing_field, active_at")
    .eq("campaign_id", campaign.id)
    .gte("active_at", cutoff);

  const presence = (presenceData || []).map((p: any) => ({
    email: p.email,
    displayName: p.display_name,
    role: p.role,
    color: p.color,
    cursorX: p.cursor_x,
    cursorY: p.cursor_y,
    editingField: p.editing_field,
    activeAt: p.active_at,
  }));

  return Response.json({
    campaign,
    characters,
    members,
    presence,
    viewerEmail: user.email,
  });
}
