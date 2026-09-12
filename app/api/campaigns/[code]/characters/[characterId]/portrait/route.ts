import { requireUser, db } from "@/lib/api-helpers";
import { ensureBucketExists, uploadSceneImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string; characterId: string }> };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code, characterId } = await context.params;
  const supabase = db();

  const { data: membership } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", code.toUpperCase())
    .eq("campaign_members.email", user.email)
    .single();

  if (!membership) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return Response.json({ error: "Escolha uma imagem." }, { status: 400 });
  if (!IMAGE_TYPES.has(image.type)) return Response.json({ error: "Use uma imagem JPG, PNG, WEBP ou GIF." }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return Response.json({ error: "A imagem deve ter no máximo 10 MB." }, { status: 400 });

  await ensureBucketExists();

  const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
  const fileKey = `portraits/${characterId}-${crypto.randomUUID()}.${extension}`;

  try {
    await uploadSceneImage(membership.id, image, fileKey, image.type);
  } catch (err) {
    console.error("Upload failed", err);
    return Response.json({ error: "Falha ao enviar a imagem." }, { status: 500 });
  }

  const imageUrl = `/api/campaigns/${code.toUpperCase()}/scene/image?v=${encodeURIComponent(membership.id + '/' + fileKey)}`;

  // Update character portrait field in database
  const now = new Date().toISOString();
  const { error } = await supabase.from("character_fields").upsert({
    character_id: characterId,
    campaign_id: membership.id,
    field_key: "portraitUrl",
    field_value: imageUrl,
    updated_by: user.email,
    updated_by_name: user.displayName,
    updated_at: now
  });

  if (error) {
    return Response.json({ error: "Falha ao salvar url da imagem." }, { status: 500 });
  }

  // Update character updated_at timestamp so clients fetch the new fields
  await supabase.from("characters").update({ updated_at: now }).eq("id", characterId);

  return Response.json({ portraitUrl: imageUrl }, { status: 201 });
}
