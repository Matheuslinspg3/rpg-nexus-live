import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../../auth";
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

async function characterAccess(code: string, characterId: string, userId: string) {
  return env.DB.prepare(
    `SELECT c.id AS campaignId, m.role, ch.assigned_user_id AS assignedUserId
       FROM campaigns c
       JOIN campaign_members m ON m.campaign_id = c.id AND m.email = ?
       JOIN characters ch ON ch.campaign_id = c.id AND ch.id = ?
      WHERE c.code = ?`,
  ).bind(userId, characterId, code.toUpperCase()).first<Access>();
}

function canOpen(access: Access | null, userId: string) {
  return Boolean(access && (access.role === "master" || access.assignedUserId === userId));
}

export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code, characterId } = await context.params;
  const access = await characterAccess(code, characterId, user.id);
  if (!canOpen(access, user.id)) return Response.json({ error: "Esta ficha não foi atribuída a você." }, { status: 403 });

  const rows = await env.DB.prepare(
    `SELECT field_key AS fieldKey, field_value AS fieldValue
       FROM character_fields WHERE character_id = ? AND campaign_id = ?`,
  ).bind(characterId, access!.campaignId).all<{ fieldKey: string; fieldValue: string }>();

  return Response.json({
    fields: Object.fromEntries((rows.results ?? []).map((row) => [row.fieldKey, row.fieldValue])),
  });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code, characterId } = await context.params;
  const payload = (await request.json()) as {
    field?: unknown;
    value?: unknown;
    name?: unknown;
    assignedUserId?: unknown;
  };
  const access = await characterAccess(code, characterId, user.id);
  if (!access) return Response.json({ error: "Ficha não encontrada." }, { status: 404 });
  const now = new Date().toISOString();

  if (typeof payload.field === "string") {
    if (!canOpen(access, user.id)) return Response.json({ error: "Esta ficha não foi atribuída a você." }, { status: 403 });
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
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO character_fields
          (character_id, campaign_id, field_key, field_value, updated_by, updated_by_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_id, field_key) DO UPDATE SET
           field_value = excluded.field_value,
           updated_by = excluded.updated_by,
           updated_by_name = excluded.updated_by_name,
           updated_at = excluded.updated_at`,
      ).bind(characterId, access.campaignId, payload.field, value, user.id, user.displayName, now),
      env.DB.prepare("UPDATE characters SET updated_at = ? WHERE id = ?").bind(now, characterId),
      env.DB.prepare("UPDATE campaigns SET version = version + 1, updated_at = ? WHERE id = ?")
        .bind(now, access.campaignId),
    ]);
    return Response.json({ ok: true, updatedAt: now });
  }

  if (access.role !== "master") {
    return Response.json({ error: "Apenas o Mestre pode organizar as fichas." }, { status: 403 });
  }

  const updates: string[] = [];
  const values: Array<string | null> = [];
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 64) : "";
    if (!name) return Response.json({ error: "Dê um nome à ficha." }, { status: 400 });
    updates.push("name = ?");
    values.push(name);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignedUserId")) {
    const assignedUserId = typeof payload.assignedUserId === "string" && payload.assignedUserId ? payload.assignedUserId : null;
    if (assignedUserId) {
      const player = await env.DB.prepare(
        `SELECT email FROM campaign_members
          WHERE campaign_id = ? AND email = ? AND role = 'player'`,
      ).bind(access.campaignId, assignedUserId).first();
      if (!player) return Response.json({ error: "Escolha um Player desta campanha." }, { status: 400 });
    }
    updates.push("assigned_user_id = ?");
    values.push(assignedUserId);
  }

  if (updates.length === 0) return Response.json({ error: "Nenhuma alteração recebida." }, { status: 400 });
  updates.push("updated_at = ?");
  values.push(now, characterId, access.campaignId);

  await env.DB.batch([
    env.DB.prepare(`UPDATE characters SET ${updates.join(", ")} WHERE id = ? AND campaign_id = ?`).bind(...values),
    env.DB.prepare("UPDATE campaigns SET version = version + 1, updated_at = ? WHERE id = ?")
      .bind(now, access.campaignId),
  ]);

  return Response.json({ ok: true, updatedAt: now });
}
