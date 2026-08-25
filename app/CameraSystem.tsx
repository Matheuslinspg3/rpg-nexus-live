"use client";

import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type CameraIdentity = { id: string; displayName: string };
type Role = "master" | "player";

type CameraContextValue = {
  isLoading: boolean;
  error: string;
  isJoined: boolean;
  participantCount: number;
  participants: Record<string, any>;
  joinRoom: (container?: HTMLElement | null) => Promise<void>;
  leaveRoom: () => void;
};

const CameraContext = createContext<CameraContextValue | null>(null);

function describeDailyError(event: any) {
  const detail = [
    event?.errorMsg,
    event?.error?.message,
    event?.error?.msg,
    event?.error?.type,
    typeof event?.error === "string" ? event.error : "",
    event?.type,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);

  const normalized = detail?.toLowerCase() || "";
  if (/permission|notallowed|device|camera|microphone|getusermedia/.test(normalized)) {
    return "A câmera ou o microfone foram bloqueados. Libere as permissões do navegador e tente novamente.";
  }
  if (/token|auth|access|room|meeting/.test(normalized)) {
    return "O Daily recusou o acesso à sala. Atualize a página e tente entrar novamente.";
  }
  if (/network|websocket|ice|connection|transport/.test(normalized)) {
    return "Não foi possível alcançar o serviço de vídeo. Verifique sua conexão e tente novamente.";
  }
  return detail
    ? `Não foi possível entrar na chamada Daily (${detail}).`
    : "Não foi possível entrar na chamada Daily. Tente novamente.";
}

export function useCamera() {
  const context = useContext(CameraContext);
  if (!context) throw new Error("useCamera must be used within CameraProvider");
  return context;
}

export function CameraProvider({
  children,
  user,
  role,
  campaignCode,
}: {
  children: ReactNode;
  user: CameraIdentity;
  role: Role;
  campaignCode: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const callRef = useRef<DailyCall | null>(null);
  const pendingContainerRef = useRef<HTMLElement | null>(null);
  const lastDailyErrorRef = useRef<string>("");

  const leaveRoom = useCallback(() => {
    const existing = callRef.current || (DailyIframe as any).getCallInstance?.();
    if (existing) {
      try {
        existing.leave();
        existing.destroy();
      } catch {}
    }
    callRef.current = null;
    pendingContainerRef.current = null;
    setIsJoined(false);
    setParticipantCount(0);
    setParticipants({});
  }, []);

  const joinRoom = useCallback(async (container?: HTMLElement | null) => {
    if (isJoined || isLoading) return;
    setIsLoading(true);
    setError("");
    lastDailyErrorRef.current = "";

    const targetContainer = container || pendingContainerRef.current;
    if (container) pendingContainerRef.current = container;

    try {
      const existing = (DailyIframe as any).getCallInstance?.();
      if (existing) {
        try { existing.leave(); existing.destroy(); } catch {}
      }
      if (callRef.current) {
        try { callRef.current.leave(); callRef.current.destroy(); } catch {}
        callRef.current = null;
      }

      const response = await fetch(`/api/campaigns/${campaignCode}/camera`);
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error || "Failed to get camera room");
      }

      const data = await response.json() as { roomUrl: string; token: string };

      const callObject = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: true,
      } as any);
      callRef.current = callObject;

      const refreshParticipants = () => {
        const next = { ...callObject.participants() };
        setParticipants(next);
        setParticipantCount(Object.keys(next).length);
      };

      callObject.on("joined-meeting", () => {
        setIsJoined(true);
        setIsLoading(false);
        refreshParticipants();
      });
      callObject.on("participant-joined", refreshParticipants);
      callObject.on("participant-left", refreshParticipants);
      callObject.on("participant-updated", refreshParticipants);

      callObject.on("left-meeting", () => {
        setIsJoined(false);
        setParticipantCount(0);
        setParticipants({});
      });

      callObject.on("error", (event: any) => {
        console.error("Daily error:", event);
        const message = describeDailyError(event);
        lastDailyErrorRef.current = message;
        setError(message);
        setIsLoading(false);
      });

      await callObject.join({
        url: data.roomUrl,
        token: data.token,
        userName: user.displayName,
      });

      // Some browsers deliver joined-meeting before the Promise resolves. Updating
      // state here as well keeps the workspace responsive in both event orders.
      refreshParticipants();
      setIsJoined(true);

      if (targetContainer) {
        const participants = callObject.participants();
        setParticipants({ ...participants });
        setParticipantCount(Object.keys(participants).length);
      }
    } catch (err) {
      const msg = lastDailyErrorRef.current || (err instanceof Error ? err.message : "Erro ao conectar.");
      if (msg.includes("Duplicate")) {
        setError("Sala já conectada nesta aba. Saia e entre novamente.");
      } else {
        setError(msg);
      }
      setIsLoading(false);
      const leaked = callRef.current;
      if (leaked) {
        try { leaked.leave(); leaked.destroy(); } catch {}
        callRef.current = null;
      }
    }
  }, [isJoined, isLoading, campaignCode, user.displayName]);

  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  useEffect(() => {
    const handler = () => leaveRoom();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [leaveRoom]);

  const value = useMemo<CameraContextValue>(
    () => ({
      isLoading,
      error,
      isJoined,
      participantCount,
      participants,
      joinRoom,
      leaveRoom,
    }),
    [isLoading, error, isJoined, participantCount, participants, joinRoom, leaveRoom]
  );

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

export function ShieldCameras() {
  const { isJoined, isLoading, error, participantCount, joinRoom, leaveRoom } = useCamera();
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="shield-camera-content">
      <div className="shield-camera-actions">
        <span>{participantCount} câmeras ao vivo</span>
        {isJoined ? (
          <button onClick={leaveRoom}>Sair da sala</button>
        ) : (
          <button disabled={isLoading} onClick={() => void joinRoom(containerRef.current)}>
            {isLoading ? "Conectando..." : "Entrar na sala"}
          </button>
        )}
      </div>
      {error && <p className="shield-camera-error">{error}</p>}
      <div ref={containerRef} className="shield-camera-grid" id="daily-video-container" />
      <DailyVideoGrid />
    </div>
  );
}

