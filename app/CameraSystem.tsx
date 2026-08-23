"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

type Role = "master" | "player";
type RoomView = "sheet" | "scene" | "dice" | "camera" | "shield";
type CameraIdentity = { id: string; displayName: string };
type CameraPeer = {
  userId: string;
  sessionId: string;
  displayName: string;
  role: Role;
  cameraEnabled: boolean | number;
  updatedAt: string;
};
type CameraSignal = {
  id: string;
  fromUserId: string;
  fromName: string;
  fromSessionId: string;
  signalType: "offer" | "answer" | "candidate";
  payload: string;
};
type CameraParticipant = {
  userId: string;
  displayName: string;
  role: Role;
  isSelf: boolean;
  cameraEnabled: boolean;
  stream: MediaStream | null;
};
type CameraContextValue = {
  participants: CameraParticipant[];
  localStream: MediaStream | null;
  cameraError: string;
  cameraBusy: boolean;
  enableCamera: () => Promise<void>;
  disableCamera: () => Promise<void>;
};
type Connection = { pc: RTCPeerConnection; sessionId: string; video: RTCRtpTransceiver };

const CameraContext = createContext<CameraContextValue | null>(null);
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function useCamera() {
  const value = useContext(CameraContext);
  if (!value) throw new Error("CameraProvider ausente.");
  return value;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

export function CameraProvider({ campaignCode, user, role, activeView, children }: {
  campaignCode: string;
  user: CameraIdentity;
  role: Role;
  activeView: RoomView;
  children: ReactNode;
}) {
  const sessionIdRef = useRef(crypto.randomUUID());
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, Connection>>(new Map());
  const candidateQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peersRef = useRef<Map<string, CameraPeer>>(new Map());
  const activeViewRef = useRef(activeView);
  const [peers, setPeers] = useState<CameraPeer[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);

  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

  const post = useCallback(async (body: Record<string, unknown>, keepalive = false) => {
    const response = await fetch(`/api/campaigns/${campaignCode}/camera`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || "Falha na conexão de câmera.");
    }
  }, [campaignCode]);

  const heartbeat = useCallback(async (enabled = Boolean(localStreamRef.current)) => {
    try {
      await post({ action: "heartbeat", sessionId: sessionIdRef.current, cameraEnabled: enabled });
    } catch { /* A próxima pulsação tenta novamente. */ }
  }, [post]);

  const signal = useCallback(async (peer: CameraPeer, signalType: CameraSignal["signalType"], payload: unknown) => {
    try {
      await post({
        action: "signal",
        sessionId: sessionIdRef.current,
        toUserId: peer.userId,
        toSessionId: peer.sessionId,
        signalType,
        payload: JSON.stringify(payload),
      });
    } catch { /* Stale peers are removed by the next poll. */ }
  }, [post]);

  const removeConnection = useCallback((userId: string) => {
    const connection = connectionsRef.current.get(userId);
    if (connection) connection.pc.close();
    connectionsRef.current.delete(userId);
    candidateQueuesRef.current.delete(userId);
    setRemoteStreams((current) => {
      if (!current[userId]) return current;
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }, []);

  const ensureConnection = useCallback(async (peer: CameraPeer, initiate: boolean) => {
    const existing = connectionsRef.current.get(peer.userId);
    if (existing?.sessionId === peer.sessionId && existing.pc.connectionState !== "closed") return existing;
    if (existing) removeConnection(peer.userId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const video = pc.addTransceiver("video", { direction: "sendrecv" });
    const connection: Connection = { pc, sessionId: peer.sessionId, video };
    connectionsRef.current.set(peer.userId, connection);
    const localTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    if (localTrack) await video.sender.replaceTrack(localTrack);

    pc.onicecandidate = (event) => {
      if (event.candidate) void signal(peer, "candidate", event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStreams((current) => current[peer.userId] === stream ? current : { ...current, [peer.userId]: stream });
      event.track.onended = () => setRemoteStreams((current) => {
        if (!current[peer.userId]) return current;
        const next = { ...current };
        delete next[peer.userId];
        return next;
      });
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) removeConnection(peer.userId);
    };

    if (initiate) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await signal(peer, "offer", offer);
    }
    return connection;
  }, [removeConnection, signal]);

  const flushCandidates = useCallback(async (userId: string, pc: RTCPeerConnection) => {
    const queued = candidateQueuesRef.current.get(userId) ?? [];
    candidateQueuesRef.current.delete(userId);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* A later renegotiation can recover. */ }
    }
  }, []);

  const processSignal = useCallback(async (incoming: CameraSignal) => {
    const knownPeer = peersRef.current.get(incoming.fromUserId);
    const peer: CameraPeer = knownPeer ?? {
      userId: incoming.fromUserId,
      sessionId: incoming.fromSessionId,
      displayName: incoming.fromName,
      role: "player",
      cameraEnabled: true,
      updatedAt: new Date().toISOString(),
    };
    if (peer.sessionId !== incoming.fromSessionId) return;
    const connection = await ensureConnection(peer, false);
    const parsed = JSON.parse(incoming.payload) as RTCSessionDescriptionInit | RTCIceCandidateInit;

    if (incoming.signalType === "offer") {
      if (connection.pc.signalingState !== "stable") {
        try { await connection.pc.setLocalDescription({ type: "rollback" }); } catch { /* Continue with the remote offer. */ }
      }
      await connection.pc.setRemoteDescription(parsed as RTCSessionDescriptionInit);
      await flushCandidates(peer.userId, connection.pc);
      const answer = await connection.pc.createAnswer();
      await connection.pc.setLocalDescription(answer);
      await signal(peer, "answer", answer);
      return;
    }
    if (incoming.signalType === "answer") {
      if (connection.pc.signalingState === "have-local-offer") {
        await connection.pc.setRemoteDescription(parsed as RTCSessionDescriptionInit);
        await flushCandidates(peer.userId, connection.pc);
      }
      return;
    }
    const candidate = parsed as RTCIceCandidateInit;
    if (connection.pc.remoteDescription) await connection.pc.addIceCandidate(candidate);
    else candidateQueuesRef.current.set(peer.userId, [...(candidateQueuesRef.current.get(peer.userId) ?? []), candidate]);
  }, [ensureConnection, flushCandidates, signal]);

  useEffect(() => {
    let stopped = false;
    let heartbeatTimer = 0;
    let pollTimer = 0;
    const cameraSessionId = sessionIdRef.current;
    const connections = connectionsRef.current;

    const poll = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignCode}/camera?sessionId=${encodeURIComponent(sessionIdRef.current)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Falha de sinalização");
        const data = await response.json() as { peers: CameraPeer[]; signals: CameraSignal[] };
        if (stopped) return;
        const peerMap = new Map(data.peers.map((peer) => [peer.userId, peer]));
        peersRef.current = peerMap;
        setPeers((current) => {
          const unchanged = current.length === data.peers.length && data.peers.every((peer, index) => {
            const before = current[index];
            return before?.userId === peer.userId && before.sessionId === peer.sessionId && Boolean(before.cameraEnabled) === Boolean(peer.cameraEnabled);
          });
          return unchanged ? current : data.peers;
        });

        for (const [userId, connection] of connectionsRef.current) {
          const active = peerMap.get(userId);
          if (!active || active.sessionId !== connection.sessionId) removeConnection(userId);
        }
        for (const peer of data.peers) {
          // Always ensure connection exists, but only the "lower" ID sends the offer
          const shouldOffer = user.id.localeCompare(peer.userId) < 0;
          try { await ensureConnection(peer, shouldOffer); } catch { removeConnection(peer.userId); }
        }

        const acknowledged: string[] = [];
        for (const incoming of data.signals) {
          try { await processSignal(incoming); } catch { /* A failed exchange will be recreated on the next peer cycle. */ }
          acknowledged.push(incoming.id);
        }
        if (acknowledged.length) {
          void post({ action: "ack", sessionId: sessionIdRef.current, ids: acknowledged });
        }
        setCameraError("");
      } catch {
        if (!stopped) setCameraError((current) => current || "Reconectando as câmeras...");
      } finally {
        const needsRealtimeVideo = Boolean(localStreamRef.current) || ["sheet", "camera", "shield"].includes(activeViewRef.current);
        if (!stopped) pollTimer = window.setTimeout(() => void poll(), needsRealtimeVideo ? 600 : 2_400);
      }
    };
    const pulse = async () => {
      await heartbeat();
      if (!stopped) heartbeatTimer = window.setTimeout(() => void pulse(), 3_000);
    };

    void (async () => {
      await heartbeat();
      if (!stopped) {
        void poll();
        heartbeatTimer = window.setTimeout(() => void pulse(), 3_000);
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(heartbeatTimer);
      window.clearTimeout(pollTimer);
      void post({ action: "leave", sessionId: cameraSessionId }, true).catch(() => undefined);
      for (const { pc } of connections.values()) pc.close();
      connections.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [campaignCode, ensureConnection, heartbeat, post, processSignal, removeConnection, user.id]);

  const enableCamera = useCallback(async () => {
    if (localStreamRef.current || cameraBusy) return;
    setCameraBusy(true);
    setCameraError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não oferece acesso à câmera.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: "user" },
        audio: false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const track = stream.getVideoTracks()[0] ?? null;
      for (const connection of connectionsRef.current.values()) await connection.video.sender.replaceTrack(track);
      await heartbeat(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Não foi possível acessar a câmera.");
    } finally { setCameraBusy(false); }
  }, [cameraBusy, heartbeat]);

  const disableCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    setLocalStream(null);
    stream?.getTracks().forEach((track) => track.stop());
    for (const connection of connectionsRef.current.values()) await connection.video.sender.replaceTrack(null);
    await heartbeat(false);
  }, [heartbeat]);

  const participants = useMemo<CameraParticipant[]>(() => [
    { userId: user.id, displayName: user.displayName, role, isSelf: true, cameraEnabled: Boolean(localStream), stream: localStream },
    ...peers.map((peer) => ({
      userId: peer.userId,
      displayName: peer.displayName,
      role: peer.role,
      isSelf: false,
      cameraEnabled: Boolean(peer.cameraEnabled),
      stream: Boolean(peer.cameraEnabled) ? remoteStreams[peer.userId] ?? null : null,
    })),
  ], [localStream, peers, remoteStreams, role, user.displayName, user.id]);

  const value = useMemo<CameraContextValue>(() => ({
    participants, localStream, cameraError, cameraBusy, enableCamera, disableCamera,
  }), [cameraBusy, cameraError, disableCamera, enableCamera, localStream, participants]);

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

