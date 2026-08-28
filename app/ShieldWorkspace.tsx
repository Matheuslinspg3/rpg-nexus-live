"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ShieldCameras } from "./CameraSystem";

type Role = "master" | "player";
type RoomView = "sheet" | "scene" | "dice" | "camera" | "shield";
type RollVisibility = "public" | "master_private";
type ModuleId = "characters" | "cameras" | "scene" | "dice" | "text" | "youtube" | "pdf";
type ModuleSpan = 4 | 6 | 8 | 12;
type Character = { id: string; name: string; assignedUserId: string | null; assignedDisplayName: string | null; updatedAt: string };
type Scene = { hasImage: boolean; imageUrl: string | null; imageName: string | null; revealPercent: number; updatedAt: string | null };
type DiceRoll = { id: string; rollerName: string; visibility: RollVisibility; diceSides: number; diceCount: number; modifier: number; results: number[]; total: number; createdAt: string };
type ShieldLayout = {
  order: ModuleId[];
  hidden: ModuleId[];
  spans: Partial<Record<ModuleId, ModuleSpan>>;
  openCharacterIds: string[];
  textNote: string;
  youtubeUrl: string;
  pdfUrl: string;
};

const DEFAULT_SPANS: Record<ModuleId, ModuleSpan> = { characters: 8, cameras: 8, scene: 4, dice: 4, text: 4, youtube: 4, pdf: 4 };
const DEFAULT_LAYOUT: ShieldLayout = {
  order: ["characters", "cameras", "scene", "dice", "text", "youtube", "pdf"],
  hidden: [],
  spans: DEFAULT_SPANS,
  openCharacterIds: [],
  textNote: "Anotações rápidas do Mestre...",
  youtubeUrl: "",
  pdfUrl: "",
};
const MODULE_NAMES: Record<ModuleId, string> = {
  characters: "Fichas abertas",
  cameras: "Câmeras",
  scene: "Audiovisual",
  dice: "Dados",
  text: "Texto",
  youtube: "YouTube",
  pdf: "Visualizar PDF / livro",
};
const MODULE_ICONS: Record<ModuleId, string> = { characters: "◇", cameras: "▦", scene: "◈", dice: "✦", text: "≡", youtube: "▶", pdf: "▤" };

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
  return data;
}

