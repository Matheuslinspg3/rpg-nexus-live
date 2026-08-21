import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../auth";

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
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const campaign = await env.DB.prepare(
    `SELECT c.id, c.code, c.name, c.system, c.master_name AS masterName,
            c.version, c.updated_at AS updatedAt, m.role
       FROM campaigns c
       JOIN campaign_members m ON m.campaign_id = c.id
      WHERE c.code = ? AND m.email = ?`,
  ).bind(rawCode.toUpperCase(), user.id).first<Campaign>();

  if (!campaign) {
    return Response.json({ error: "Você não participa desta campanha." }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - 18_000).toISOString();
  const [characterRows, memberRows, presenceRows] = await Promise.all([
    env.DB.prepare(
      `SELECT ch.id, ch.name, ch.assigned_user_id AS assignedUserId,
              cm.display_name AS assignedDisplayName, ch.updated_at AS updatedAt
         FROM characters ch
         LEFT JOIN campaign_members cm
           ON cm.campaign_id = ch.campaign_id AND cm.email = ch.assigned_user_id
        WHERE ch.campaign_id = ?
          AND (? = 'master' OR ch.assigned_user_id = ?)
        ORDER BY ch.created_at ASC`,
    ).bind(campaign.id, campaign.role, user.id).all<Character>(),
    env.DB.prepare(
      `SELECT email, display_name AS displayName, role
         FROM campaign_members WHERE campaign_id = ?
         ORDER BY CASE role WHEN 'master' THEN 0 ELSE 1 END, joined_at`,
    ).bind(campaign.id).all<{ email: string; displayName: string; role: "master" | "player" }>(),
    env.DB.prepare(
      `SELECT email, display_name AS displayName, role, color,
              cursor_x AS cursorX, cursor_y AS cursorY,
              editing_field AS editingField, active_at AS activeAt
         FROM presence
        WHERE campaign_id = ? AND active_at >= ?`,
    ).bind(campaign.id, cutoff).all(),
  ]);

  return Response.json({
    campaign,
    characters: characterRows.results ?? [],
    members: memberRows.results ?? [],
    presence: presenceRows.results ?? [],
    viewerEmail: user.id,
  });
}