function StreamVideo({ stream, muted = false, className = "", videoRef }: {
  stream: MediaStream;
  muted?: boolean;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { if (video.srcObject === stream) video.srcObject = null; };
  }, [ref, stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

async function requestVideoPip(video: HTMLVideoElement | null) {
  if (!video) return "Câmera ainda não carregada.";
  if (!("pictureInPictureEnabled" in document) || !document.pictureInPictureEnabled || !video.requestPictureInPicture) {
    return "Picture-in-Picture não é compatível com este navegador.";
  }
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    await video.requestPictureInPicture();
    return "";
  } catch {
    return "Não foi possível abrir o Picture-in-Picture.";
  }
}

function VideoTile({ participant, compact = false, onFocus }: {
  participant: CameraParticipant;
  compact?: boolean;
  onFocus?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pipError, setPipError] = useState("");
  return (
    <article className={`camera-tile ${compact ? "compact" : ""} ${participant.stream ? "is-live" : ""}`}>
      {participant.stream ? <StreamVideo stream={participant.stream} muted={participant.isSelf} videoRef={videoRef} /> : <div className="camera-placeholder"><span>{initials(participant.displayName)}</span><strong>{participant.cameraEnabled ? "Conectando câmera..." : "Câmera desligada"}</strong></div>}
      <div className="camera-tile-bar"><div><i className={participant.stream ? "live" : ""} /><strong>{participant.displayName}</strong><small>{participant.isSelf ? "Você" : participant.role === "master" ? "Mestre" : "Player"}</small></div><div className="camera-tile-actions">{onFocus && <button onClick={onFocus} title="Ver câmera em destaque">Foco</button>}<button disabled={!participant.stream} onClick={async () => setPipError(await requestVideoPip(videoRef.current))} title="Abrir esta câmera em Picture-in-Picture">PiP</button></div></div>
      {pipError && <p className="camera-inline-error">{pipError}</p>}
    </article>
  );
}

export function CameraWorkspace() {
  const { participants, localStream, cameraError, cameraBusy, enableCamera, disableCamera } = useCamera();
  const [layout, setLayout] = useState<"mosaic" | "focus">("mosaic");
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
  const [pipMessage, setPipMessage] = useState("");
  const mosaicCleanupRef = useRef<(() => void) | null>(null);
  const liveParticipants = participants.filter((participant) => participant.stream);
  const focused = participants.find((participant) => participant.userId === focusedUserId) ?? liveParticipants[0] ?? participants[0];

  useEffect(() => () => mosaicCleanupRef.current?.(), []);

  const openMosaicPip = async () => {
    setPipMessage("");
    if (!liveParticipants.length) {
      setPipMessage("Ligue ao menos uma câmera para abrir o mosaico em PiP.");
      return;
    }
    if (!document.pictureInPictureEnabled) {
      setPipMessage("O navegador não oferece Picture-in-Picture.");
      return;
    }
    mosaicCleanupRef.current?.();
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) return;
    const sources = liveParticipants.map((participant) => {
      const video = document.createElement("video");
      video.srcObject = participant.stream;
      video.muted = true;
      video.playsInline = true;
      void video.play().catch(() => undefined);
      return { participant, video };
    });
    const output = document.createElement("video");
    output.muted = true;
    output.playsInline = true;
    output.style.position = "fixed";
    output.style.width = "1px";
    output.style.height = "1px";
    output.style.opacity = "0";
    document.body.appendChild(output);
    let frame = 0;
    const draw = () => {
      context.fillStyle = "#101312";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const columns = Math.ceil(Math.sqrt(sources.length));
      const rows = Math.ceil(sources.length / columns);
      const cellWidth = canvas.width / columns;
      const cellHeight = canvas.height / rows;
      sources.forEach(({ participant, video }, index) => {
        const x = (index % columns) * cellWidth;
        const y = Math.floor(index / columns) * cellHeight;
        if (video.readyState >= 2) {
          const scale = Math.max(cellWidth / video.videoWidth, cellHeight / video.videoHeight);
          const width = video.videoWidth * scale;
          const height = video.videoHeight * scale;
          context.drawImage(video, x + (cellWidth - width) / 2, y + (cellHeight - height) / 2, width, height);
        }
        context.fillStyle = "rgba(0,0,0,.72)";
        context.fillRect(x + 12, y + cellHeight - 44, Math.min(250, cellWidth - 24), 30);
        context.fillStyle = "#ffffff";
        context.font = "600 16px sans-serif";
        context.fillText(participant.displayName, x + 23, y + cellHeight - 23, cellWidth - 45);
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    const captured = canvas.captureStream(20);
    output.srcObject = captured;
    await output.play();
    const cleanup = () => {
      cancelAnimationFrame(frame);
      captured.getTracks().forEach((track) => track.stop());
      sources.forEach(({ video }) => { video.pause(); video.srcObject = null; });
      output.pause();
      output.srcObject = null;
      output.remove();
      mosaicCleanupRef.current = null;
    };
    mosaicCleanupRef.current = cleanup;
    output.addEventListener("leavepictureinpicture", cleanup, { once: true });
    try { await output.requestPictureInPicture(); } catch { cleanup(); setPipMessage("Não foi possível abrir o mosaico em PiP."); }
  };

  return (
    <div className="camera-shell">
      <div className="camera-workspace-toolbar"><div><p className="eyebrow">Vídeo entre jogadores</p><h1>Câmeras da campanha</h1><p>Veja todos em mosaico, destaque um Player ou leve a transmissão para Picture-in-Picture.</p></div><div className="camera-main-actions"><div className="camera-layout-switch"><button className={layout === "mosaic" ? "active" : ""} onClick={() => setLayout("mosaic")}>Mosaico</button><button className={layout === "focus" ? "active" : ""} onClick={() => setLayout("focus")}>Uma câmera</button></div><button className="mosaic-pip-button" disabled={!liveParticipants.length} onClick={() => void openMosaicPip()}>Mosaico em PiP</button>{localStream ? <button className="camera-off-button" onClick={() => void disableCamera()}>Desligar câmera</button> : <button className="camera-on-button" disabled={cameraBusy} onClick={() => void enableCamera()}>{cameraBusy ? "Abrindo..." : "Ligar minha câmera"}</button>}</div></div>
      {(cameraError || pipMessage) && <div className="camera-message">{cameraError || pipMessage}</div>}
      {layout === "mosaic" ? (
        <div className={`camera-grid camera-count-${Math.min(participants.length, 6)}`}>{participants.map((participant) => <VideoTile key={participant.userId} participant={participant} onFocus={() => { setFocusedUserId(participant.userId); setLayout("focus"); }} />)}</div>
      ) : (
        <div className="camera-focus-layout">{focused && <VideoTile participant={focused} />}<div className="camera-filmstrip">{participants.filter((participant) => participant.userId !== focused?.userId).map((participant) => <VideoTile key={participant.userId} participant={participant} compact onFocus={() => setFocusedUserId(participant.userId)} />)}</div></div>
      )}
      <div className="camera-privacy-note"><span>⌁</span><p>O vídeo trafega diretamente entre os navegadores dos participantes. O RPG Nexus não grava as câmeras.</p></div>
    </div>
  );
}

export function CharacterCamera({ userId, name }: { userId: string | null; name: string }) {
  const { participants } = useCamera();
  if (!userId) return null;
  const participant = participants.find((item) => item.userId === userId) ?? {
    userId,
    displayName: name,
    role: "player" as const,
    isSelf: false,
    cameraEnabled: false,
    stream: null,
  };
  return <div className="sheet-player-camera"><VideoTile participant={participant} compact /></div>;
}

export function ShieldCameras() {
  const { participants, localStream, cameraBusy, cameraError, enableCamera, disableCamera } = useCamera();
  return (
    <div className="shield-camera-content">
      <div className="shield-camera-actions"><span>{participants.filter((participant) => participant.stream).length} câmeras ao vivo</span>{localStream ? <button onClick={() => void disableCamera()}>Desligar a minha</button> : <button disabled={cameraBusy} onClick={() => void enableCamera()}>{cameraBusy ? "Abrindo..." : "Ligar minha câmera"}</button>}</div>
      {cameraError && <p className="shield-camera-error">{cameraError}</p>}
      <div className="shield-camera-grid">{participants.slice(0, 6).map((participant) => <VideoTile key={participant.userId} participant={participant} compact />)}</div>
    </div>
  );
}
