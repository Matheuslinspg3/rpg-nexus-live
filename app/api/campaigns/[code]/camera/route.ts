import { env } from "cloudflare:workers";
import { getAuthUser } from "../../../../auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Membership = { id: string; role: "master" | "player" };

async function getMembership(code: string, userId: string) {
  return env.DB.prepare(
    `SELECT c.id, m.role FROM campaigns c
       JOIN campaign_members m ON m.campaign_id = c.id
      WHERE c.code = ? AND m.email = ?`,
  ).bind(code.toUpperCase(), userId).first<Membership>();
}

// GET /api/campaigns/:code/camera - Get or create Daily.co room
export async function GET(request: Request, context: Context) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { code } = await context.params;
  const member = await getMembership(code, user.id);
  if (!member) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  // Check if room already exists in DB
  const existing = await env.DB.prepare(
    `SELECT room_url as roomUrl, room_name as roomName 
     FROM camera_rooms 
     WHERE campaign_id = ?`,
  ).bind(member.id).first<{ roomUrl: string; roomName: string }>();

  if (existing) {
    return Response.json({ roomUrl: existing.roomUrl });
  }

  // Create new Daily.co room
  const dailyApiKey = env.DAILY_API_KEY;
  if (!dailyApiKey) {
    return Response.json({ error: "Daily.co API key not configured." }, { status: 500 });
  }

  const roomName = `rpg-nexus-${member.id}`;
  
  try {
    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${dailyApiKey}`,
      },
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

    const room = await response.json() as { url: string; name: string };

    // Save to database
    await env.DB.prepare(
      `INSERT INTO camera_rooms (campaign_id, room_url, room_name, created_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(member.id, room.url, room.name, new Date().toISOString()).run();

    return Response.json({ roomUrl: room.url });
  } catch (error) {
    console.error("Failed to create Daily.co room:", error);
    return Response.json({ error: "Failed to create room." }, { status: 500 });
  }
}
