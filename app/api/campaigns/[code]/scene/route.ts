import { requireUser, db } from "@/lib/api-helpers";
import { ensureBucketExists, uploadSceneImage, getSceneImageStream } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { campaignId: string; role: "master" | "player" };
type SceneRow = {
  imageKey: string;
  imageName: string;
  contentType: string;
  revealPercent: number;
  updatedAt: string;
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await membership(supabase, code, user.email);
  if (!member) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const { data: row } = await supabase
    .from("campaign_scenes")
    .select("image_key, image_name, content_type, reveal_percent, updated_at")
    .eq("campaign_id", member.campaignId)
    .single();

  const sceneRow: SceneRow | null = row
    ? { imageKey: row.image_key, imageName: row.image_name, contentType: row.content_type, revealPercent: row.reveal_percent, updatedAt: row.updated_at }
    : null;

  return Response.json({ scene: scenePayload(code, sceneRow) });
}

export async function POST(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await membership(supabase, code, user.email);
  if (!member || member.role !== "master") return Response.json({ error: "Apenas o Mestre pode enviar cenas." }, { status: 403 });

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return Response.json({ error: "Escolha uma imagem." }, { status: 400 });
  if (!IMAGE_TYPES.has(image.type)) return Response.json({ error: "Use uma imagem JPG, PNG, WEBP ou GIF." }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return Response.json({ error: "A imagem deve ter no máximo 15 MB." }, { status: 400 });

  await ensureBucketExists();

  const { data: previous } = await supabase
    .from("campaign_scenes")
    .select("image_key")
    .eq("campaign_id", member.campaignId)
    .single();

  const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
  const key = `campaigns/${member.campaignId}/scenes/${crypto.randomUUID()}.${extension}`;
  const now = new Date().toISOString();

  try {
    await uploadSceneImage(member.campaignId, image, `${crypto.randomUUID()}.${extension}`, image.type);
  } catch (err) {
    console.error("Upload failed", err);
    return Response.json({ error: "Falha ao enviar a imagem." }, { status: 500 });
  }

  const { error } = await supabase.from("campaign_scenes").upsert({
    campaign_id: member.campaignId,
    image_key: key,
    image_name: image.name.slice(0, 180),
    content_type: image.type,
    reveal_percent: 0,
    updated_by: user.email,
    updated_at: now,
  });
  if (error) return Response.json({ error: "Falha ao salvar a cena." }, { status: 500 });

  const { data: current } = await supabase.from("campaigns").select("version").eq("id", member.campaignId).single();
  await supabase.from("campaigns").update({ version: (current?.version ?? 0) + 1, updated_at: now }).eq("id", member.campaignId);

  if (previous?.image_key && previous.image_key !== key) {
    try { await import("@/lib/storage").then((m) => m.deleteSceneImage(previous.image_key)); } catch { /* stale cleanup best-effort */ }
  }

  const row: SceneRow = { imageKey: key, imageName: image.name.slice(0, 180), contentType: image.type, revealPercent: 0, updatedAt: now };
  return Response.json({ scene: scenePayload(code, row) }, { status: 201 });
}

export async function PATCH(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Entre para continuar." }, { status: 401 });
  const { code } = await context.params;
  const supabase = db();
  const member = await membership(supabase, code, user.email);
  if (!member || member.role !== "master") return Response.json({ error: "Apenas o Mestre controla a cortina." }, { status: 403 });

  const payload = (await request.json()) as { revealPercent?: unknown };
  const numeric = typeof payload.revealPercent === "number" ? payload.revealPercent : Number(payload.revealPercent);
  if (!Number.isFinite(numeric)) return Response.json({ error: "Abertura inválida." }, { status: 400 });
  const revealPercent = Math.round(Math.max(0, Math.min(100, numeric)));
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("campaign_scenes")
    .update({ reveal_percent: revealPercent, updated_by: user.email, updated_at: now })
    .eq("campaign_id", member.campaignId);
  if (error) return Response.json({ error: "Envie uma imagem antes de abrir a cortina." }, { status: 404 });

  return Response.json({ ok: true, revealPercent, updatedAt: now });
}
