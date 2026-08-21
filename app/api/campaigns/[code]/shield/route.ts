import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { id: string; role: "master" | "player" };
type ModuleId = "characters" | "cameras" | "scene" | "dice";
type ShieldLayout = { order: ModuleId[]; hidden: ModuleId[]; openCharacterIds: string[] };

const MODULES = new Set<ModuleId>(["characters", "cameras", "scene", "dice"]);
const DEFAULT_LAYOUT: ShieldLayout = {
  order: ["characters", "cameras", "scene", "dice"],
  hidden: [],
  openCharacterIds: [],
};

async function membership(code: string, userId: string) {
  return env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(code.toUpperCase(), userId).first<Membership>();
}

function parseLayout(value: unknown): ShieldLayout {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
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
  return { order, hidden, openCharacterIds };
}

export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const row = await env.DB.prepare(
    `SELECT layout_json AS layoutJson FROM shield_layouts
      WHERE campaign_id = ? AND user_id = ? AND shield_type = ?`,
  ).bind(member.id, user.id, member.role).first<{ layoutJson: string }>();
  if (!row) return Response.json({ layout: DEFAULT_LAYOUT, shieldType: member.role });
  try {
    return Response.json({ layout: parseLayout(JSON.parse(row.layoutJson)), shieldType: member.role });
  } catch {
    return Response.json({ layout: DEFAULT_LAYOUT, shieldType: member.role });
  }
}

export async function PUT(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const payload = (await request.json()) as { layout?: unknown };
  const layout = parseLayout(payload.layout);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO shield_layouts
      (campaign_id, user_id, shield_type, layout_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, user_id, shield_type) DO UPDATE SET
       layout_json = excluded.layout_json,
       updated_at = excluded.updated_at`,
  ).bind(member.id, user.id, member.role, JSON.stringify(layout), now).run();
  return Response.json({ ok: true, layout, shieldType: member.role });
}
