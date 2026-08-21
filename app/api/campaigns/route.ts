import { env } from "cloudflare:workers";
import { getAuthUser } from "../../auth";

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

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  try {
    const result = await env.DB.prepare(
      `SELECT c.id, c.code, c.name, c.system, c.master_name AS masterName,
              m.role,
              (SELECT COUNT(*) FROM campaign_members cm WHERE cm.campaign_id = c.id) AS memberCount,
              c.updated_at AS updatedAt
         FROM campaigns c
         JOIN campaign_members m ON m.campaign_id = c.id
        WHERE m.email = ?
        ORDER BY c.updated_at DESC`,
    ).bind(user.id).all<CampaignRow>();

    return Response.json({ campaigns: result.results ?? [] });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  try {
    const payload = (await request.json()) as {
      action?: "create" | "join";
      name?: string;
      system?: string;
      code?: string;
    };
    const now = new Date().toISOString();

    if (payload.action === "create") {
      const name = cleanName(payload.name);
      const system = cleanName(payload.system, 32) || "Nimble RPG";
      if (!name) return Response.json({ error: "Dê um nome à campanha." }, { status: 400 });

      const id = crypto.randomUUID();
      let code = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = campaignCode();
        const existing = await env.DB.prepare("SELECT id FROM campaigns WHERE code = ?")
          .bind(candidate).first();
        if (!existing) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error("Não foi possível gerar um código de campanha.");

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO campaigns
            (id, code, name, system, master_email, master_name, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        ).bind(id, code, name, system, user.id, user.displayName, now, now),
        env.DB.prepare(
          `INSERT INTO campaign_members
            (campaign_id, email, display_name, role, joined_at)
           VALUES (?, ?, ?, 'master', ?)`,
        ).bind(id, user.id, user.displayName, now),
      ]);

      return Response.json({ code }, { status: 201 });
    }

    if (payload.action === "join") {
      const code = cleanName(payload.code, 8).toUpperCase();
      if (!code) return Response.json({ error: "Informe o código da campanha." }, { status: 400 });
      const campaign = await env.DB.prepare("SELECT id FROM campaigns WHERE code = ?")
        .bind(code).first<{ id: string }>();
      if (!campaign) return Response.json({ error: "Campanha não encontrada. Confira o código." }, { status: 404 });

      const current = await env.DB.prepare(
        "SELECT role FROM campaign_members WHERE campaign_id = ? AND email = ?",
      ).bind(campaign.id, user.id).first<{ role: string }>();

      if (!current) {
        await env.DB.prepare(
          `INSERT INTO campaign_members
            (campaign_id, email, display_name, role, joined_at)
           VALUES (?, ?, ?, 'player', ?)`,
        ).bind(campaign.id, user.id, user.displayName, now).run();
      }

      return Response.json({ code });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
