"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ShieldCameras } from "./CameraSystem";

type Role = "master" | "player";
type RoomView = "sheet" | "scene" | "dice" | "camera" | "shield";
type RollVisibility = "public" | "master_private";
type ModuleId = "characters" | "cameras" | "scene" | "dice";
type Character = { id: string; name: string; assignedUserId: string | null; assignedDisplayName: string | null; updatedAt: string };
type Scene = { hasImage: boolean; imageUrl: string | null; imageName: string | null; revealPercent: number; updatedAt: string | null };
type DiceRoll = { id: string; rollerName: string; visibility: RollVisibility; diceSides: number; diceCount: number; modifier: number; results: number[]; total: number; createdAt: string };
type ShieldLayout = { order: ModuleId[]; hidden: ModuleId[]; openCharacterIds: string[] };

const DEFAULT_LAYOUT: ShieldLayout = { order: ["characters", "cameras", "scene", "dice"], hidden: [], openCharacterIds: [] };
const MODULE_NAMES: Record<ModuleId, string> = { characters: "Fichas abertas", cameras: "Câmeras", scene: "Cena audiovisual", dice: "Dados" };

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
  const [discordOpen, setDiscordOpen] = useState(false);
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

  const renderContent = (id: ModuleId) => {
    if (id === "characters") return <ShieldCharacters characters={characters} openIds={layout.openCharacterIds} fields={characterFields} onToggle={toggleCharacter} onOpen={onOpenCharacter} />;
    if (id === "cameras") return <ShieldCameras />;
    if (id === "scene") return <ShieldScene scene={scene} role={role} onReveal={onReveal} />;
    return <ShieldDice rolls={rolls} role={role} busy={rollBusy} onRoll={onRoll} />;
  };

  return (
    <div className="shield-shell">
      <header className="shield-heading"><div><p className="eyebrow">Painel pessoal da campanha</p><h1>{role === "master" ? "Escudo do Mestre" : "Escudo do Player"}</h1><p>Reúna o que precisa acompanhar durante a sessão e organize os módulos do seu jeito.</p></div><div className="shield-heading-actions">{role === "master" && <button className={discordOpen ? "active" : ""} onClick={() => setDiscordOpen((value) => !value)}>Discord</button>}<button className={organizing ? "active" : ""} onClick={() => setOrganizing((value) => !value)}>{organizing ? "Concluir organização" : "Organizar Escudo"}</button><button onClick={() => void saveLayout(DEFAULT_LAYOUT)}>Restaurar padrão</button></div></header>
      {message && <div className="shield-message">{message}</div>}
      {role === "master" && discordOpen && <DiscordCampaignSettings campaignCode={campaignCode} />}
      {organizing && <div className="shield-organize-tip"><span>↕</span><p>Arraste os módulos ou use as setas. Você também pode ocultar e reativar módulos; tudo fica salvo só para você.</p></div>}
      <div className={`shield-grid ${organizing ? "is-organizing" : ""}`}>{layout.order.filter((id) => !layout.hidden.includes(id)).map((id) => (
        <section key={id} className={`shield-module shield-${id}`} draggable={organizing} onDragStart={() => { draggedRef.current = id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropModule(id)}>
          <div className="shield-module-heading"><div><span>{id === "characters" ? "◇" : id === "cameras" ? "▦" : id === "scene" ? "◈" : "✦"}</span><strong>{MODULE_NAMES[id]}</strong></div><div>{organizing ? <><button onClick={() => moveModule(id, -1)} title="Mover para cima">↑</button><button onClick={() => moveModule(id, 1)} title="Mover para baixo">↓</button><button onClick={() => hideModule(id)} title="Ocultar módulo">×</button></> : <button onClick={() => onGoTo(id === "characters" ? "sheet" : id === "cameras" ? "camera" : id)}>{id === "characters" ? "Abrir ficha" : "Tela completa"} →</button>}</div></div>
          <div className="shield-module-body">{renderContent(id)}</div>
        </section>
      ))}</div>
      {organizing && layout.hidden.length > 0 && <div className="shield-hidden"><span>Módulos ocultos</span>{layout.hidden.map((id) => <button key={id} onClick={() => showModule(id)}>+ {MODULE_NAMES[id]}</button>)}</div>}
    </div>
  );
}