export function ShieldWorkspace({ campaignCode, role, characters, scene, rolls, rollBusy, onRoll, onReveal, onOpenCharacter, onGoTo }: {
  campaignCode: string;
  role: Role;
  characters: Character[];
  scene: Scene;
  rolls: DiceRoll[];
  rollBusy: boolean;
  onRoll: (spec: { diceSides: number; diceCount: number; modifier: number; visibility: RollVisibility }) => void;
  onReveal: (value: number) => void;
  onOpenCharacter: (characterId: string) => void;
  onGoTo: (view: RoomView) => void;
}) {
  const [layout, setLayout] = useState<ShieldLayout>(DEFAULT_LAYOUT);
  const [organizing, setOrganizing] = useState(false);
  const [message, setMessage] = useState("");
  const [characterFields, setCharacterFields] = useState<Record<string, Record<string, string>>>({});
  const draggedRef = useRef<ModuleId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await readJson<{ layout: ShieldLayout }>(await fetch(`/api/campaigns/${campaignCode}/shield`, { cache: "no-store" }));
        if (!cancelled) setLayout(data.layout);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Não foi possível carregar o Escudo.");
      }
    })();
    return () => { cancelled = true; };
  }, [campaignCode]);

  const saveLayout = async (next: ShieldLayout) => {
    setLayout(next);
    setMessage("Salvando organização...");
    try {
      await readJson(await fetch(`/api/campaigns/${campaignCode}/shield`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ layout: next }),
      }));
      setMessage("Organização salva.");
      window.setTimeout(() => setMessage(""), 1600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a organização.");
    }
  };

  const updateLayout = (changes: Partial<ShieldLayout>) => {
    void saveLayout({ ...layout, ...changes });
  };

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      const ids = layout.openCharacterIds.filter((id) => characters.some((character) => character.id === id));
      if (ids.length) {
        const results = await Promise.all(ids.map(async (id) => {
          try {
            const data = await readJson<{ fields: Record<string, string> }>(await fetch(`/api/campaigns/${campaignCode}/characters/${id}`, { cache: "no-store" }));
            return [id, data.fields] as const;
          } catch { return [id, {}] as const; }
        }));
        if (!stopped) setCharacterFields(Object.fromEntries(results));
      } else if (!stopped) setCharacterFields({});
      if (!stopped) timer = window.setTimeout(() => void poll(), 850);
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [campaignCode, characters, layout.openCharacterIds]);

  const moveModule = (id: ModuleId, direction: -1 | 1) => {
    const index = layout.order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layout.order.length) return;
    const order = [...layout.order];
    [order[index], order[target]] = [order[target], order[index]];
    void saveLayout({ ...layout, order });
  };
  const dropModule = (target: ModuleId) => {
    const source = draggedRef.current;
    draggedRef.current = null;
    if (!source || source === target) return;
    const order = layout.order.filter((item) => item !== source);
    order.splice(order.indexOf(target), 0, source);
    void saveLayout({ ...layout, order });
  };
  const toggleCharacter = (id: string) => {
    const openCharacterIds = layout.openCharacterIds.includes(id)
      ? layout.openCharacterIds.filter((item) => item !== id)
      : [...layout.openCharacterIds, id].slice(0, 12);
    void saveLayout({ ...layout, openCharacterIds });
  };
  const hideModule = (id: ModuleId) => void saveLayout({ ...layout, hidden: [...new Set([...layout.hidden, id])] });
  const showModule = (id: ModuleId) => void saveLayout({ ...layout, hidden: layout.hidden.filter((item) => item !== id) });
  const resizeModule = (id: ModuleId) => {
    const sizes: ModuleSpan[] = [4, 6, 8, 12];
    const current = layout.spans[id] ?? DEFAULT_SPANS[id];
    const next = sizes[(sizes.indexOf(current) + 1) % sizes.length];
    updateLayout({ spans: { ...layout.spans, [id]: next } });
  };

  const renderContent = (id: ModuleId) => {
    if (id === "characters") return <ShieldCharacters characters={characters} openIds={layout.openCharacterIds} fields={characterFields} onToggle={toggleCharacter} onOpen={onOpenCharacter} />;
    if (id === "cameras") return <ShieldCameras />;
    if (id === "scene") return <ShieldScene scene={scene} role={role} onReveal={onReveal} />;
    if (id === "dice") return <ShieldDice rolls={rolls} role={role} busy={rollBusy} onRoll={onRoll} />;
    if (id === "text") return <ShieldText value={layout.textNote} onChange={(textNote) => updateLayout({ textNote })} />;
    if (id === "youtube") return <ShieldYoutube value={layout.youtubeUrl} onChange={(youtubeUrl) => updateLayout({ youtubeUrl })} />;
    return <ShieldPdf value={layout.pdfUrl} onChange={(pdfUrl) => updateLayout({ pdfUrl })} />;
  };

  return (
    <div className="shield-shell">
      <header className="shield-heading"><div><p className="eyebrow">Painel pessoal da campanha</p><h1>{role === "master" ? "Escudo do Mestre" : "Escudo do Player"}</h1><p>Reúna o que precisa acompanhar durante a sessão e organize os módulos do seu jeito.</p></div><div className="shield-heading-actions"><button className={organizing ? "active" : ""} onClick={() => setOrganizing((value) => !value)}>{organizing ? "Concluir organização" : "Organizar Escudo"}</button><button onClick={() => void saveLayout(DEFAULT_LAYOUT)}>Restaurar padrão</button></div></header>
      {message && <div className="shield-message">{message}</div>}
      {organizing && <div className="shield-organize-tip"><span>↕</span><p>Arraste os módulos ou use as setas. Você também pode ocultar e reativar módulos; tudo fica salvo só para você.</p></div>}
      <div className={`shield-grid ${organizing ? "is-organizing" : ""}`}>{layout.order.filter((id) => !layout.hidden.includes(id)).map((id) => (
        <section key={id} className={`shield-module shield-${id}`} style={{ gridColumn: `span ${layout.spans[id] ?? DEFAULT_SPANS[id]}` }} draggable={organizing} onDragStart={() => { draggedRef.current = id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropModule(id)}>
          <div className="shield-module-heading"><div><span>{MODULE_ICONS[id]}</span><strong>{MODULE_NAMES[id]}</strong></div><div>{organizing ? <><button onClick={() => moveModule(id, -1)} title="Mover para cima">↑</button><button onClick={() => moveModule(id, 1)} title="Mover para baixo">↓</button><button onClick={() => resizeModule(id)} title="Alterar tamanho">↔</button><button onClick={() => hideModule(id)} title="Ocultar módulo">×</button></> : <button onClick={() => onGoTo(id === "characters" ? "sheet" : id === "cameras" ? "camera" : id === "scene" ? "scene" : id === "dice" ? "dice" : "shield")}>{id === "characters" ? "Abrir ficha" : "Abrir módulo"} →</button>}</div></div>
          <div className="shield-module-body">{renderContent(id)}</div>
        </section>
      ))}</div>
      {organizing && layout.hidden.length > 0 && <div className="shield-hidden"><span>Módulos ocultos</span>{layout.hidden.map((id) => <button key={id} onClick={() => showModule(id)}>+ {MODULE_NAMES[id]}</button>)}</div>}
    </div>
  );
}

