import { requireUser, db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { campaignId: string; role: "master" | "player" };
type RollRow = {
  id: string;
  rollerUserId: string;
  rollerName: string;
  visibility: "public" | "master_private";
  diceSides: number;
  diceCount: number;
  modifier: number;
  resultsJson: string;
  total: number;
  createdAt: string;
};

const ALLOWED_DICE = new Set([4, 6, 8, 10, 12, 20, 100]);

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

function secureDie(sides: number) {
  const range = 0x1_0000_0000;
  const limit = range - (range % sides);
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
  return (sample[0] % sides) + 1;
}

function toRoll(row: RollRow) {
  let results: number[] = [];
  try {
    const parsed = JSON.parse(row.resultsJson);
    if (Array.isArray(parsed)) results = parsed.filter((value): value is number => Number.isInteger(value));
  } catch { /* ignore malformed */ }
  return {
    id: row.id,
    rollerUserId: row.rollerUserId,
    rollerName: row.rollerName,
    visibility: row.visibility,
    diceSides: row.diceSides,
    diceCount: row.diceCount,
    modifier: row.modifier,
    results,
    total: row.total,
    createdAt: row.createdAt,
  };
}

export async function GET(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await membership(supabase, code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const query = supabase
    .from("dice_rolls")
    .select("id, roller_user_id, roller_name, visibility, dice_sides, dice_count, modifier, results_json, total, created_at")
    .eq("campaign_id", member.campaignId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (member.role !== "master") {
    query.or(`visibility.eq.public,roller_user_id.eq.${user.email}`);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: "Não foi possível carregar as rolagens." }, { status: 500 });

  return Response.json({ rolls: (data || []).map((r: any) => toRoll(r)) });
}

export async function POST(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await membership(supabase, code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const payload = (await request.json()) as { diceSides?: unknown; diceCount?: unknown; modifier?: unknown; visibility?: unknown };
  const diceSides = Number(payload.diceSides);
  const diceCount = Number(payload.diceCount);
  const modifier = Number(payload.modifier ?? 0);
  const visibility = payload.visibility === "master_private" ? "master_private" : "public";

  if (!ALLOWED_DICE.has(diceSides)) return Response.json({ error: "Escolha um dado válido." }, { status: 400 });
  if (!Number.isInteger(diceCount) || diceCount < 1 || diceCount > 20) {
    return Response.json({ error: "Role entre 1 e 20 dados por vez." }, { status: 400 });
  }
  if (!Number.isInteger(modifier) || modifier < -100 || modifier > 100) {
    return Response.json({ error: "O modificador deve ficar entre -100 e +100." }, { status: 400 });
  }

  const results = Array.from({ length: diceCount }, () => secureDie(diceSides));
  const total = results.reduce((sum, value) => sum + value, 0) + modifier;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from("dice_rolls").insert({
    id,
    campaign_id: member.campaignId,
    roller_user_id: user.email,
    roller_name: user.displayName,
    visibility,
    dice_sides: diceSides,
    dice_count: diceCount,
    modifier,
    results_json: JSON.stringify(results),
    total,
    created_at: now,
  });

  if (error) return Response.json({ error: "Não foi possível registrar a rolagem." }, { status: 500 });

  return Response.json({ roll: toRoll({
    id, rollerUserId: user.email, rollerName: user.displayName, visibility,
    diceSides, diceCount, modifier, resultsJson: JSON.stringify(results), total, createdAt: now,
  }) }, { status: 201 });
}