function DiscordCampaignSettings({ campaignCode }: { campaignCode: string }) {
  const [form, setForm] = useState({ enabled: false, guildId: "", audiovisualChannelId: "", audiovisualVoiceChannelId: "", diceChannelId: "", musicChannelId: "" });
  const [state, setState] = useState("Carregando integração...");
  useEffect(() => { void (async () => { try { const data = await readJson<{ integration: typeof form }>(await fetch(`/api/campaigns/${campaignCode}/discord`, { cache: "no-store" })); setForm(data.integration); setState(""); } catch (error) { setState(error instanceof Error ? error.message : "Não foi possível carregar."); } })(); }, [campaignCode]);
  const save = async (event: React.FormEvent) => { event.preventDefault(); setState("Salvando..."); try { await readJson(await fetch(`/api/campaigns/${campaignCode}/discord`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ integration: form }) })); setState("Integração Discord salva."); } catch (error) { setState(error instanceof Error ? error.message : "Não foi possível salvar."); } };
  type ChannelKey = Exclude<keyof typeof form, "enabled">;
  const field = (key: ChannelKey, label: string, hint: string) => <label><span>{label}</span><small>{hint}</small><input value={String(form[key] || "")} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value }))} placeholder="ID numérico do Discord" /></label>;
  return <form className="discord-campaign-settings" onSubmit={save}><div><p className="eyebrow">Integração Discord</p><h2>Canais autorizados da campanha</h2><p>Use o modo desenvolvedor do Discord para copiar IDs. PVRP não é sincronizado ou catalogado.</p></div><label className="discord-toggle"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((value) => ({ ...value, enabled: event.target.checked }))} /> Ativar integração nesta campanha</label>{field("guildId", "Servidor", "ID do servidor Discord da campanha")}{field("audiovisualChannelId", "Audiovisual (texto)", "Cenas, câmeras e links do Cianna")}{field("audiovisualVoiceChannelId", "Audiovisual (voz)", "Canal de voz onde o bot entrará para gravar, após o consentimento")}{field("diceChannelId", "Dados e avisos", "Rollem faz rolagens; StoryTeller publica avisos de sessão")}{field("musicChannelId", "Músicas", "Somente referência ao bot de música existente")}<button type="submit">Salvar integração</button>{state && <p className="discord-settings-state">{state}</p>}</form>;
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

function ShieldDice({ rolls, role, busy, onRoll }: { rolls: DiceRoll[]; role: Role; busy: boolean; onRoll: (spec: { diceSides: number; diceCount: number; modifier: number; visibility: RollVisibility }) => void }) {
  const [visibility, setVisibility] = useState<RollVisibility>("public");
  const recent = rolls.filter((roll) => roll.visibility === visibility).slice(0, 4);
  return <div className="shield-dice-content"><div className="shield-dice-mode"><button className={visibility === "public" ? "active" : ""} onClick={() => setVisibility("public")}>Público</button><button className={visibility === "master_private" ? "active secret" : ""} onClick={() => setVisibility("master_private")}>{role === "master" ? "Segredos" : "Com o Mestre"}</button></div><div className="shield-quick-dice">{[4,6,8,10,12,20,100].map((sides) => <button key={sides} disabled={busy} onClick={() => onRoll({ diceSides: sides, diceCount: 1, modifier: 0, visibility })}>d{sides}</button>)}</div><div className="shield-roll-results">{recent.length === 0 ? <p>Nenhum resultado neste canal.</p> : recent.map((roll) => <article key={roll.id}><span>{roll.rollerName}</span><small>{roll.diceCount}d{roll.diceSides}</small><strong>{roll.total}</strong></article>)}</div></div>;
}