function ShieldCharacters({ characters, openIds, fields, onToggle, onOpen }: {
  characters: Character[];
  openIds: string[];
  fields: Record<string, Record<string, string>>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const opened = characters.filter((character) => openIds.includes(character.id));
  return <div className="shield-characters-content"><div className="shield-character-picker">{characters.map((character) => <button key={character.id} className={openIds.includes(character.id) ? "active" : ""} onClick={() => onToggle(character.id)}>{openIds.includes(character.id) ? "✓" : "+"} {character.name}</button>)}</div>{opened.length === 0 ? <div className="shield-content-empty"><span>◇</span><p>Escolha acima as fichas que deseja manter abertas no Escudo.</p></div> : <div className="shield-open-sheets">{opened.map((character) => { const values = fields[character.id] ?? {}; return <article key={character.id}><div><strong>{values.characterName || character.name}</strong><small>{values.ancestryClassLevel || character.assignedDisplayName || "Ficha da campanha"}</small></div><div className="shield-sheet-stats"><span><small>HP</small><b>{values.hpCurrent || "—"}/{values.hpMax || "—"}</b></span><span><small>Armadura</small><b>{values.armor || "—"}</b></span><span><small>Iniciativa</small><b>{values.initiative || "—"}</b></span></div><button onClick={() => onOpen(character.id)}>Abrir ficha →</button></article>; })}</div>}</div>;
}

function ShieldScene({ scene, role, onReveal }: { scene: Scene; role: Role; onReveal: (value: number) => void }) {
  const style = { "--shield-curtain-width": `${(100 - scene.revealPercent) / 2}%` } as CSSProperties;
  if (!scene.hasImage || !scene.imageUrl) return <div className="shield-content-empty dark"><span>◈</span><p>O Mestre ainda não preparou uma imagem.</p></div>;
  return <div className="shield-scene-content"><div className="shield-scene-stage" style={style}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={scene.imageUrl} alt={scene.imageName ?? "Cena da campanha"} />
    <i className="shield-curtain left" /><i className="shield-curtain right" />
  </div>{role === "master" && <label><span>Abertura da cortina <b>{scene.revealPercent}%</b></span><input type="range" min="0" max="100" value={scene.revealPercent} onChange={(event) => onReveal(Number(event.target.value))} /></label>}</div>;
}

function ShieldText({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="shield-note-field"><span>Anotações rápidas</span><textarea key={value} defaultValue={value} onBlur={(event) => onChange(event.currentTarget.value)} placeholder="Escreva pistas, NPCs, nomes ou lembretes..." /><small>Salvo no seu Escudo do Mestre</small></label>;
}

function youtubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    let videoId = url.searchParams.get("v");
    if (!videoId && url.hostname === "youtu.be") videoId = url.pathname.slice(1);
    if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch { return null; }
}

function ShieldYoutube({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const embed = youtubeEmbedUrl(value);
  return <div className="shield-media-widget"><label><span>URL do vídeo</span><input key={value} defaultValue={value} onBlur={(event) => onChange(event.currentTarget.value.trim())} placeholder="https://youtube.com/watch?v=..." /></label>{embed ? <iframe src={embed} title="Vídeo do YouTube" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div className="shield-content-empty compact"><span>▶</span><p>Adicione um link do YouTube para exibir o vídeo aqui.</p></div>}</div>;
}

function ShieldPdf({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="shield-media-widget"><label><span>URL do PDF ou livro</span><input key={value} defaultValue={value} onBlur={(event) => onChange(event.currentTarget.value.trim())} placeholder="https://.../livro.pdf" /></label>{value ? <iframe src={value} title="Visualizador de PDF" loading="lazy" /> : <div className="shield-content-empty compact"><span>▤</span><p>Adicione o endereço de um PDF para consultar durante a sessão.</p></div>}</div>;
}

function ShieldDice({ rolls, role, busy, onRoll }: { rolls: DiceRoll[]; role: Role; busy: boolean; onRoll: (spec: { diceSides: number; diceCount: number; modifier: number; visibility: RollVisibility }) => void }) {
  const [visibility, setVisibility] = useState<RollVisibility>("public");
  const recent = rolls.filter((roll) => roll.visibility === visibility).slice(0, 4);
  return <div className="shield-dice-content"><div className="shield-dice-mode"><button className={visibility === "public" ? "active" : ""} onClick={() => setVisibility("public")}>Público</button><button className={visibility === "master_private" ? "active secret" : ""} onClick={() => setVisibility("master_private")}>{role === "master" ? "Segredos" : "Com o Mestre"}</button></div><div className="shield-quick-dice">{[4,6,8,10,12,20,100].map((sides) => <button key={sides} disabled={busy} onClick={() => onRoll({ diceSides: sides, diceCount: 1, modifier: 0, visibility })}>d{sides}</button>)}</div><div className="shield-roll-results">{recent.length === 0 ? <p>Nenhum resultado neste canal.</p> : recent.map((roll) => <article key={roll.id}><span>{roll.rollerName}</span><small>{roll.diceCount}d{roll.diceSides}</small><strong>{roll.total}</strong></article>)}</div></div>;
}
