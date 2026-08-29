"use client";

import { useCallback, useEffect, useState } from "react";

type RecordingPart = {
  id: string;
  partNumber: number;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number | null;
  url: string;
};

type Recording = {
  id: string;
  campaignCode: string;
  voiceChannelId: string | null;
  startedAt: string;
  stoppedAt: string | null;
  partCount: number;
  parts: RecordingPart[];
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar as gravações.");
  return data;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function RecordingLibrary({ campaignCode }: { campaignCode: string }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<{ recordings: Recording[] }>(await fetch("/api/campaigns/" + encodeURIComponent(campaignCode) + "/recordings", { cache: "no-store" }));
      setRecordings(data.recordings);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar as gravações.");
    } finally {
      setLoading(false);
    }
  }, [campaignCode]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="recordings-empty">Carregando gravações...</div>;
  if (error) return <div className="recordings-empty recordings-error">{error}<button type="button" onClick={() => void load()}>Tentar novamente</button></div>;
  if (!recordings.length) return <div className="recordings-empty"><strong>Nenhuma gravação disponível.</strong><span>Após encerrar uma sessão, o áudio aparecerá aqui depois do upload.</span><button type="button" onClick={() => void load()}>Atualizar</button></div>;

  return <div className="recordings-library">
    <div className="recordings-toolbar"><span>{recordings.length} sessão(ões) gravada(s)</span><button type="button" onClick={() => void load()}>Atualizar</button></div>
    {recordings.map((recording) => (
      <article className="recording-card" key={recording.id}>
        <header><div><strong>Gravação · {recording.campaignCode}</strong><small>{formatDate(recording.startedAt)}{recording.stoppedAt ? " — " + formatDate(recording.stoppedAt) : ""}</small></div><span>{recording.parts.length} parte(s)</span></header>
        <div className="recording-parts">
          {recording.parts.map((part) => <div className="recording-part" key={part.id}><div><strong>Parte {part.partNumber}</strong><small>{part.fileName} · {formatSize(part.sizeBytes)}</small></div><audio controls preload="metadata" src={part.url} /><a href={part.url} download>Baixar</a></div>)}
        </div>
      </article>
    ))}
  </div>;
}
