import { requireUser, db } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
type Role = "master" | "player";
type DailyRoom = { url: string; name: string };

async function getMembershipId(supabase: any, code: string, email: string) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", code.toUpperCase())
    .eq("campaign_members.email", email)
    .single();

  if (!data) return null;
  return {
    campaignId: data.id as string,
    role: (data.campaign_members as any[])[0].role as Role,
  };
}

function dailyHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function createMeetingToken(apiKey: string, roomName: string, role: Role) {
  try {
    const response = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: dailyHeaders(apiKey),
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: role === "master",
          // Each user enters in spectator mode and can opt into media later.
          start_video_off: true,
          start_audio_off: true,
          enable_screenshare: true,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Daily token error:", response.status, detail);
      return { token: null, error: "Daily.co recusou o token da sala. Verifique DAILY_API_KEY no Vercel." };
    }

    const data = (await response.json()) as { token?: string };
    if (!data.token) {
      console.error("Daily token response did not contain a token");
      return { token: null, error: "Daily.co não retornou um token válido para a sala." };
    }

    return { token: data.token, error: null };
  } catch (error) {
    console.error("Daily token exception:", error);
    return { token: null, error: "Não foi possível falar com o Daily.co para criar o token." };
  }
}

async function createDailyRoom(apiKey: string, roomName: string) {
  try {
    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: dailyHeaders(apiKey),
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          max_participants: 10,
          enable_screenshare: true,
          enable_chat: false,
          enable_knocking: false,
          start_video_off: true,
          start_audio_off: true,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Daily room creation error:", response.status, detail);
      return {
        room: null,
        error:
          response.status === 401 || response.status === 403
            ? "Daily.co rejeitou a API key. Configure DAILY_API_KEY válida no Vercel."
            : "Daily.co não conseguiu criar a sala de vídeo.",
      };
    }

    return { room: (await response.json()) as DailyRoom, error: null };
  } catch (error) {
    console.error("Daily room creation exception:", error);
    return { room: null, error: "Não foi possível falar com o Daily.co para criar a sala." };
  }
}

// GET /api/campaigns/:code/camera - Get or create a Daily.co room and a fresh token.
export async function GET(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user?.email) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { code } = await context.params;
  const supabase = db();
  const member = await getMembershipId(supabase, code, user.email);
  if (!member) {
    return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  }

  const dailyApiKey = process.env.DAILY_API_KEY;
  if (!dailyApiKey || dailyApiKey.length < 20) {
    console.error("DAILY_API_KEY is missing or invalid.");
    return Response.json(
      { error: "Câmeras desabilitadas: configure DAILY_API_KEY válida no Vercel." },
      { status: 503 }
    );
  }

  const { data: savedRoom } = await supabase
    .from("camera_rooms")
    .select("room_url, room_name")
    .eq("campaign_id", member.campaignId)
    .maybeSingle();

  let room: DailyRoom | null =
    savedRoom?.room_url && savedRoom?.room_name
      ? { url: savedRoom.room_url, name: savedRoom.room_name }
      : null;

  if (room) {
    const check = await fetch(
      `https://api.daily.co/v1/rooms/${encodeURIComponent(room.name)}`,
      { headers: dailyHeaders(dailyApiKey) }
    );

    if (check.status === 404) {
      const rebuilt = await createDailyRoom(dailyApiKey, room.name);
      if (!rebuilt.room) {
        return Response.json({ error: rebuilt.error }, { status: 503 });
      }

      room = rebuilt.room;
      const { error: updateError } = await supabase
        .from("camera_rooms")
        .update({ room_url: room.url, room_name: room.name })
        .eq("campaign_id", member.campaignId);

      if (updateError) {
        console.error("Could not update rebuilt Daily room:", updateError);
        return Response.json({ error: "A sala de vídeo foi recriada, mas não pôde ser salva." }, { status: 500 });
      }
    } else if (!check.ok) {
      const detail = await check.text();
      console.error("Daily room validation error:", check.status, detail);
      return Response.json(
        { error: "Não foi possível validar a sala Daily. Verifique DAILY_API_KEY no Vercel." },
        { status: 503 }
      );
    }
  }

  if (!room) {
    const created = await createDailyRoom(dailyApiKey, `rpg-nexus-${member.campaignId}`);
    if (!created.room) {
      return Response.json({ error: created.error }, { status: 503 });
    }

    room = created.room;
    const { error: insertError } = await supabase.from("camera_rooms").insert({
      campaign_id: member.campaignId,
      room_url: room.url,
      room_name: room.name,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Could not save Daily room:", insertError);
      return Response.json({ error: "A sala de vídeo foi criada, mas não pôde ser salva." }, { status: 500 });
    }
  }

  const meetingToken = await createMeetingToken(dailyApiKey, room.name, member.role);
  if (!meetingToken.token) {
    return Response.json({ error: meetingToken.error }, { status: 503 });
  }

  return Response.json({ roomUrl: room.url, token: meetingToken.token });
}
