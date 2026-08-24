"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type CameraIdentity = { id: string; displayName: string };
type Role = "master" | "player";

type CameraState = {
  userId: string;
  displayName: string;
  isActive: boolean;
  stream: MediaStream | null;
};

type CameraContextValue = {
  states: CameraState[];
  localStream: MediaStream | null;
  isEnabled: boolean;
  isLoading: boolean;
  error: string;
  enableCamera: () => Promise<void>;
  disableCamera: () => void;
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
  const [states, setStates] = useState<CameraState[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pollingRef = useRef<number>(0);

  // Simple polling for camera states
  const pollStates = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignCode}/camera`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { states: Array<{ userId: string; displayName: string; isActive: boolean }> };
      
      setStates((current) =>
        data.states.map((state) => {
          const existing = current.find((s) => s.userId === state.userId);
          return {
            ...state,
            stream: existing?.stream || null,
          };
        })
      );
    } catch (error) {
      console.error("Failed to poll camera states:", error);
    }
  }, [campaignCode]);

  // Update server state
  const updateServerState = useCallback(async (isActive: boolean) => {
    try {
      await fetch(`/api/campaigns/${campaignCode}/camera`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
    } catch (error) {
      console.error("Failed to update camera state:", error);
    }
  }, [campaignCode]);

  // Enable camera
  const enableCamera = useCallback(async () => {
    if (localStreamRef.current || isLoading) return;
    setIsLoading(true);
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      await updateServerState(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível acessar a câmera.");
      localStreamRef.current = null;
      setLocalStream(null);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, updateServerState]);

  // Disable camera
  const disableCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    void updateServerState(false);
  }, [updateServerState]);

  // Polling loop
  useEffect(() => {
    void pollStates(); // Initial poll
    pollingRef.current = window.setInterval(() => void pollStates(), 2000);

    return () => {
      window.clearInterval(pollingRef.current);
      disableCamera();
    };
  }, [pollStates, disableCamera]);

  const value = useMemo<CameraContextValue>(
    () => ({
      states,
      localStream,
      isEnabled: Boolean(localStream),
      isLoading,
      error,
      enableCamera,
      disableCamera,
    }),
    [states, localStream, isLoading, error, enableCamera, disableCamera]
  );

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

// Video tile component
function VideoTile({ state, isSelf }: { state: CameraState; isSelf: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && state.stream) {
      videoRef.current.srcObject = state.stream;
    }
  }, [state.stream]);

  if (!state.isActive && !state.stream) return null;

  return (
    <div className="camera-tile">
      {state.stream ? (
        <video ref={videoRef} autoPlay playsInline muted={isSelf} className="camera-video" />
      ) : (
        <div className="camera-placeholder">
          <span>📷</span>
        </div>
      )}
      <div className="camera-name">{state.displayName}</div>
    </div>
  );
}

// Shield cameras component (for master view)
export function ShieldCameras() {
  const { states, localStream, isLoading, error, enableCamera, disableCamera } = useCamera();

  const activeCameras = states.filter((s) => s.isActive || s.stream).length;

  return (
    <div className="shield-camera-content">
      <div className="shield-camera-actions">
        <span>{activeCameras} câmeras ao vivo</span>
        {localStream ? (
          <button onClick={disableCamera}>Desligar minha câmera</button>
        ) : (
          <button disabled={isLoading} onClick={() => void enableCamera()}>
            {isLoading ? "Abrindo..." : "Ligar minha câmera"}
          </button>
        )}
      </div>
      {error && <p className="shield-camera-error">{error}</p>}
      <div className="shield-camera-grid">
        {states.slice(0, 6).map((state) => (
          <VideoTile key={state.userId} state={state} isSelf={false} />
        ))}
      </div>
    </div>
  );
}

// Player camera component (for player view)
export function PlayerCamera() {
  const { localStream, isLoading, error, enableCamera, disableCamera } = useCamera();

  if (!localStream) {
    return (
      <div className="sheet-player-camera">
        <button disabled={isLoading} onClick={() => void enableCamera()}>
          {isLoading ? "Abrindo..." : "📷 Ligar câmera"}
        </button>
        {error && <p className="camera-error">{error}</p>}
      </div>
    );
  }

  const selfState: CameraState = {
    userId: "self",
    displayName: "Você",
    isActive: true,
    stream: localStream,
  };

  return (
    <div className="sheet-player-camera">
      <VideoTile state={selfState} isSelf={true} />
      <button onClick={disableCamera}>Desligar</button>
    </div>
  );
}

// Workspace camera view (for scene view)
export function CameraWorkspace() {
  const { states, localStream, isLoading, error, enableCamera, disableCamera } = useCamera();

  const allStates = [
    ...(localStream
      ? [{ userId: "self", displayName: "Você", isActive: true, stream: localStream }]
      : []),
    ...states.filter((s) => s.userId !== "self"),
  ];

  return (
    <div className="workspace-cameras">
      <div className="workspace-cameras-header">
        <h3>Câmeras ({allStates.filter((s) => s.isActive).length})</h3>
        {localStream ? (
          <button onClick={disableCamera}>Desligar</button>
        ) : (
          <button disabled={isLoading} onClick={() => void enableCamera()}>
            {isLoading ? "..." : "Ligar"}
          </button>
        )}
      </div>
      {error && <p className="camera-error">{error}</p>}
      <div className="workspace-cameras-grid">
        {allStates.map((state) => (
          <VideoTile key={state.userId} state={state} isSelf={state.userId === "self"} />
        ))}
      </div>
    </div>
  );
}

// Character camera (for sheet toolbar)
export function CharacterCamera({ userId, name }: { userId: string | null; name: string }) {
  const { states } = useCamera();

  if (!userId) return null;

  const state = states.find((s) => s.userId === userId);
  if (!state?.isActive && !state?.stream) return null;

  return (
    <div className="character-camera-mini">
      <VideoTile state={state} isSelf={false} />
    </div>
  );
}
