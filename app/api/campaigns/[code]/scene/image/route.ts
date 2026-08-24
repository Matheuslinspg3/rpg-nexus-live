import { requireUser, db } from "@/lib/api-helpers";
import { getSceneImageStream } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

async function getMembershipId(supabase: any, code: string, email: string) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", code.toUpperCase())
    .eq("campaign_members.email", email)
    .single();
  if (!data) return null;
  return { campaignId: data.id as string, role: (data.campaign_members as any[])[0].role as "master" | "player" };
}

export async function GET(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await getMembershipId(supabase, code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const { data: scene } = await supabase
    .from("campaign_scenes")
    .select("image_key, image_name, content_type")
    .eq("campaign_id", member.campaignId)
    .single();
  if (!scene?.image_key) return Response.json({ error: "Cena não encontrada." }, { status: 404 });

  let blob: Blob;
  try {
    blob = await getSceneImageStream(scene.image_key);
  } catch {
    return Response.json({ error: "Imagem não encontrada." }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("content-type", scene.content_type);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(scene.image_name)}`);
  return new Response(blob, { headers });
}
