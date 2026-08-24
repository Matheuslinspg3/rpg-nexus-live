import { requireUser, db } from "@/lib/api-helpers";

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

// GET /api/campaigns/:code/camera - Get or create Daily.co room
export async function GET(request: Request, context: Context) {
  const user = await requireUser();
  if (!user || !user.email) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { code } = await context.params;
  const supabase = db();
  const member = await getMembershipId(supabase, code, user.email);
  if (!member) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const { data: existing } = await supabase
    .from("camera_rooms")
    .select("room_url")
    .eq("campaign_id", member.campaignId)
    .single();

  if (existing?.room_url) return Response.json({ roomUrl: existing.room_url });

  const dailyApiKey = process.env.DAILY_API_KEY;
  if (!dailyApiKey) return Response.json({ error: "Daily.co API key not configured." }, { status: 500 });

  const roomName = `rpg-nexus-${member.campaignId}`;
  try {
    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${dailyApiKey}` },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          max_participants: 10,
          enable_screenshare: false,
          enable_chat: false,
          enable_knocking: false,
          start_video_off: false,
          start_audio_off: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Daily.co error:", error);
      return Response.json({ error: "Failed to create room." }, { status: 500 });
    }

    const room = (await response.json()) as { url: string; name: string };
    const { error: insertError } = await supabase.from("camera_rooms").insert({
      campaign_id: member.campaignId,
      room_url: room.url,
      room_name: room.name,
      created_at: new Date().toISOString(),
    });
    if (insertError) return Response.json({ error: "Falha ao salvar a sala." }, { status: 500 });

    return Response.json({ roomUrl: room.url });
  } catch (error) {
    console.error("Failed to create Daily.co room:", error);
    return Response.json({ error: "Failed to create room." }, { status: 500 });
  }
}