export function PlayerCamera() {
  const { isJoined, isLoading, error, joinRoom, leaveRoom } = useCamera();

  return (
    <div className="sheet-player-camera">
      {isJoined ? (
        <button onClick={leaveRoom}>Sair</button>
      ) : (
        <button disabled={isLoading} onClick={() => void joinRoom()}>
          {isLoading ? "Conectando..." : "📷 Entrar"}
        </button>
      )}
      {error && <p className="camera-error">{error}</p>}
    </div>
  );
}

export type CameraRosterEntry = {
  id: string;
  displayName: string;
  role?: Role;
  isOnline?: boolean;
  color?: string;
};

export function CameraWorkspace({ people }: { people: CameraRosterEntry[] }) {
  const { isJoined, isLoading, error, participantCount, joinRoom, leaveRoom } = useCamera();
  const containerRef = useRef<HTMLDivElement>(null);
  const onlineCount = people.filter((person) => person.isOnline).length;

  return (
    <div className="workspace-cameras">
      <div className="workspace-cameras-header">
        <div>
          <h3>Câmeras ({people.length})</h3>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>
            {onlineCount} {onlineCount === 1 ? "participante online" : "participantes online"} · {participantCount} na chamada
          </p>
        </div>
        {isJoined ? (
          <button onClick={leaveRoom}>Sair</button>
        ) : (
          <button disabled={isLoading} onClick={() => void joinRoom(containerRef.current)}>
            {isLoading ? "Conectando..." : "Entrar"}
          </button>
        )}
      </div>
      {error && <p className="camera-error">{error}</p>}
      <div ref={containerRef} className="workspace-cameras-grid" id="daily-workspace-container" />
      <DailyVideoGrid people={people} />
    </div>
  );
}

function normalizeParticipantName(name: string | undefined) {
  return (name || "").trim().toLocaleLowerCase();
}

