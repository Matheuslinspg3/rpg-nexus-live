"use client";

import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type CameraIdentity = { id: string; displayName: string };
type Role = "master" | "player";

type CameraContextValue = {
  isLoading: boolean;
  isMediaBusy: boolean;
  error: string;
  isJoined: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  participantCount: number;
  participants: Record<string, any>;
  joinRoom: (container?: HTMLElement | null) => Promise<void>;
  leaveRoom: () => void;
  toggleCamera: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
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

function isTrackOn(track: any) {
  return Boolean(track?.persistentTrack && track.state !== "off" && track.state !== "blocked");
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
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [error, setError] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const callRef = useRef<DailyCall | null>(null);
  const pendingContainerRef = useRef<HTMLElement | null>(null);
  const lastDailyErrorRef = useRef<string>("");
  const refreshParticipantsRef = useRef<(() => void) | null>(null);

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
    refreshParticipantsRef.current = null;
    setIsJoined(false);
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsScreenSharing(false);
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
      // Joining as a spectator does not request camera or microphone permission.
      const callObject = DailyIframe.createCallObject({
        audioSource: false,
        videoSource: false,
      } as any);
      callRef.current = callObject;

      const refreshParticipants = () => {
        const next = { ...callObject.participants() };
        const localParticipant = Object.values(next).find((participant: any) => participant?.local) as any;
        setParticipants(next);
        setParticipantCount(Object.keys(next).length);
        setIsCameraOn(isTrackOn(localParticipant?.tracks?.video));
        setIsMicOn(isTrackOn(localParticipant?.tracks?.audio));
        setIsScreenSharing(isTrackOn(localParticipant?.tracks?.screenVideo));
      };
      refreshParticipantsRef.current = refreshParticipants;

      callObject.on("joined-meeting", () => {
        setIsJoined(true);
        setIsLoading(false);
        refreshParticipants();
      });
      callObject.on("participant-joined", refreshParticipants);
      callObject.on("participant-left", refreshParticipants);
      callObject.on("participant-updated", refreshParticipants);
      callObject.on("local-screen-share-started", refreshParticipants);
      callObject.on("local-screen-share-stopped", refreshParticipants);

      callObject.on("left-meeting", () => {
        setIsJoined(false);
        setIsCameraOn(false);
        setIsMicOn(false);
        setIsScreenSharing(false);
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

      refreshParticipants();
      setIsJoined(true);

      if (targetContainer) {
        const currentParticipants = callObject.participants();
        setParticipants({ ...currentParticipants });
        setParticipantCount(Object.keys(currentParticipants).length);
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

  const toggleCamera = useCallback(async () => {
    const call = callRef.current as any;
    if (!call || !isJoined || isMediaBusy) return;
    setError("");
    setIsMediaBusy(true);
    try {
      await call.setLocalVideo(!isCameraOn);
      refreshParticipantsRef.current?.();
    } catch (err) {
      console.error("Could not change camera state:", err);
      setError("Não foi possível alterar a câmera. Verifique a permissão do navegador.");
    } finally {
      setIsMediaBusy(false);
    }
  }, [isJoined, isMediaBusy, isCameraOn]);

  const toggleMicrophone = useCallback(async () => {
    const call = callRef.current as any;
    if (!call || !isJoined || isMediaBusy) return;
    setError("");
    setIsMediaBusy(true);
    try {
      await call.setLocalAudio(!isMicOn);
      refreshParticipantsRef.current?.();
    } catch (err) {
      console.error("Could not change microphone state:", err);
      setError("Não foi possível alterar o microfone. Verifique a permissão do navegador.");
    } finally {
      setIsMediaBusy(false);
    }
  }, [isJoined, isMediaBusy, isMicOn]);

  const toggleScreenShare = useCallback(async () => {
    const call = callRef.current as any;
    if (!call || !isJoined || isMediaBusy) return;
    setError("");
    setIsMediaBusy(true);
    try {
      if (isScreenSharing) {
        await call.stopScreenShare();
      } else {
        await call.startScreenShare();
      }
      refreshParticipantsRef.current?.();
    } catch (err) {
      console.error("Could not change screen sharing state:", err);
      setError(isScreenSharing ? "Não foi possível parar o compartilhamento." : "O compartilhamento de tela não foi iniciado.");
    } finally {
      setIsMediaBusy(false);
    }
  }, [isJoined, isMediaBusy, isScreenSharing]);

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
      isMediaBusy,
      error,
      isJoined,
      isCameraOn,
      isMicOn,
      isScreenSharing,
      participantCount,
      participants,
      joinRoom,
      leaveRoom,
      toggleCamera,
      toggleMicrophone,
      toggleScreenShare,
    }),
    [isLoading, isMediaBusy, error, isJoined, isCameraOn, isMicOn, isScreenSharing, participantCount, participants, joinRoom, leaveRoom, toggleCamera, toggleMicrophone, toggleScreenShare]
  );

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

function CameraControls() {
  const { isCameraOn, isMicOn, isScreenSharing, isMediaBusy, toggleCamera, toggleMicrophone, toggleScreenShare } = useCamera();
  const buttonStyle = (active: boolean) => ({
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "color-mix(in srgb, var(--accent) 16%, var(--surface))" : "var(--surface)",
    color: active ? "var(--accent)" : "var(--text-primary)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: isMediaBusy ? "wait" : "pointer",
  });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 4px" }}>
      <button type="button" disabled={isMediaBusy} style={buttonStyle(isCameraOn)} onClick={() => void toggleCamera()}>
        {isCameraOn ? "📹 Desligar câmera" : "📷 Ligar câmera"}
      </button>
      <button type="button" disabled={isMediaBusy} style={buttonStyle(isMicOn)} onClick={() => void toggleMicrophone()}>
        {isMicOn ? "🎙 Silenciar" : "🔇 Ligar microfone"}
      </button>
      <button type="button" disabled={isMediaBusy} style={buttonStyle(isScreenSharing)} onClick={() => void toggleScreenShare()}>
        {isScreenSharing ? "⏹ Parar tela" : "🖥 Transmitir tela"}
      </button>
    </div>
  );
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
            {isLoading ? "Conectando..." : "Entrar para assistir"}
          </button>
        )}
      </div>
      {!isJoined && <p style={{ margin: "8px 0", color: "var(--text-secondary)", fontSize: 12 }}>Entre sem câmera; você verá os outros participantes antes de ativar a sua.</p>}
      {isJoined && <CameraControls />}
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
        <>
          <button onClick={leaveRoom}>Sair</button>
          <CameraControls />
        </>
      ) : (
        <button disabled={isLoading} onClick={() => void joinRoom()}>
          {isLoading ? "Conectando..." : "📷 Assistir às câmeras"}
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
            {isLoading ? "Conectando..." : "Entrar para assistir"}
          </button>
        )}
      </div>
      {!isJoined && <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>Você entra como espectador: pode ver todos sem liberar câmera ou microfone.</p>}
      {isJoined && <CameraControls />}
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
  const screenTrack = participant?.tracks?.screenVideo?.persistentTrack as MediaStreamTrack | undefined;
  const cameraTrack = participant?.tracks?.video?.persistentTrack as MediaStreamTrack | undefined;
  const videoTrack = screenTrack || cameraTrack;
  const isScreenSharing = isTrackOn(participant?.tracks?.screenVideo);
  const isCamOn = isTrackOn(participant?.tracks?.video);
  const isMicOn = isTrackOn(participant?.tracks?.audio);

  useEffect(() => {
    const audioTrack = participant?.tracks?.audio?.persistentTrack as MediaStreamTrack | undefined;
    if (videoRef.current && videoTrack) {
      videoRef.current.srcObject = new MediaStream([videoTrack]);
    }
    if (audioRef.current && audioTrack) {
      audioRef.current.srcObject = new MediaStream([audioTrack]);
    }
  }, [participant, videoTrack]);

  const label = participant?.user_name || person.displayName;
  const roleLabel = person.role === "master" ? "Mestre" : "Jogador";
  const hasVideo = isScreenSharing || isCamOn;

  return (
    <article
      style={{
        position: "relative",
        minHeight: 220,
        background: "linear-gradient(145deg, var(--surface), color-mix(in srgb, var(--surface) 70%, #000))",
        border: `1px solid ${hasVideo ? "var(--accent)" : "var(--border)"}`,
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

      {hasVideo && (
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
          {label}{isScreenSharing ? " · Tela" : ""}
        </span>
        <span style={{ background: "rgba(5, 10, 10, 0.78)", color: "#fff", fontSize: 12, padding: "5px 8px", borderRadius: 7, backdropFilter: "blur(6px)" }}>
          {isScreenSharing ? "🖥" : isCamOn ? "📹" : "◌"} {isMicOn ? "🎙" : "🔇"}
        </span>
      </div>
      {participant && <audio ref={audioRef} autoPlay playsInline />}
    </article>
  );
}

export function CharacterCamera({ userId, name }: { userId: string | null; name: string }) {
  return null;
}
