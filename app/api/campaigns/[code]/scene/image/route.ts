import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const scene = await env.DB.prepare(
    `SELECT s.image_key AS imageKey, s.image_name AS imageName, s.content_type AS contentType
       FROM campaigns c
       JOIN campaign_members m ON m.campaign_id = c.id AND m.email = ?
       JOIN campaign_scenes s ON s.campaign_id = c.id
      WHERE c.code = ?`,
  ).bind(user.id, code.toUpperCase()).first<{ imageKey: string; imageName: string; contentType: string }>();
  if (!scene) return Response.json({ error: "Cena não encontrada." }, { status: 404 });

  const object = await env.BUCKET.get(scene.imageKey);
  if (!object) return Response.json({ error: "Imagem não encontrada." }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", scene.contentType);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("etag", object.httpEtag);
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(scene.imageName)}`);
  return new Response(object.body, { headers });
}
