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
  joinRoom: () => Promise<void>;
  leaveRoom: () => void;
};

const CameraContext = createContext<CameraContextValue | null>(null);

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
  const callObjectRef = useRef<DailyCall | null>(null);
  const roomUrlRef = useRef<string | null>(null);

  const joinRoom = useCallback(async () => {
    if (isJoined || isLoading) return;
    setIsLoading(true);
    setError("");

    try {
      // Get or create room
      const response = await fetch(`/api/campaigns/${campaignCode}/camera`);
      if (!response.ok) throw new Error("Failed to get camera room");
      
      const data = await response.json() as { roomUrl: string };
      roomUrlRef.current = data.roomUrl;

      // Create Daily call object
      const callObject = DailyIframe.createCallObject();
      callObjectRef.current = callObject;

      // Listen to events
      callObject.on("joined-meeting", () => {
        setIsJoined(true);
        setIsLoading(false);
      });

      callObject.on("participant-joined", () => {
        setParticipantCount(Object.keys(callObject.participants()).length);
      });

      callObject.on("participant-left", () => {
        setParticipantCount(Object.keys(callObject.participants()).length);
      });

      callObject.on("error", (event) => {
        console.error("Daily error:", event);
        setError("Erro ao conectar à sala de vídeo.");
        setIsLoading(false);
      });

      // Join the room
      await callObject.join({
        url: data.roomUrl,
        userName: user.displayName,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar.");
      setIsLoading(false);
    }
  }, [isJoined, isLoading, campaignCode, user.displayName]);

  const leaveRoom = useCallback(() => {
    if (callObjectRef.current) {
      callObjectRef.current.leave();
      callObjectRef.current.destroy();
      callObjectRef.current = null;
    }
    setIsJoined(false);
    setParticipantCount(0);
  }, []);

  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  const value = useMemo<CameraContextValue>(
    () => ({
      isLoading,
      error,
      isJoined,
      participantCount,
      joinRoom,
      leaveRoom,
    }),
    [isLoading, error, isJoined, participantCount, joinRoom, leaveRoom]
  );

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

// Shield cameras component (for master view)
export function ShieldCameras() {
  const { isJoined, isLoading, error, participantCount, joinRoom, leaveRoom } = useCamera();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isJoined && containerRef.current) {
      // Daily will automatically render video tiles in this container
      const callObject = DailyIframe.getCallInstance();
      if (callObject) {
        // You can customize the layout here if needed
      }
    }
  }, [isJoined]);

  return (
    <div className="shield-camera-content">
      <div className="shield-camera-actions">
        <span>{participantCount} câmeras ao vivo</span>
        {isJoined ? (
          <button onClick={leaveRoom}>Sair da sala</button>
        ) : (
          <button disabled={isLoading} onClick={() => void joinRoom()}>
            {isLoading ? "Conectando..." : "Entrar na sala"}
          </button>
        )}
      </div>
      {error && <p className="shield-camera-error">{error}</p>}
      <div ref={containerRef} className="shield-camera-grid" id="daily-video-container" />
    </div>
  );
}

// Player camera component (for player view)
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

// Workspace camera view (for scene view)
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
          <button disabled={isLoading} onClick={() => void joinRoom()}>
            {isLoading ? "..." : "Entrar"}
          </button>
        )}
      </div>
      {error && <p className="camera-error">{error}</p>}
      <div ref={containerRef} className="workspace-cameras-grid" id="daily-workspace-container" />
    </div>
  );
}

// Character camera (for sheet toolbar) - simplified for Daily
export function CharacterCamera({ userId, name }: { userId: string | null; name: string }) {
  // With Daily, we don't show individual character cameras in the toolbar
  // All participants are visible in the main camera grid
  return null;
}
