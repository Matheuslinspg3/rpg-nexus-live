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

export function CameraWorkspace() {
  const { isJoined, isLoading, error, participantCount, joinRoom, leaveRoom } = useCamera();
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="workspace-cameras">
      <div className="workspace-cameras-header">
        <h3>Câmeras ({participantCount})</h3>
        {isJoined ? (
          <button onClick={leaveRoom}>Sair</button>
        ) : (
          <button disabled={isLoading} onClick={() => void joinRoom(containerRef.current)}>
            {isLoading ? "..." : "Entrar"}
          </button>
        )}
      </div>
      {error && <p className="camera-error">{error}</p>}
      <div ref={containerRef} className="workspace-cameras-grid" id="daily-workspace-container" />
      <DailyVideoGrid />
    </div>
  );
}

function DailyVideoGrid() {
  const { participants } = useCamera();
  const list = Object.values(participants) as any[];
  if (list.length === 0) return null;
  return <div className="daily-participant-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 16 }}>{list.map((p) => <DailyParticipantTile key={p.session_id} participant={p} />)}</div>;
}

function DailyParticipantTile({ participant }: { participant: any }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const videoTrack = participant.tracks?.video?.persistentTrack as MediaStreamTrack | undefined;
    const audioTrack = participant.tracks?.audio?.persistentTrack as MediaStreamTrack | undefined;
    if (videoRef.current && videoTrack) {
      const stream = new MediaStream([videoTrack]);
      videoRef.current.srcObject = stream;
    }
    if (audioRef.current && audioTrack) {
      const stream = new MediaStream([audioTrack]);
      audioRef.current.srcObject = stream;
    }
  }, [participant]);

  const isCamOn = !!participant.tracks?.video?.persistentTrack;
  const isMicOn = !!participant.tracks?.audio?.persistentTrack;

  return (
    <div style={{ position: "relative", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9", display: "grid", placeItems: "center" }}>
      {isCamOn ? (
        <video ref={videoRef} autoPlay playsInline muted={participant.local} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 999, background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--text-primary)", fontWeight: 700 }}>
          {participant.user_name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
      <span style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 6 }}>
        {participant.user_name || "Convidado"} {isMicOn ? "🎙" : "🔇"}
      </span>
      <audio ref={audioRef} autoPlay playsInline />
    </div>
  );
}

export function CharacterCamera({ userId, name }: { userId: string | null; name: string }) {
  return null;
}