function DailyVideoGrid({ people = [] }: { people?: CameraRosterEntry[] }) {
  const { participants } = useCamera();
  const dailyParticipants = Object.values(participants) as any[];
  const linkedSessions = new Set<string>();

  const tiles = people.map((person) => {
    const participant = dailyParticipants.find((item) =>
      normalizeParticipantName(item.user_name) === normalizeParticipantName(person.displayName)
    );
    if (participant?.session_id) linkedSessions.add(participant.session_id);
    return { id: person.id, person, participant };
  });

  // Guests that joined the Daily room but are not known by the campaign roster
  // are still visible rather than becoming an empty black area.
  dailyParticipants
    .filter((participant) => !linkedSessions.has(participant.session_id))
    .forEach((participant) => {
      tiles.push({
        id: participant.session_id || participant.user_name || crypto.randomUUID(),
        person: {
          id: participant.session_id || "guest",
          displayName: participant.user_name || "Convidado",
          isOnline: true,
        },
        participant,
      });
    });

  if (tiles.length === 0) {
    return (
      <div style={{ minHeight: 280, border: "1px dashed var(--border)", borderRadius: 16, display: "grid", placeItems: "center", color: "var(--text-secondary)", textAlign: "center", padding: 24 }}>
        Ainda não há participantes nesta mesa.
      </div>
    );
  }

  return (
    <div
      className="daily-participant-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 16, alignContent: "start" }}
    >
      {tiles.map((tile) => (
        <DailyParticipantTile key={tile.id} participant={tile.participant} person={tile.person} />
      ))}
    </div>
  );
}

function DailyParticipantTile({ participant, person }: { participant?: any; person: CameraRosterEntry }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const videoTrack = participant?.tracks?.video?.persistentTrack as MediaStreamTrack | undefined;
    const audioTrack = participant?.tracks?.audio?.persistentTrack as MediaStreamTrack | undefined;
    if (videoRef.current && videoTrack) {
      videoRef.current.srcObject = new MediaStream([videoTrack]);
    }
    if (audioRef.current && audioTrack) {
      audioRef.current.srcObject = new MediaStream([audioTrack]);
    }
  }, [participant]);

  const isCamOn = Boolean(participant?.tracks?.video?.persistentTrack);
  const isMicOn = Boolean(participant?.tracks?.audio?.persistentTrack);
  const label = participant?.user_name || person.displayName;
  const roleLabel = person.role === "master" ? "Mestre" : "Jogador";

  return (
    <article
      style={{
        position: "relative",
        minHeight: 220,
        background: "linear-gradient(145deg, var(--surface), color-mix(in srgb, var(--surface) 70%, #000))",
        border: `1px solid ${isCamOn ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 16,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        isolation: "isolate",
      }}
    >
      <div style={{ display: "grid", placeItems: "center", gap: 10, color: "var(--text-primary)", textAlign: "center", padding: 20 }}>
        <span
          style={{
            width: 72,
            height: 72,
            display: "grid",
            placeItems: "center",
            borderRadius: 999,
            border: `2px solid ${person.color || "var(--accent)"}`,
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            color: person.color || "var(--accent)",
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          {label.slice(0, 1).toUpperCase() || "?"}
        </span>
        <strong>{label}</strong>
        <small style={{ color: "var(--text-secondary)" }}>{person.isOnline ? roleLabel : "Offline"}</small>
      </div>

      {isCamOn && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant?.local}
          style={{ position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", objectFit: "cover", background: "#050808" }}
        />
      )}

      <div style={{ position: "absolute", zIndex: 2, inset: "auto 10px 10px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ background: "rgba(5, 10, 10, 0.78)", color: "#fff", fontSize: 12, padding: "5px 8px", borderRadius: 7, backdropFilter: "blur(6px)" }}>
          {label}
        </span>
        <span style={{ background: "rgba(5, 10, 10, 0.78)", color: "#fff", fontSize: 12, padding: "5px 8px", borderRadius: 7, backdropFilter: "blur(6px)" }}>
          {isCamOn ? "📹" : "◌"} {isMicOn ? "🎙" : "🔇"}
        </span>
      </div>
      {participant && <audio ref={audioRef} autoPlay playsInline />}
    </article>
  );
}

export function CharacterCamera({ userId, name }: { userId: string | null; name: string }) {
  return null;
}
