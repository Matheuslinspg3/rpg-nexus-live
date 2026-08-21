import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { id: string; role: "master" | "player" };
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

async function membership(code: string, userId: string) {
  return env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(code.toUpperCase(), userId).first<Membership>();
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
  } catch { /* Historical malformed data is shown without individual dice. */ }
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
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const rows = await env.DB.prepare(
    `SELECT id, roller_user_id AS rollerUserId, roller_name AS rollerName,
            visibility, dice_sides AS diceSides, dice_count AS diceCount,
            modifier, results_json AS resultsJson, total, created_at AS createdAt
       FROM dice_rolls
      WHERE campaign_id = ?
        AND (visibility = 'public' OR ? = 'master' OR roller_user_id = ?)
      ORDER BY created_at DESC
      LIMIT 80`,
  ).bind(member.id, member.role, user.id).all<RollRow>();

  return Response.json({ rolls: (rows.results ?? []).map(toRoll) });
}

export async function POST(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const payload = (await request.json()) as {
    diceSides?: unknown;
    diceCount?: unknown;
    modifier?: unknown;
    visibility?: unknown;
  };
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
  const roll: RollRow = {
    id: crypto.randomUUID(),
    rollerUserId: user.id,
    rollerName: user.displayName,
    visibility,
    diceSides,
    diceCount,
    modifier,
    resultsJson: JSON.stringify(results),
    total,
    createdAt: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO dice_rolls
      (id, campaign_id, roller_user_id, roller_name, visibility, dice_sides,
       dice_count, modifier, results_json, total, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    roll.id,
    member.id,
    roll.rollerUserId,
    roll.rollerName,
    roll.visibility,
    roll.diceSides,
    roll.diceCount,
    roll.modifier,
    roll.resultsJson,
    roll.total,
    roll.createdAt,
  ).run();

  return Response.json({ roll: toRoll(roll) }, { status: 201 });
}
