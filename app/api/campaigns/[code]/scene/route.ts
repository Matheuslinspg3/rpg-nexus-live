import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { id: string; role: "master" | "player" };
type SceneRow = {
  imageKey: string;
  imageName: string;
  contentType: string;
  revealPercent: number;
  updatedAt: string;
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function membership(code: string, userId: string) {
  return env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
      JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.code = ? AND m.email = ?`,
  ).bind(code.toUpperCase(), userId).first<Membership>();
}

function scenePayload(code: string, row: SceneRow | null) {
  if (!row) return { hasImage: false, imageUrl: null, imageName: null, revealPercent: 0, updatedAt: null };
  const version = row.imageKey.split("/").pop() ?? row.updatedAt;
  return {
    hasImage: true,
    imageUrl: `/api/campaigns/${code.toUpperCase()}/scene/image?v=${encodeURIComponent(version)}`,
    imageName: row.imageName,
    revealPercent: row.revealPercent,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const row = await env.DB.prepare(
    `SELECT image_key AS imageKey, image_name AS imageName, content_type AS contentType,
            reveal_percent AS revealPercent, updated_at AS updatedAt
       FROM campaign_scenes WHERE campaign_id = ?`,
  ).bind(member.id).first<SceneRow>();

  return Response.json({ scene: scenePayload(code, row) });
}

export async function POST(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member || member.role !== "master") {
    return Response.json({ error: "Apenas o Mestre pode enviar cenas." }, { status: 403 });
  }

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return Response.json({ error: "Escolha uma imagem." }, { status: 400 });
  if (!IMAGE_TYPES.has(image.type)) {
    return Response.json({ error: "Use uma imagem JPG, PNG, WEBP ou GIF." }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "A imagem deve ter no máximo 15 MB." }, { status: 400 });
  }

  const previous = await env.DB.prepare(
    "SELECT image_key AS imageKey FROM campaign_scenes WHERE campaign_id = ?",
  ).bind(member.id).first<{ imageKey: string }>();
  const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
  const key = `campaigns/${member.id}/scenes/${crypto.randomUUID()}.${extension}`;
  const now = new Date().toISOString();

  await env.BUCKET.put(key, image.stream(), {
    httpMetadata: { contentType: image.type },
    customMetadata: { originalName: image.name.slice(0, 180), campaignId: member.id },
  });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO campaign_scenes
          (campaign_id, image_key, image_name, content_type, reveal_percent, updated_by, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET
           image_key = excluded.image_key,
           image_name = excluded.image_name,
           content_type = excluded.content_type,
           reveal_percent = 0,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      ).bind(member.id, key, image.name.slice(0, 180), image.type, user.id, now),
      env.DB.prepare("UPDATE campaigns SET version = version + 1, updated_at = ? WHERE id = ?")
        .bind(now, member.id),
    ]);
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }

  if (previous?.imageKey && previous.imageKey !== key) {
    try { await env.BUCKET.delete(previous.imageKey); } catch { /* The active scene is already safe; stale cleanup can be retried later. */ }
  }

  const row: SceneRow = {
    imageKey: key,
    imageName: image.name.slice(0, 180),
    contentType: image.type,
    revealPercent: 0,
    updatedAt: now,
  };
  return Response.json({ scene: scenePayload(code, row) }, { status: 201 });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const member = await membership(code, user.id);
  if (!member || member.role !== "master") {
    return Response.json({ error: "Apenas o Mestre controla a cortina." }, { status: 403 });
  }

  const payload = (await request.json()) as { revealPercent?: unknown };
  const numeric = typeof payload.revealPercent === "number" ? payload.revealPercent : Number(payload.revealPercent);
  if (!Number.isFinite(numeric)) return Response.json({ error: "Abertura inválida." }, { status: 400 });
  const revealPercent = Math.round(Math.max(0, Math.min(100, numeric)));
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE campaign_scenes SET reveal_percent = ?, updated_by = ?, updated_at = ?
      WHERE campaign_id = ?`,
  ).bind(revealPercent, user.id, now, member.id).run();
  if (!result.meta.changes) return Response.json({ error: "Envie uma imagem antes de abrir a cortina." }, { status: 404 });

  return Response.json({ ok: true, revealPercent, updatedAt: now });
}
