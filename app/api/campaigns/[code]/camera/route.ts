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
    .select("room_url, room_name")
    .eq("campaign_id", member.campaignId)
    .single();

  const dailyApiKey = process.env.DAILY_API_KEY;
  if (!dailyApiKey || dailyApiKey.length < 20) {
    console.error("Daily API key missing or placeholder:", dailyApiKey);
    return Response.json({ error: "Câmeras desabilitadas — DAILY_API_KEY não configurado no servidor. Configure uma chave válida em dashboard.daily.co no Vercel." }, { status: 503 });
  }

  async function createMeetingToken(roomName: string): Promise<string | null> {
    try {
      const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${dailyApiKey}` },
        body: JSON.stringify({ properties: { room_name: roomName, is_owner: true } }),
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Daily token error:", errText);
        if (errText.includes("401") || errText.includes("Unauthorized") || errText.includes("invalid")) {
          console.error("Daily API key rejected - invalid key");
        }
        return null;
      }
      const tokenData = (await tokenRes.json()) as { token: string };
      return tokenData.token;
    } catch (e) {
      console.error("Daily token exception:", e);
      return null;
    }
  }

  if (existing?.room_url && (existing as any).room_name) {
    const token = await createMeetingToken((existing as any).room_name);
    if (!token) return Response.json({ error: "Falha ao criar token da sala — verifique se DAILY_API_KEY é válida em dashboard.daily.co." }, { status: 503 });
    return Response.json({ roomUrl: existing.room_url, token });
  }

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
      if (error.includes("401") || error.includes("Unauthorized")) {
        return Response.json({ error: "Daily.co rejeitou a API key — configure DAILY_API_KEY válida no Vercel." }, { status: 503 });
      }
      return Response.json({ error: "Falha ao criar sala de vídeo." }, { status: 500 });
    }

    const room = (await response.json()) as { url: string; name: string };
    const { error: insertError } = await supabase.from("camera_rooms").insert({
      campaign_id: member.campaignId,
      room_url: room.url,
      room_name: room.name,
      created_at: new Date().toISOString(),
    });
    if (insertError) return Response.json({ error: "Falha ao salvar a sala." }, { status: 500 });

    const token = await createMeetingToken(room.name);
    if (!token) return Response.json({ error: "Falha ao criar token — verifique DAILY_API_KEY." }, { status: 503 });
    return Response.json({ roomUrl: room.url, token });
  } catch (error) {
    console.error("Failed to create Daily.co room:", error);
    return Response.json({ error: "Failed to create room." }, { status: 500 });
  }
}
