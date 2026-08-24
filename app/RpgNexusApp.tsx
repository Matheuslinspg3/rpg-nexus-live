"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { CameraProvider, CameraWorkspace, CharacterCamera } from "./CameraSystem";
import { getNimbleLayout, NIMBLE_LAYOUTS, type NimbleLayoutDefinition, type NimbleLayoutId } from "./nimbleLayouts";
import { ShieldWorkspace } from "./ShieldWorkspace";
import { createBrowserClient } from "@/lib/supabase";

type User = { id: string; displayName: string; username: string };
type Role = "master" | "player";
type CampaignListItem = {
  id: string;
  code: string;
  name: string;
  system: string;
  masterName: string;
  role: Role;
  memberCount: number;
  updatedAt: string;
};
type Campaign = CampaignListItem & { version: number };
type Member = { email: string; displayName: string; role: Role };
type Character = {
  id: string;
  name: string;
  assignedUserId: string | null;
  assignedDisplayName: string | null;
  updatedAt: string;
};
type Presence = Member & {
  color: string;
  cursorX: number | null;
  cursorY: number | null;
  editingField: string | null;
  activeAt: string;
};
type RoomPayload = {
  campaign: Campaign;
  characters: Character[];
  members: Member[];
  presence: Presence[];
  viewerEmail: string;
};
type SaveState = "saved" | "saving" | "offline";
type RoomView = "sheet" | "scene" | "dice" | "camera" | "shield";
type Scene = {
  hasImage: boolean;
  imageUrl: string | null;
  imageName: string | null;
  revealPercent: number;
  updatedAt: string | null;
};
type RollVisibility = "public" | "master_private";
type DiceRoll = {
  id: string;
  rollerUserId: string;
  rollerName: string;
  visibility: RollVisibility;
  diceSides: number;
  diceCount: number;
  modifier: number;
  results: number[];
  total: number;
  createdAt: string;
};

const fieldLabels: Record<string, string> = {
  characterName: "Nome do personagem",
  ancestryClassLevel: "Ancestralidade, classe e nível",
  heightWeightSpeed: "Altura, peso e deslocamento",
  hitDice: "Dado de vida",
  str: "Força", dex: "Destreza", int: "Inteligência", wil: "Vontade",
  hpCurrent: "HP atual", hpMax: "HP máximo", tempHp: "HP temporário",
  armor: "Armadura", initiative: "Iniciativa",
  wound1: "Ferimento 1", wound2: "Ferimento 2", wound3: "Ferimento 3",
  wound4: "Ferimento 4", wound5: "Ferimento 5",
  arcana: "Arcana", examination: "Investigação", finesse: "Finesse",
  influence: "Influência", insight: "Intuição", lore: "Conhecimento",
  might: "Poder", naturecraft: "Natureza", perception: "Percepção", stealth: "Furtividade",
  features: "Habilidades e equipamentos", spells: "Magias e recursos", notes: "Anotações",
  classLayout: "Layout da classe", proficiencies: "Proficiências",
  classFeatures: "Habilidades da classe", classResource1Current: "Recurso de classe atual",
  classResource1Max: "Recurso de classe máximo", classResource2Current: "Recurso secundário atual",
  classResource2Max: "Recurso secundário máximo", spellTier: "Círculo de magia",
  portraitUrl: "Retrato", level: "Nível", subclass: "Subclasse", size: "Tamanho", speed: "Deslocamento",
};

const stats = [["str", "STR"], ["dex", "DEX"], ["int", "INT"], ["wil", "WIL"]] as const;
const skills = [
  ["arcana", "ARCANA", "INT"], ["examination", "INVESTIGAÇÃO", "INT"],
  ["finesse", "FINESSE", "DEX"], ["influence", "INFLUÊNCIA", "WIL"],
  ["insight", "INTUIÇÃO", "WIL"], ["lore", "CONHECIMENTO", "INT"],
  ["might", "PODER", "STR"], ["naturecraft", "NATUREZA", "WIL"],
  ["perception", "PERCEPÇÃO", "WIL"], ["stealth", "FURTIVIDADE", "DEX"],
] as const;

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
  return data;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function roleLabel(role: Role) { return role === "master" ? "Mestre" : "Player"; }

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatRecent(date: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} d`;
}

function sameFields(current: Record<string, string>, next: Record<string, string>) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === next[key]);
}

function samePresence(current: Presence[], next: Presence[]) {
  if (current.length !== next.length) return false;
  return next.every((person, index) => {
    const before = current[index];
    return before?.email === person.email
      && before.displayName === person.displayName
      && before.role === person.role
      && before.color === person.color
      && before.cursorX === person.cursorX
      && before.cursorY === person.cursorY
      && before.editingField === person.editingField;
  });
}

function sameScene(current: Scene, next: Scene) {
  return current.hasImage === next.hasImage
    && current.imageUrl === next.imageUrl
    && current.imageName === next.imageName
    && current.revealPercent === next.revealPercent;
}

function sameRolls(current: DiceRoll[], next: DiceRoll[]) {
  return current.length === next.length && next.every((roll, index) => current[index]?.id === roll.id);
}

function parseClassFeatures(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default function RpgNexusApp({ initialUser }: { initialUser: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [roomView, setRoomView] = useState<RoomView>("sheet");
  const [scene, setScene] = useState<Scene>({ hasImage: false, imageUrl: null, imageName: null, revealPercent: 0, updatedAt: null });
  const [sceneBusy, setSceneBusy] = useState(false);
  const [rolls, setRolls] = useState<DiceRoll[]>([]);
  const [rollBusy, setRollBusy] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterLayout, setNewCharacterLayout] = useState<NimbleLayoutId>("BASE");
  const [characterAction, setCharacterAction] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"create" | "join" | null>(null);
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeFieldRef = useRef<string | null>(null);
  const saveTimers = useRef<Record<string, number | NodeJS.Timeout>>({});
  const dirtyFieldsRef = useRef<Record<string, string>>({});
  const queuedFieldValuesRef = useRef<Record<string, string>>({});
  const savingFieldsRef = useRef<Set<string>>(new Set());
  const roomCodeRef = useRef<string | null>(null);
  const selectedCharacterRef = useRef<string | null>(null);
  const roomViewRef = useRef<RoomView>("sheet");
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const lastPresenceSent = useRef(0);
  const presenceSendingRef = useRef(false);
  const presenceQueuedRef = useRef(false);
  const characterRequestRef = useRef(0);
  const roomRequestRef = useRef(0);
  const presenceRequestRef = useRef(0);
  const sceneRequestRef = useRef(0);
  const rollsRequestRef = useRef(0);
  const revealSendingRef = useRef(false);
  const revealQueuedRef = useRef<number | null>(null);
  const revealOptimisticRef = useRef<number | null>(null);
  const revealReleaseTimerRef = useRef<number | NodeJS.Timeout | null>(null);
  const scenePreloadRef = useRef<HTMLImageElement | null>(null);

  const loadCampaigns = useCallback(async () => {
    if (!user) return;
    try {
      const data = await readJson<{ campaigns: CampaignListItem[] }>(await fetch("/api/campaigns", { cache: "no-store" }));
      setCampaigns(data.campaigns);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível carregar as campanhas.");
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void loadCampaigns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaigns, user]);

  const fetchCharacter = useCallback(async (code: string, characterId: string, quiet = false) => {
    const requestId = ++characterRequestRef.current;
    try {
      const data = await readJson<{ fields: Record<string, string> }>(await fetch(
        `/api/campaigns/${code}/characters/${characterId}`,
        { cache: "no-store" },
      ));
      if (requestId !== characterRequestRef.current || selectedCharacterRef.current !== characterId) return null;
      const prefix = `${characterId}:`;
      const localFields = Object.fromEntries(Object.entries(dirtyFieldsRef.current)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value]));
      const nextFields = { ...data.fields, ...localFields };
      setFields((current) => sameFields(current, nextFields) ? current : nextFields);
      if (Object.keys(localFields).length === 0) setSaveState("saved");
      if (!quiet) setNotice("");
      return data;
    } catch (error) {
      setSaveState("offline");
      if (!quiet) setNotice(error instanceof Error ? error.message : "Não foi possível abrir a ficha.");
      return null;
    }
  }, []);

  const fetchRoom = useCallback(async (code: string, quiet = false) => {
    const requestId = ++roomRequestRef.current;
    try {
      const data = await readJson<RoomPayload>(await fetch(`/api/campaigns/${code}`, { cache: "no-store" }));
      if (requestId !== roomRequestRef.current) return null;
      setRoom({ ...data, campaign: { ...data.campaign, memberCount: data.members.length } });
      if (!quiet) setPresence(data.presence);
      roomCodeRef.current = code;
      const selectedStillExists = data.characters.some((character) => character.id === selectedCharacterRef.current);
      if (!selectedStillExists) {
        activeFieldRef.current = null;
        const firstCharacter = data.characters[0] ?? null;
        selectedCharacterRef.current = firstCharacter?.id ?? null;
        setSelectedCharacterId(firstCharacter?.id ?? null);
        setFields({});
        if (firstCharacter) void fetchCharacter(code, firstCharacter.id, quiet);
      }
      if (!quiet) setNotice("");
      return data;
    } catch (error) {
      setSaveState("offline");
      if (!quiet) setNotice(error instanceof Error ? error.message : "Não foi possível abrir a campanha.");
      return null;
    }
  }, [fetchCharacter]);

  const fetchPresence = useCallback(async (code: string) => {
    const requestId = ++presenceRequestRef.current;
    try {
      const data = await readJson<{ presence: Presence[] }>(await fetch(
        `/api/campaigns/${code}/presence`,
        { cache: "no-store" },
      ));
      if (requestId !== presenceRequestRef.current) return;
      startTransition(() => setPresence((current) => samePresence(current, data.presence) ? current : data.presence));
    } catch { /* A próxima leitura tenta novamente sem travar a ficha. */ }
  }, []);

  const fetchScene = useCallback(async (code: string, quiet = true) => {
    const requestId = ++sceneRequestRef.current;
    try {
      const data = await readJson<{ scene: Scene }>(await fetch(
        `/api/campaigns/${code}/scene`,
        { cache: "no-store" },
      ));
      if (requestId !== sceneRequestRef.current) return null;
      const nextScene = revealOptimisticRef.current === null
        ? data.scene
        : { ...data.scene, revealPercent: revealOptimisticRef.current };
      startTransition(() => setScene((current) => sameScene(current, nextScene) ? current : nextScene));
      return data.scene;
    } catch (error) {
      if (!quiet) setNotice(error instanceof Error ? error.message : "Não foi possível carregar a cena.");
      return null;
    }
  }, []);

  const fetchRolls = useCallback(async (code: string, quiet = true) => {
    const requestId = ++rollsRequestRef.current;
    try {
      const data = await readJson<{ rolls: DiceRoll[] }>(await fetch(
        `/api/campaigns/${code}/rolls`,
        { cache: "no-store" },
      ));
      if (requestId !== rollsRequestRef.current) return null;
      startTransition(() => setRolls((current) => sameRolls(current, data.rolls) ? current : data.rolls));
      return data.rolls;
    } catch (error) {
      if (!quiet) setNotice(error instanceof Error ? error.message : "Não foi possível carregar as rolagens.");
      return null;
    }
  }, []);

  const openRoom = async (code: string) => {
    setLoading(true);
    const data = await fetchRoom(code);
    setLoading(false);
    if (data) setSidebarOpen(false);
  };

  const leaveRoom = () => {
    roomCodeRef.current = null;
    selectedCharacterRef.current = null;
    dirtyFieldsRef.current = {};
    queuedFieldValuesRef.current = {};
    savingFieldsRef.current.clear();
    revealOptimisticRef.current = null;
    if (revealReleaseTimerRef.current) window.clearTimeout(revealReleaseTimerRef.current);
    roomViewRef.current = "sheet";
    setRoomView("sheet");
    setSelectedCharacterId(null);
    setRoom(null);
    setPresence([]);
    setScene({ hasImage: false, imageUrl: null, imageName: null, revealPercent: 0, updatedAt: null });
    setRolls([]);
    setFields({});
    activeFieldRef.current = null;
    void loadCampaigns();
  };

  const submitCampaign = async (event: React.FormEvent<HTMLFormElement>, kind: "create" | "join") => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setAction(kind);
    setNotice("");
    try {
      const payload = kind === "create"
        ? { action: kind, name: form.get("name"), system: form.get("system") }
        : { action: kind, code: form.get("code") };
      const data = await readJson<{ code: string }>(await fetch("/api/campaigns", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      }));
      formElement.reset();
      await loadCampaigns();
      await openRoom(data.code);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally { setAction(null); }
  };

  const sendPresence = useCallback(async () => {
    if (presenceSendingRef.current) {
      presenceQueuedRef.current = true;
      return;
    }
    presenceSendingRef.current = true;
    do {
      presenceQueuedRef.current = false;
      const code = roomCodeRef.current;
      if (!code) break;
      const scope = roomViewRef.current === "scene"
        ? "scene"
        : roomViewRef.current === "dice"
          ? "dice"
          : roomViewRef.current === "camera"
            ? "camera"
            : roomViewRef.current === "shield" ? "shield" : selectedCharacterRef.current;
      const editingField = scope ? `${scope}:${activeFieldRef.current ?? ""}` : null;
      try {
        await fetch(`/api/campaigns/${code}/presence`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cursorX: cursorRef.current.x,
            cursorY: cursorRef.current.y,
            editingField,
          }),
        });
      } catch { /* The heartbeat retries presence. */ }
    } while (presenceQueuedRef.current && roomCodeRef.current);
    presenceSendingRef.current = false;
  }, []);

  const activeRoomCode = room?.campaign.code;

  useEffect(() => {
    if (!activeRoomCode) return;
    let stopped = false;
    let roomTimer = 0;
    let characterTimer = 0;
    let presenceTimer = 0;
    let sceneTimer = 0;
    let rollsTimer = 0;

    const pollRoom = async () => {
      await fetchRoom(activeRoomCode, true);
      if (!stopped) roomTimer = window.setTimeout(() => void pollRoom(), 2400);
    };
    const pollCharacter = async () => {
      const characterId = selectedCharacterRef.current;
      if (characterId && roomViewRef.current === "sheet") await fetchCharacter(activeRoomCode, characterId, true);
      if (!stopped) characterTimer = window.setTimeout(() => void pollCharacter(), 220);
    };
    const pollPresence = async () => {
      await fetchPresence(activeRoomCode);
      if (!stopped) presenceTimer = window.setTimeout(() => void pollPresence(), 150);
    };
    const pollScene = async () => {
      await fetchScene(activeRoomCode);
      if (!stopped) sceneTimer = window.setTimeout(() => void pollScene(), ["scene", "shield"].includes(roomViewRef.current) ? 180 : 700);
    };
    const pollRolls = async () => {
      if (["dice", "shield"].includes(roomViewRef.current)) await fetchRolls(activeRoomCode);
      if (!stopped) rollsTimer = window.setTimeout(() => void pollRolls(), ["dice", "shield"].includes(roomViewRef.current) ? 320 : 900);
    };

    void sendPresence();
    void pollCharacter();
    void pollPresence();
    void pollScene();
    void pollRolls();
    roomTimer = window.setTimeout(() => void pollRoom(), 2400);
    const heartbeat = window.setInterval(() => void sendPresence(), 3_000);
    const trackCursor = (event: PointerEvent) => {
      cursorRef.current = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
      if (Date.now() - lastPresenceSent.current > 90) {
        lastPresenceSent.current = Date.now();
        void sendPresence();
      }
    };
    window.addEventListener("pointermove", trackCursor, { passive: true });
    return () => {
      stopped = true;
      window.clearTimeout(roomTimer);
      window.clearTimeout(characterTimer);
      window.clearTimeout(presenceTimer);
      window.clearTimeout(sceneTimer);
      window.clearTimeout(rollsTimer);
      window.clearInterval(heartbeat);
      window.removeEventListener("pointermove", trackCursor);
    };
  }, [activeRoomCode, fetchCharacter, fetchPresence, fetchRolls, fetchRoom, fetchScene, sendPresence]);

  const saveField = useCallback((field: string, value: string) => {
    const code = roomCodeRef.current;
    const characterId = selectedCharacterRef.current;
    if (!code || !characterId) return;
    setSaveState("saving");
    const timerKey = `${characterId}:${field}`;
    dirtyFieldsRef.current[timerKey] = value;
    queuedFieldValuesRef.current[timerKey] = value;
    window.clearTimeout(saveTimers.current[timerKey]);
    saveTimers.current[timerKey] = window.setTimeout(async () => {
      if (savingFieldsRef.current.has(timerKey)) return;
      savingFieldsRef.current.add(timerKey);
      while (Object.prototype.hasOwnProperty.call(queuedFieldValuesRef.current, timerKey)) {
        const nextValue = queuedFieldValuesRef.current[timerKey];
        delete queuedFieldValuesRef.current[timerKey];
        try {
          await readJson(await fetch(`/api/campaigns/${code}/characters/${characterId}`, {
            method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ field, value: nextValue }),
          }));
          if (dirtyFieldsRef.current[timerKey] === nextValue) delete dirtyFieldsRef.current[timerKey];
        } catch {
          setSaveState("offline");
          break;
        }
      }
      savingFieldsRef.current.delete(timerKey);
      const selectedPrefix = `${selectedCharacterRef.current}:`;
      if (!Object.keys(dirtyFieldsRef.current).some((key) => key.startsWith(selectedPrefix))) setSaveState("saved");
    }, 55);
  }, []);

  const updateField = (field: string, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    saveField(field, value);
  };

  const focusField = (field: string | null) => {
    activeFieldRef.current = field;
    void sendPresence();
  };

  const switchRoomView = (view: RoomView) => {
    roomViewRef.current = view;
    setRoomView(view);
    activeFieldRef.current = null;
    void sendPresence();
    if (["dice", "shield"].includes(view) && roomCodeRef.current) void fetchRolls(roomCodeRef.current, false);
  };

  const rollDice = async (spec: { diceSides: number; diceCount: number; modifier: number; visibility: RollVisibility }) => {
    if (!room) return;
    setRollBusy(true);
    setNotice("");
    try {
      const data = await readJson<{ roll: DiceRoll }>(await fetch(`/api/campaigns/${room.campaign.code}/rolls`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(spec),
      }));
      rollsRequestRef.current += 1;
      setRolls((current) => [data.roll, ...current.filter((roll) => roll.id !== data.roll.id)].slice(0, 80));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível rolar os dados.");
    } finally { setRollBusy(false); }
  };

  const uploadScene = async (image: File) => {
    if (!room) return;
    setSceneBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("image", image);
      const data = await readJson<{ scene: Scene }>(await fetch(`/api/campaigns/${room.campaign.code}/scene`, {
        method: "POST", body: form,
      }));
      sceneRequestRef.current += 1;
      revealOptimisticRef.current = null;
      setScene(data.scene);
      switchRoomView("scene");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
    } finally { setSceneBusy(false); }
  };

  const updateSceneReveal = useCallback(async (value: number) => {
    const revealPercent = Math.round(Math.max(0, Math.min(100, value)));
    revealOptimisticRef.current = revealPercent;
    setScene((current) => ({ ...current, revealPercent }));
    revealQueuedRef.current = revealPercent;
    if (revealSendingRef.current) return;
    revealSendingRef.current = true;
    while (revealQueuedRef.current !== null) {
      const nextValue = revealQueuedRef.current;
      revealQueuedRef.current = null;
      const code = roomCodeRef.current;
      if (!code) break;
      try {
        await readJson(await fetch(`/api/campaigns/${code}/scene`, {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ revealPercent: nextValue }),
        }));
        if (revealQueuedRef.current === null && revealOptimisticRef.current === nextValue) {
          if (revealReleaseTimerRef.current) window.clearTimeout(revealReleaseTimerRef.current);
          revealReleaseTimerRef.current = window.setTimeout(() => {
            if (revealOptimisticRef.current === nextValue) revealOptimisticRef.current = null;
          }, 450);
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Não foi possível mover a cortina.");
        await fetchScene(code, true);
        revealQueuedRef.current = null;
      }
    }
    revealSendingRef.current = false;
  }, [fetchScene]);

  useEffect(() => {
    if (!scene.imageUrl) {
      scenePreloadRef.current = null;
      return;
    }
    const preload = new Image();
    preload.src = scene.imageUrl;
    scenePreloadRef.current = preload;
  }, [scene.imageUrl]);

  const selectCharacter = async (characterId: string) => {
    if (!room) return;
    if (selectedCharacterRef.current === characterId) {
      switchRoomView("sheet");
      setSidebarOpen(false);
      return;
    }
    roomViewRef.current = "sheet";
    setRoomView("sheet");
    activeFieldRef.current = null;
    selectedCharacterRef.current = characterId;
    setSelectedCharacterId(characterId);
    setFields({});
    setSidebarOpen(false);
    void sendPresence();
    await fetchCharacter(room.campaign.code, characterId);
  };

  const createCharacter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!room || !newCharacterName.trim()) return;
    setCharacterAction(true);
    setNotice("");
    try {
      const data = await readJson<{ character: Character }>(await fetch(
        `/api/campaigns/${room.campaign.code}/characters`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newCharacterName, layout: newCharacterLayout }) },
      ));
      setNewCharacterName("");
      setNewCharacterLayout("BASE");
      roomViewRef.current = "sheet";
      setRoomView("sheet");
      selectedCharacterRef.current = data.character.id;
      setSelectedCharacterId(data.character.id);
      setFields({});
      await fetchRoom(room.campaign.code, true);
      await fetchCharacter(room.campaign.code, data.character.id);
      setSidebarOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível criar a ficha.");
    } finally { setCharacterAction(false); }
  };

  const updateCharacter = async (characterId: string, changes: { name?: string; assignedUserId?: string | null }) => {
    if (!room) return;
    setCharacterAction(true);
    setNotice("");
    try {
      await readJson(await fetch(`/api/campaigns/${room.campaign.code}/characters/${characterId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes),
      }));
      await fetchRoom(room.campaign.code, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a ficha.");
    } finally { setCharacterAction(false); }
  };

  const changeCharacterLayout = (layoutId: NimbleLayoutId) => {
    const previousDefinition = getNimbleLayout(fields.classLayout);
    const nextDefinition = getNimbleLayout(layoutId);
    updateField("classLayout", layoutId);
    if (!fields.proficiencies?.trim() || fields.proficiencies === previousDefinition.proficiencies) {
      updateField("proficiencies", nextDefinition.proficiencies);
    }
    setNotice(`${nextDefinition.name} aplicado somente a esta ficha.`);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const copyCode = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.campaign.code);
    setNotice("Código copiado. Envie para o grupo entrar na campanha.");
    window.setTimeout(() => setNotice(""), 2800);
  };

  const logout = async () => {
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
    } catch { /* Clear the local view even if the network is unavailable. */ }
    roomCodeRef.current = null;
    selectedCharacterRef.current = null;
    dirtyFieldsRef.current = {};
    queuedFieldValuesRef.current = {};
    savingFieldsRef.current.clear();
    roomViewRef.current = "sheet";
    revealOptimisticRef.current = null;
    if (revealReleaseTimerRef.current) window.clearTimeout(revealReleaseTimerRef.current);
    setSelectedCharacterId(null);
    setRoom(null);
    setPresence([]);
    setRoomView("sheet");
    setScene({ hasImage: false, imageUrl: null, imageName: null, revealPercent: 0, updatedAt: null });
    setRolls([]);
    setCampaigns([]);
    setFields({});
    setUser(null);
  };

  if (!user) return null;

  if (!room) {
    return (
      <main className="dashboard-page">
        <AppHeader user={user} onLogout={() => void logout()} />
        <div className="dashboard-shell">
          <section className="dashboard-intro">
            <div><p className="eyebrow">Central de campanhas</p><h1>{greeting()}, {user.displayName.split(" ")[0]}.</h1><p>Reúna o grupo, abra uma ficha e deixe a história acontecer em tempo real.</p></div>
            <div className="live-pill"><span className="live-pulse" /> Sincronização ativa</div>
          </section>
          {notice && <div className="notice" role="status">{notice}</div>}
          <section className="action-grid" aria-label="Criar ou entrar em campanha">
            <form className="action-card action-card-primary" onSubmit={(event) => void submitCampaign(event, "create")}>
              <div className="action-icon" aria-hidden="true">✦</div>
              <div><p className="action-kicker">Assuma a narração</p><h2>Criar campanha</h2><p>Você entra automaticamente como Mestre e recebe um código para convidar jogadores.</p></div>
              <label><span>Nome da campanha</span><input name="name" required maxLength={64} placeholder="Ex.: Ecos de Brumaforte" /></label>
              <label><span>Sistema</span><select name="system" defaultValue="Nimble RPG"><option>Nimble RPG</option><option>Sistema próprio</option></select></label>
              <button className="primary-button" disabled={action !== null}>{action === "create" ? "Criando..." : "Criar minha campanha"} <span aria-hidden="true">→</span></button>
            </form>
            <form className="action-card" onSubmit={(event) => void submitCampaign(event, "join")}>
              <div className="action-icon action-icon-secondary" aria-hidden="true">↗</div>
              <div><p className="action-kicker">Entre na aventura</p><h2>Usar código de convite</h2><p>Ao entrar na campanha de outra pessoa, seu cargo será definido como Player.</p></div>
              <label className="code-label"><span>Código da campanha</span><input name="code" required maxLength={8} autoCapitalize="characters" placeholder="NEXUS7" /></label>
              <button className="secondary-button" disabled={action !== null}>{action === "join" ? "Entrando..." : "Entrar como Player"} <span aria-hidden="true">→</span></button>
            </form>
          </section>
          <section className="campaign-section">
            <div className="section-heading"><div><p className="eyebrow">Suas mesas</p><h2>Campanhas recentes</h2></div><button className="text-button" onClick={() => void loadCampaigns()}>Atualizar ↻</button></div>
            {loading ? <div className="empty-state">Carregando suas campanhas...</div> : campaigns.length === 0 ? (
              <div className="empty-state"><span>◇</span><strong>Nenhuma campanha ainda</strong><p>Crie a primeira mesa ou use um código de convite.</p></div>
            ) : (
              <div className="campaign-list">{campaigns.map((campaign) => (
                <button key={campaign.id} className="campaign-row" onClick={() => void openRoom(campaign.code)}>
                  <span className="campaign-sigil">{initials(campaign.name)}</span>
                  <span className="campaign-main"><strong>{campaign.name}</strong><small>{campaign.system} · Mestre {campaign.masterName}</small></span>
                  <span className={`role-badge role-${campaign.role}`}>{roleLabel(campaign.role)}</span>
                  <span className="campaign-meta">{campaign.memberCount} {campaign.memberCount === 1 ? "membro" : "membros"}<small>{formatRecent(campaign.updatedAt)}</small></span>
                  <span className="row-arrow" aria-hidden="true">→</span>
                </button>
              ))}</div>
            )}
          </section>
        </div>
      </main>
    );
  }

  const selectedCharacter = room.characters.find((character) => character.id === selectedCharacterId) ?? null;
  const activeLayout = getNimbleLayout(fields.classLayout);
  const players = room.members.filter((member) => member.role === "player");
  const characterPrefix = selectedCharacter ? `${selectedCharacter.id}:` : "__sem_ficha__:";
  const others = presence.filter((person) => person.email !== room.viewerEmail);
  const sheetOthers = others.filter((person) => person.editingField?.startsWith(characterPrefix));
  const sceneOthers = others.filter((person) => person.editingField?.startsWith("scene:"));
  const diceOthers = others.filter((person) => person.editingField?.startsWith("dice:"));
  const cameraOthers = others.filter((person) => person.editingField?.startsWith("camera:"));
  const shieldOthers = others.filter((person) => person.editingField?.startsWith("shield:"));
  const cursorOthers = roomView === "scene" ? sceneOthers
    : roomView === "dice" ? diceOthers
      : roomView === "camera" ? cameraOthers
        : roomView === "shield" ? shieldOthers : sheetOthers;
  const editingMap = new Map(sheetOthers
    .filter((person) => (person.editingField?.slice(characterPrefix.length).length ?? 0) > 0)
    .map((person) => [person.editingField!.slice(characterPrefix.length), person]));
  const sheetPresence = presence.filter((person) =>
    person.email === room.viewerEmail || person.editingField?.startsWith(characterPrefix),
  );
  const presenceStatus = (person: Presence) => {
    if (!person.editingField?.includes(":")) return roleLabel(person.role);
    const separator = person.editingField.indexOf(":");
    const characterId = person.editingField.slice(0, separator);
    const field = person.editingField.slice(separator + 1);
    if (characterId === "scene") return "Visualizando a cena";
    if (characterId === "dice") return "Na mesa de dados";
    if (characterId === "camera") return "Nas câmeras";
    if (characterId === "shield") return room.campaign.role === "master" ? "No Escudo do Mestre" : "No Escudo do Player";
    const character = room.characters.find((item) => item.id === characterId);
    return field ? `Editando ${fieldLabels[field] ?? "a ficha"}` : `Visualizando ${character?.name ?? "uma ficha"}`;
  };

  return (
    <CameraProvider campaignCode={room.campaign.code} user={{ id: user.id, displayName: user.displayName }} role={room.campaign.role}>
    <main className="room-page">
      <header className="room-header">
        <button className="room-brand" onClick={leaveRoom}><span className="brand-mark small">N</span><span>RPG NEXUS</span></button>
        <div className="room-heading"><div className="room-title"><strong>{room.campaign.name}</strong><span>{room.campaign.system}</span></div><nav className="room-tabs" aria-label="Áreas da campanha"><button className={roomView === "shield" ? "active" : ""} onClick={() => switchRoomView("shield")}>{room.campaign.role === "master" ? "Escudo do Mestre" : "Escudo do Player"}</button><button className={roomView === "sheet" ? "active" : ""} onClick={() => switchRoomView("sheet")}>Ficha</button><button className={roomView === "scene" ? "active" : ""} onClick={() => switchRoomView("scene")}>Cena</button><button className={roomView === "dice" ? "active" : ""} onClick={() => switchRoomView("dice")}>Dados</button><button className={roomView === "camera" ? "active" : ""} onClick={() => switchRoomView("camera")}>Câmeras</button></nav></div>
        <button className="room-code" onClick={() => void copyCode()} title="Copiar código"><span>Código</span><strong>{room.campaign.code}</strong><i>⧉</i></button>
        <div className={`save-state save-${saveState}`}><i />{saveState === "saved" ? "Sincronizado" : saveState === "saving" ? "Salvando" : "Reconectando"}</div>
        <button className="mobile-panel-button" onClick={() => setSidebarOpen((value) => !value)} aria-label="Abrir fichas e participantes">Fichas · {presence.length} online</button>
      </header>
      {notice && <div className="room-notice" role="status">{notice}</div>}
      <div className="room-layout">
        <aside className={`room-sidebar ${sidebarOpen ? "is-open" : ""}`}>
          <button className="back-button" onClick={leaveRoom}>← Todas as campanhas</button>
          <section className="sidebar-section"><p className="sidebar-label">Nesta mesa</p><div className="viewer-role"><span className="avatar self">{initials(user.displayName)}</span><div><strong>{user.displayName}</strong><small>Você · {roleLabel(room.campaign.role)}</small></div></div></section>
          <section className="sidebar-section character-library">
            <div className="sidebar-title"><p className="sidebar-label">Fichas da campanha</p><span>{room.characters.length}</span></div>
            {room.characters.length === 0 ? (
              <p className="character-list-empty">{room.campaign.role === "master" ? "Crie a primeira ficha da mesa." : "O Mestre ainda não atribuiu uma ficha a você."}</p>
            ) : (
              <div className="character-list">{room.characters.map((character) => (
                <button key={character.id} className={`character-list-item ${selectedCharacterId === character.id ? "active" : ""}`} onClick={() => void selectCharacter(character.id)}>
                  <span className="character-glyph">◇</span>
                  <span><strong>{character.name}</strong><small>{character.assignedDisplayName ? `Player · ${character.assignedDisplayName}` : "Não atribuída"}</small></span>
                  <i aria-hidden="true">→</i>
                </button>
              ))}</div>
            )}
            {room.campaign.role === "master" && (
              <form className="new-character-form" onSubmit={(event) => void createCharacter(event)}>
                <label htmlFor="new-character-name">Nova ficha</label>
                <div><input id="new-character-name" value={newCharacterName} onChange={(event) => setNewCharacterName(event.target.value)} required maxLength={64} placeholder="Nome da ficha" /><button disabled={characterAction || !newCharacterName.trim()} title="Criar ficha">+</button></div>
                <select aria-label="Layout da nova ficha" value={newCharacterLayout} onChange={(event) => setNewCharacterLayout(event.target.value as NimbleLayoutId)} disabled={characterAction}>
                  {NIMBLE_LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
                </select>
              </form>
            )}
          </section>
          <section className="sidebar-section">
            <div className="sidebar-title"><p className="sidebar-label">Ao vivo</p><span>{presence.length} online</span></div>
            <div className="presence-list">{presence.map((person) => (
              <div className="presence-person" key={person.email}>
                <span className="avatar" style={{ borderColor: person.color, color: person.color }}>{initials(person.displayName)}<i style={{ background: person.color }} /></span>
                <div><strong>{person.displayName}</strong><small>{presenceStatus(person)}</small></div>
              </div>
            ))}</div>
          </section>
          <section className="sidebar-section collaboration-tip"><span aria-hidden="true">⌁</span><div><strong>Edição simultânea</strong><p>Cursores coloridos e contornos mostram quem está em cada campo.</p></div></section>
        </aside>
        <section className={roomView === "scene" ? "scene-workspace" : roomView === "dice" ? "dice-workspace" : roomView === "camera" ? "camera-workspace" : roomView === "shield" ? "shield-workspace" : "sheet-workspace"}>
          {roomView === "scene" ? (
            <SceneWorkspace scene={scene} role={room.campaign.role} busy={sceneBusy} peopleHere={presence.filter((person) => person.email === room.viewerEmail || person.editingField?.startsWith("scene:"))} onUpload={(file) => void uploadScene(file)} onReveal={(value) => void updateSceneReveal(value)} />
          ) : roomView === "dice" ? (
            <DiceWorkspace rolls={rolls} role={room.campaign.role} viewerUserId={room.viewerEmail} busy={rollBusy} peopleHere={presence.filter((person) => person.email === room.viewerEmail || person.editingField?.startsWith("dice:"))} onRoll={(spec) => void rollDice(spec)} />
          ) : roomView === "camera" ? (
            <CameraWorkspace />
          ) : roomView === "shield" ? (
            <ShieldWorkspace campaignCode={room.campaign.code} role={room.campaign.role} characters={room.characters} scene={scene} rolls={rolls} rollBusy={rollBusy} onRoll={(spec) => void rollDice(spec)} onReveal={(value) => void updateSceneReveal(value)} onOpenCharacter={(characterId) => void selectCharacter(characterId)} onGoTo={(view) => switchRoomView(view)} />
          ) : !selectedCharacter ? (
            <div className="no-character-selected">
              <span aria-hidden="true">◇</span>
              <p className="eyebrow">Área de fichas</p>
              <h1>{room.campaign.role === "master" ? "Crie a primeira ficha da campanha." : "Aguardando uma ficha."}</h1>
              <p>{room.campaign.role === "master" ? "Depois, escolha um Player da mesa para receber e editar a ficha com você." : "Quando o Mestre atribuir uma ficha ao seu usuário, ela aparecerá aqui automaticamente."}</p>
              {room.campaign.role === "master" && <button className="primary-button" onClick={() => setSidebarOpen(true)}>Abrir criação de fichas <b>→</b></button>}
            </div>
          ) : <>
            <div className="sheet-toolbar">
              <div><p className="eyebrow">{selectedCharacter.assignedDisplayName ? `Ficha de ${selectedCharacter.assignedDisplayName}` : "Ficha não atribuída"}</p><h1>{fields.characterName || selectedCharacter.name}</h1></div>
              <div className="sheet-toolbar-side"><CharacterCamera userId={selectedCharacter.assignedUserId} name={selectedCharacter.assignedDisplayName ?? selectedCharacter.name} /><div className="live-collaborators">{sheetPresence.slice(0, 4).map((person) => <span key={person.email} className="mini-avatar" style={{ borderColor: person.color }} title={person.displayName}>{initials(person.displayName)}</span>)}<small>{sheetPresence.length > 1 ? `${sheetPresence.length} pessoas nesta ficha` : "Só você nesta ficha"}</small></div></div>
            </div>
            {room.campaign.role === "master" && <CharacterAdminBar key={selectedCharacter.id} character={selectedCharacter} players={players} busy={characterAction} layout={activeLayout.id} onLayoutChange={changeCharacterLayout} onUpdate={(changes) => void updateCharacter(selectedCharacter.id, changes)} />}
            <div className={`character-sheet nimble-layout-${activeLayout.id.toLowerCase().replace("_", "-")}`} onPointerDown={() => setSidebarOpen(false)}>
            {activeLayout.id === "SHADOWMANCER" ? (
              <ShadowmancerSheet fallbackName={selectedCharacter.name} layout={activeLayout} fields={fields} onChange={updateField} onFocus={focusField} editingMap={editingMap} />
            ) : (
              <NimbleClassPanel layout={activeLayout} fields={fields} onChange={updateField} onFocus={focusField} editingMap={editingMap} fallbackName={selectedCharacter.name} />
            )}
            </div>
          </>}
        </section>
      </div>
      {cursorOthers.filter((person) => person.cursorX !== null && person.cursorY !== null).map((person) => (
        <div key={person.email} className="remote-cursor" style={{ "--cursor-x": `${(person.cursorX ?? 0) * 100}vw`, "--cursor-y": `${(person.cursorY ?? 0) * 100}vh`, color: person.color } as React.CSSProperties}><span>◆</span><b style={{ background: person.color }}>{person.displayName}</b></div>
      ))}
    </main>
    </CameraProvider>
  );
}

function DiceWorkspace({ rolls, role, viewerUserId, busy, peopleHere, onRoll }: {
  rolls: DiceRoll[];
  role: Role;
  viewerUserId: string;
  busy: boolean;
  peopleHere: Presence[];
  onRoll: (spec: { diceSides: number; diceCount: number; modifier: number; visibility: RollVisibility }) => void;
}) {
  const [channel, setChannel] = useState<RollVisibility>("public");
  const [diceSides, setDiceSides] = useState(20);
  const [diceCount, setDiceCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const diceOptions = [4, 6, 8, 10, 12, 20, 100];
  const visibleRolls = rolls.filter((roll) => roll.visibility === channel);
  const notation = `${diceCount}d${diceSides}${modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`}`;

  return (
    <div className="dice-shell">
      <div className="dice-toolbar">
        <div><p className="eyebrow">Resultados sincronizados</p><h1>Mesa de dados</h1><p>Escolha o dado, o canal e role. O resultado é calculado e registrado pelo servidor.</p></div>
        <div className="live-collaborators">{peopleHere.slice(0, 4).map((person) => <span key={person.email} className="mini-avatar" style={{ borderColor: person.color }} title={person.displayName}>{initials(person.displayName)}</span>)}<small>{peopleHere.length > 1 ? `${peopleHere.length} pessoas nos dados` : "Só você nos dados"}</small></div>
      </div>

      <div className="dice-channel-tabs" role="tablist" aria-label="Canal de rolagem">
        <button role="tab" aria-selected={channel === "public"} className={channel === "public" ? "active" : ""} onClick={() => setChannel("public")}><span>◎</span><div><strong>Mesa pública</strong><small>Todos veem os resultados</small></div></button>
        <button role="tab" aria-selected={channel === "master_private"} className={channel === "master_private" ? "active private" : ""} onClick={() => setChannel("master_private")}><span>◆</span><div><strong>Segredo com o Mestre</strong><small>{role === "master" ? "Você vê todos os segredos" : "Somente você e o Mestre"}</small></div></button>
      </div>

      <div className="dice-layout">
        <section className={`dice-roller ${channel === "master_private" ? "private-mode" : ""}`}>
          <div className="roller-heading"><div className="dice-emblem"><span>d{diceSides}</span></div><div><p>{channel === "public" ? "Rolagem pública" : "Canal protegido"}</p><h2>{notation}</h2></div></div>
          {channel === "master_private" && <div className="private-explainer"><span>◆</span><p>{role === "master" ? "Esta rolagem e as rolagens secretas dos Players ficam somente no seu painel de Mestre." : "Esta rolagem não aparecerá para os outros Players. Apenas você e o Mestre poderão vê-la."}</p></div>}

          <div className="dice-picker"><label>Tipo de dado</label><div>{diceOptions.map((sides) => <button key={sides} className={diceSides === sides ? "active" : ""} onClick={() => setDiceSides(sides)}><span>d</span>{sides}</button>)}</div></div>
          <div className="dice-number-controls">
            <label><span>Quantidade</span><div><button onClick={() => setDiceCount((value) => Math.max(1, value - 1))} disabled={diceCount <= 1}>−</button><input type="number" min="1" max="20" value={diceCount} onChange={(event) => setDiceCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /><button onClick={() => setDiceCount((value) => Math.min(20, value + 1))} disabled={diceCount >= 20}>+</button></div></label>
            <label><span>Modificador</span><div><button onClick={() => setModifier((value) => Math.max(-100, value - 1))}>−</button><input type="number" min="-100" max="100" value={modifier} onChange={(event) => setModifier(Math.max(-100, Math.min(100, Number(event.target.value) || 0)))} /><button onClick={() => setModifier((value) => Math.min(100, value + 1))}>+</button></div></label>
          </div>
          <button className={`roll-button ${channel === "master_private" ? "secret" : ""}`} disabled={busy} onClick={() => onRoll({ diceSides, diceCount, modifier, visibility: channel })}><span>{busy ? "Rolando..." : channel === "public" ? "Rolar para a mesa" : "Rolar em segredo"}</span><b>{busy ? "◌" : "✦"}</b></button>
          <p className="fair-roll-note"><i /> Resultado gerado no servidor e salvo no histórico.</p>
        </section>

        <section className="roll-history">
          <div className="roll-history-heading"><div><p className="eyebrow">{channel === "public" ? "Canal público" : "Canal privado"}</p><h2>Histórico de rolagens</h2></div><span>{visibleRolls.length} resultados</span></div>
          {visibleRolls.length === 0 ? (
            <div className="roll-empty"><span>{channel === "public" ? "◎" : "◆"}</span><strong>Nenhuma rolagem neste canal.</strong><p>Configure os dados ao lado e faça a primeira jogada.</p></div>
          ) : (
            <div className="roll-list">{visibleRolls.map((roll, index) => (
              <article key={roll.id} className={`roll-card ${roll.visibility === "master_private" ? "private" : ""} ${index === 0 ? "latest" : ""}`}>
                <div className="roll-person"><span className="avatar">{initials(roll.rollerName)}</span><div><strong>{roll.rollerName}{roll.rollerUserId === viewerUserId ? " · você" : ""}</strong><small>{new Date(roll.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></div></div>
                <div className="roll-notation"><strong>{roll.diceCount}d{roll.diceSides}</strong>{roll.modifier !== 0 && <small>{roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}</small>}</div>
                <div className="rolled-values">{roll.results.map((value, resultIndex) => <span key={`${roll.id}-${resultIndex}`}>{value}</span>)}{roll.modifier !== 0 && <i>{roll.modifier > 0 ? `+ ${roll.modifier}` : `− ${Math.abs(roll.modifier)}`}</i>}</div>
                <div className="roll-total"><small>Total</small><strong>{roll.total}</strong></div>
                {roll.visibility === "master_private" && <div className="secret-roll-badge">◆ Mestre &amp; {roll.rollerName}</div>}
              </article>
            ))}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function SceneWorkspace({ scene, role, busy, peopleHere, onUpload, onReveal }: {
  scene: Scene;
  role: Role;
  busy: boolean;
  peopleHere: Presence[];
  onUpload: (file: File) => void;
  onReveal: (value: number) => void;
}) {
  const curtainStyle = {
    "--curtain-width": `${(100 - scene.revealPercent) / 2}%`,
  } as React.CSSProperties;

  return (
    <div className="scene-shell">
      <div className="scene-toolbar">
        <div><p className="eyebrow">Projeção compartilhada</p><h1>Cena audiovisual</h1><p>A imagem fica carregada por trás da cortina e aparece para todos conforme o Mestre abre.</p></div>
        <div className="live-collaborators">{peopleHere.slice(0, 4).map((person) => <span key={person.email} className="mini-avatar" style={{ borderColor: person.color }} title={person.displayName}>{initials(person.displayName)}</span>)}<small>{peopleHere.length > 1 ? `${peopleHere.length} pessoas na cena` : "Só você na cena"}</small></div>
      </div>

      {role === "master" && (
        <section className="scene-controls">
          <div className="scene-control-title"><span>◈</span><div><strong>Painel do Mestre</strong><small>Prepare a imagem antes de revelar</small></div></div>
          <label className={`scene-upload ${busy ? "busy" : ""}`}><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /><span>{busy ? "Enviando imagem..." : scene.hasImage ? "Trocar imagem" : "Enviar imagem"}</span></label>
          <label className="curtain-range"><span>Abertura da cortina <b>{scene.revealPercent}%</b></span><input type="range" min="0" max="100" value={scene.revealPercent} disabled={!scene.hasImage || busy} onChange={(event) => onReveal(Number(event.target.value))} /></label>
          <div className="curtain-actions"><button disabled={!scene.hasImage || busy || scene.revealPercent === 0} onClick={() => onReveal(0)}>Fechar</button><button className="reveal-button" disabled={!scene.hasImage || busy || scene.revealPercent === 100} onClick={() => onReveal(100)}>Revelar tudo</button></div>
        </section>
      )}

      {!scene.hasImage || !scene.imageUrl ? (
        <div className="scene-empty"><span>◈</span><strong>{role === "master" ? "Envie a primeira imagem da cena." : "O Mestre ainda está preparando a cena."}</strong><p>{role === "master" ? "JPG, PNG, WEBP ou GIF com até 15 MB." : "Quando uma imagem for enviada, ela será carregada aqui ainda coberta pela cortina."}</p></div>
      ) : (
        <div className="scene-stage" style={curtainStyle}>
          {/* The authenticated R2 route must be fetched by the browser with the user's session cookie. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene.imageUrl} alt={`Cena compartilhada: ${scene.imageName ?? "imagem da campanha"}`} />
          <div className="curtain-panel curtain-left"><i /></div>
          <div className="curtain-panel curtain-right"><i /></div>
          {scene.revealPercent < 100 && <div className="curtain-seal"><span>✦</span><strong>{scene.revealPercent === 0 ? "Cena pronta" : `${scene.revealPercent}% revelada`}</strong><small>{role === "master" ? "Mova o controle para abrir" : "Aguardando o Mestre"}</small></div>}
          <div className="scene-caption"><span>{scene.imageName}</span><b>{scene.revealPercent === 100 ? "Cena revelada" : "Cortina em movimento"}</b></div>
        </div>
      )}
    </div>
  );
}

function CharacterAdminBar({ character, players, busy, layout, onLayoutChange, onUpdate }: {
  character: Character;
  players: Member[];
  busy: boolean;
  layout: NimbleLayoutId;
  onLayoutChange: (layout: NimbleLayoutId) => void;
  onUpdate: (changes: { name?: string; assignedUserId?: string | null }) => void;
}) {
  const [name, setName] = useState(character.name);
  const saveName = () => {
    const nextName = name.trim();
    if (!nextName) {
      setName(character.name);
      return;
    }
    if (nextName !== character.name) onUpdate({ name: nextName });
  };

  return (
    <section className="character-admin-bar" aria-label="Organizar ficha">
      <div className="admin-title"><span>✦</span><div><strong>Controles do Mestre</strong><small>Organize e atribua esta ficha</small></div></div>
      <label><span>Nome da ficha</span><input value={name} onChange={(event) => setName(event.target.value)} onBlur={saveName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} maxLength={64} disabled={busy} /></label>
      <label className="admin-layout-select"><span>Layout Nimble · por personagem</span><select value={layout} onChange={(event) => onLayoutChange(event.target.value as NimbleLayoutId)} disabled={busy}>{NIMBLE_LAYOUTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Atribuir ao Player</span><select value={character.assignedUserId ?? ""} onChange={(event) => onUpdate({ assignedUserId: event.target.value || null })} disabled={busy}><option value="">Não atribuída</option>{players.map((player) => <option key={player.email} value={player.email}>{player.displayName}</option>)}</select></label>
      <div className="admin-status"><i />{busy ? "Salvando..." : character.assignedDisplayName ? `Compartilhada com ${character.assignedDisplayName}` : "Visível apenas para o Mestre"}</div>
    </section>
  );
}

function NimbleClassPanel({ layout, fields, onChange, onFocus, editingMap, fallbackName }: {
  layout: NimbleLayoutDefinition;
  fields: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onFocus: (field: string | null) => void;
  editingMap: Map<string, Presence>;
  fallbackName: string;
}) {
  const selectedFeatures = parseClassFeatures(fields.classFeatures);
  const portraitName = fields.characterName || fallbackName;
  const style = {
    "--class-accent": layout.accent,
    "--class-accent-soft": layout.accentSoft,
    "--class-accent-ink": layout.accentInk,
  } as React.CSSProperties;
  const toggleFeature = (feature: string) => {
    const next = selectedFeatures.includes(feature)
      ? selectedFeatures.filter((item) => item !== feature)
      : [...selectedFeatures, feature];
    onChange("classFeatures", JSON.stringify(next));
  };

  // Ícone temático para cada classe
  const getResourceIcon = (layoutId: string, resourceIndex: number) => {
    const icons: Record<string, string[]> = {
      BASE: ["◆", "◇"],
      BERSERKER: ["⚔", "◆"],
      COMMANDER: ["⚑", "★"],
      HEXBINDER: ["◈", "◆"],
      HUNTER: ["⦾", "◆"],
      MAGE: ["◆", "★"],
      OATHSWORN: ["✦", "♦"],
      SHEPHERD: ["✦", "◆"],
      SONGWEAVER: ["♪", "◆"],
      STORMSHIFTER: ["◆", "◆"],
      THE_CHEAT: ["◆", "◆"],
      ZEPHYR: ["◈", "◆"],
    };
    return icons[layoutId]?.[resourceIndex] ?? "◆";
  };

  return (
    <div className="nimble-sheet" style={style} aria-label={`Ficha ${layout.name}`}>
      <aside className="nimble-rail">
        <div className="nimble-portrait-frame">
          <div className={`nimble-portrait ${fields.portraitUrl ? "has-image" : ""}`}>
            {fields.portraitUrl ? <>
              {/* External portraits are intentionally loaded directly from the URL saved by the player. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fields.portraitUrl} alt={`Retrato de ${portraitName}`} />
            </> : <span>{initials(portraitName)}</span>}
          </div>
        </div>
        <div className="nimble-identity-fields">
          <SheetField id="characterName" label="Nome do personagem" value={fields.characterName} onChange={onChange} onFocus={onFocus} editor={editingMap.get("characterName")} />
          <SheetField id="ancestryClassLevel" label="Ancestralidade" value={fields.ancestryClassLevel} onChange={onChange} onFocus={onFocus} editor={editingMap.get("ancestryClassLevel")} />
          <SheetField id="portraitUrl" label="URL do retrato" value={fields.portraitUrl} onChange={onChange} onFocus={onFocus} editor={editingMap.get("portraitUrl")} />
        </div>
        <div className="nimble-stars" aria-label="Atributos principais"><span>☆</span><span>★</span><span>★</span><span>☆</span></div>
        <div className="nimble-attributes">{stats.map(([id, label]) => <SheetField key={id} id={id} label={label} value={fields[id]} onChange={onChange} onFocus={onFocus} editor={editingMap.get(id)} compact />)}</div>
        <div className="nimble-skill-list">{skills.map(([id, label, ability]) => <SheetField key={id} id={id} label={label} hint={ability} value={fields[id]} onChange={onChange} onFocus={onFocus} editor={editingMap.get(id)} compact />)}</div>
        <div className="nimble-inventory"><SheetField id="notes" label="Inventário · 10 + STR espaços" value={fields.notes} onChange={onChange} onFocus={onFocus} editor={editingMap.get("notes")} multiline /></div>
      </aside>

      <section className="nimble-main">
        <header className="nimble-class-header">
          <strong>{layout.name.toUpperCase()}</strong>
          <SheetField id="level" label="Level" value={fields.level} onChange={onChange} onFocus={onFocus} editor={editingMap.get("level")} compact />
        </header>
        <div className="nimble-subheader">
          <SheetField id="subclass" label="Subclass" value={fields.subclass} onChange={onChange} onFocus={onFocus} editor={editingMap.get("subclass")} />
          <SheetField id="proficiencies" label="Proficiencies" value={fields.proficiencies} onChange={onChange} onFocus={onFocus} editor={editingMap.get("proficiencies")} />
        </div>

        <div className="nimble-combat-strip">
          <SheetField id="size" label="Size" value={fields.size} onChange={onChange} onFocus={onFocus} editor={editingMap.get("size")} compact />
          <SheetField id="speed" label="Speed" value={fields.speed} onChange={onChange} onFocus={onFocus} editor={editingMap.get("speed")} compact />
          <SheetField id="initiative" label="Initiative" value={fields.initiative} onChange={onChange} onFocus={onFocus} editor={editingMap.get("initiative")} compact />
          <SheetField id="armor" label="Armor" value={fields.armor} onChange={onChange} onFocus={onFocus} editor={editingMap.get("armor")} compact />
          <SheetField id="hitDice" label="Hit Dice" value={fields.hitDice} onChange={onChange} onFocus={onFocus} editor={editingMap.get("hitDice")} compact />
          <div className="nimble-hp-card"><label>Hit Points</label><div><SheetField id="hpCurrent" label="Atual" value={fields.hpCurrent} onChange={onChange} onFocus={onFocus} editor={editingMap.get("hpCurrent")} compact /><b>/</b><SheetField id="hpMax" label="Máx" value={fields.hpMax} onChange={onChange} onFocus={onFocus} editor={editingMap.get("hpMax")} compact /></div><SheetField id="tempHp" label="Temp" value={fields.tempHp} onChange={onChange} onFocus={onFocus} editor={editingMap.get("tempHp")} compact /></div>
          <div className="nimble-wounds"><span aria-hidden="true">☠</span><label>Wounds</label><div>{[1,2,3,4,5].map((number) => <Wound key={number} id={`wound${number}`} checked={fields[`wound${number}`] === "true"} onChange={onChange} editor={editingMap.get(`wound${number}`)} onFocus={onFocus} />)}</div></div>
        </div>

        <div className="nimble-powers-row">
          {layout.features.length > 0 ? (
            <section className="nimble-features" onFocus={() => onFocus("classFeatures")} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onFocus(null); }}>
              <div className="nimble-section-title"><strong>{layout.featureTitle}</strong><small>Habilidades escolhidas</small></div>
              <div>{layout.features.map((feature) => {
                const checked = selectedFeatures.includes(feature);
                return <button type="button" key={feature} className={checked ? "checked" : ""} aria-pressed={checked} onClick={() => toggleFeature(feature)}><i>{checked ? "●" : ""}</i><span>{feature}</span></button>;
              })}</div>
              {editingMap.get("classFeatures") && <i className="editing-tag" style={{ background: editingMap.get("classFeatures")?.color }}>{editingMap.get("classFeatures")?.displayName}</i>}
            </section>
          ) : (
            <section className="nimble-features nimble-features-empty">
              <div className="nimble-section-title"><strong>Características da classe</strong><small>Layout base</small></div>
              <p className="base-layout-note">Use a ficha base para classes próprias. O Mestre pode trocar este layout individualmente a qualquer momento.</p>
            </section>
          )}
          <div className="nimble-resources">
            {layout.resource1 && (
              <>
                <div className="nimble-resource-card"><span className="nimble-drop" aria-hidden="true">{getResourceIcon(layout.id, 0)}</span><SheetField id="classResource1Current" label={layout.resource1} value={fields.classResource1Current} onChange={onChange} onFocus={onFocus} editor={editingMap.get("classResource1Current")} compact /><small>Máx. {fields.classResource1Max || "—"}</small></div>
                <div className="nimble-resource-max"><SheetField id="classResource1Max" label="Máximo" value={fields.classResource1Max} onChange={onChange} onFocus={onFocus} editor={editingMap.get("classResource1Max")} compact /></div>
              </>
            )}
            {layout.resource2 && (
              <>
                <div className="nimble-resource-card"><span className="nimble-drop" aria-hidden="true">{getResourceIcon(layout.id, 1)}</span><SheetField id="classResource2Current" label={layout.resource2} value={fields.classResource2Current} onChange={onChange} onFocus={onFocus} editor={editingMap.get("classResource2Current")} compact /><small>Máx. {fields.classResource2Max || "—"}</small></div>
                <div className="nimble-resource-max"><SheetField id="classResource2Max" label="Máximo" value={fields.classResource2Max} onChange={onChange} onFocus={onFocus} editor={editingMap.get("classResource2Max")} compact /></div>
              </>
            )}
            {layout.usesSpellTier && (
              <div className="nimble-spell-tier"><span>Spell Tier</span><SheetField id="spellTier" label="Tier" value={fields.spellTier} onChange={onChange} onFocus={onFocus} editor={editingMap.get("spellTier")} compact /></div>
            )}
          </div>
        </div>

        <div className="nimble-writing-grid">
          <SheetField id="features" label="Reactions & Utility" value={fields.features} onChange={onChange} onFocus={onFocus} editor={editingMap.get("features")} multiline />
          <SheetField id="spells" label="Actions & Attacks" value={fields.spells} onChange={onChange} onFocus={onFocus} editor={editingMap.get("spells")} multiline />
        </div>
        <footer className="nimble-sheet-footer"><span>RPG NEXUS</span><p>Layout {layout.name} · sincronizado em tempo real</p><span>NIMBLE</span></footer>
      </section>
    </div>
  );
}

function ShadowmancerSheet({ fallbackName, layout, fields, onChange, onFocus, editingMap }: {
  fallbackName: string;
  layout: NimbleLayoutDefinition;
  fields: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onFocus: (field: string | null) => void;
  editingMap: Map<string, Presence>;
}) {
  const selectedFeatures = parseClassFeatures(fields.classFeatures);
  const portraitName = fields.characterName || fallbackName;
  const toggleFeature = (feature: string) => {
    const next = selectedFeatures.includes(feature)
      ? selectedFeatures.filter((item) => item !== feature)
      : [...selectedFeatures, feature];
    onChange("classFeatures", JSON.stringify(next));
  };

  return (
    <div className="shadowmancer-sheet" aria-label="Ficha Shadowmancer">
      <aside className="shadow-rail">
        <div className="shadow-portrait-frame">
          <div className={`shadow-portrait ${fields.portraitUrl ? "has-image" : ""}`}>
            {fields.portraitUrl ? <>
              {/* External portraits are intentionally loaded directly from the URL saved by the player. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fields.portraitUrl} alt={`Retrato de ${portraitName}`} />
            </> : <span>{initials(portraitName)}</span>}
          </div>
        </div>
        <div className="shadow-identity-fields">
          <SheetField id="characterName" label="Nome do personagem" value={fields.characterName} onChange={onChange} onFocus={onFocus} editor={editingMap.get("characterName")} />
          <SheetField id="ancestryClassLevel" label="Ancestralidade" value={fields.ancestryClassLevel} onChange={onChange} onFocus={onFocus} editor={editingMap.get("ancestryClassLevel")} />
          <SheetField id="portraitUrl" label="URL do retrato" value={fields.portraitUrl} onChange={onChange} onFocus={onFocus} editor={editingMap.get("portraitUrl")} />
        </div>
        <div className="shadow-stars" aria-label="Atributos principais"><span>☆</span><span>★</span><span>★</span><span>☆</span></div>
        <div className="shadow-attributes">{stats.map(([id, label]) => <SheetField key={id} id={id} label={label} value={fields[id]} onChange={onChange} onFocus={onFocus} editor={editingMap.get(id)} compact />)}</div>
        <div className="shadow-skill-list">{skills.map(([id, label, ability]) => <SheetField key={id} id={id} label={label} hint={ability} value={fields[id]} onChange={onChange} onFocus={onFocus} editor={editingMap.get(id)} compact />)}</div>
        <div className="shadow-inventory"><SheetField id="notes" label="Inventário · 10 + STR espaços" value={fields.notes} onChange={onChange} onFocus={onFocus} editor={editingMap.get("notes")} multiline /></div>
      </aside>

      <section className="shadow-main">
        <header className="shadow-class-header">
          <strong>SHADOWMANCER</strong>
          <SheetField id="level" label="Level" value={fields.level} onChange={onChange} onFocus={onFocus} editor={editingMap.get("level")} compact />
        </header>
        <div className="shadow-subheader">
          <SheetField id="subclass" label="Subclass" value={fields.subclass} onChange={onChange} onFocus={onFocus} editor={editingMap.get("subclass")} />
          <SheetField id="proficiencies" label="Proficiencies" value={fields.proficiencies} onChange={onChange} onFocus={onFocus} editor={editingMap.get("proficiencies")} />
        </div>

        <div className="shadow-combat-strip">
          <SheetField id="size" label="Size" value={fields.size} onChange={onChange} onFocus={onFocus} editor={editingMap.get("size")} compact />
          <SheetField id="speed" label="Speed" value={fields.speed} onChange={onChange} onFocus={onFocus} editor={editingMap.get("speed")} compact />
          <SheetField id="initiative" label="Initiative" value={fields.initiative} onChange={onChange} onFocus={onFocus} editor={editingMap.get("initiative")} compact />
          <SheetField id="armor" label="Armor" value={fields.armor} onChange={onChange} onFocus={onFocus} editor={editingMap.get("armor")} compact />
          <SheetField id="hitDice" label="Hit Dice" value={fields.hitDice} onChange={onChange} onFocus={onFocus} editor={editingMap.get("hitDice")} compact />
          <div className="shadow-hp-card"><label>Hit Points</label><div><SheetField id="hpCurrent" label="Atual" value={fields.hpCurrent} onChange={onChange} onFocus={onFocus} editor={editingMap.get("hpCurrent")} compact /><b>/</b><SheetField id="hpMax" label="Máx" value={fields.hpMax} onChange={onChange} onFocus={onFocus} editor={editingMap.get("hpMax")} compact /></div><SheetField id="tempHp" label="Temp" value={fields.tempHp} onChange={onChange} onFocus={onFocus} editor={editingMap.get("tempHp")} compact /></div>
          <div className="shadow-wounds"><span aria-hidden="true">☠</span><label>Wounds</label><div>{[1,2,3,4,5].map((number) => <Wound key={number} id={`wound${number}`} checked={fields[`wound${number}`] === "true"} onChange={onChange} editor={editingMap.get(`wound${number}`)} onFocus={onFocus} />)}</div></div>
        </div>

        <div className="shadow-powers-row">
          <section className="shadow-invocations" onFocus={() => onFocus("classFeatures")} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onFocus(null); }}>
            <div className="shadow-section-title"><strong>{layout.featureTitle}</strong><small>Invocações escolhidas</small></div>
            <div>{layout.features.map((feature) => {
              const checked = selectedFeatures.includes(feature);
              return <button type="button" key={feature} className={checked ? "checked" : ""} aria-pressed={checked} onClick={() => toggleFeature(feature)}><i>{checked ? "●" : ""}</i><span>{feature}</span></button>;
            })}</div>
            {editingMap.get("classFeatures") && <i className="editing-tag" style={{ background: editingMap.get("classFeatures")?.color }}>{editingMap.get("classFeatures")?.displayName}</i>}
          </section>
          <div className="shadow-resources">
            <div className="shadow-resource-card"><span className="shadow-drop" aria-hidden="true">◆</span><SheetField id="classResource1Current" label="Pilfered Power" value={fields.classResource1Current} onChange={onChange} onFocus={onFocus} editor={editingMap.get("classResource1Current")} compact /><small>Máx. {fields.classResource1Max || "DEX"}</small></div>
            <div className="shadow-resource-max"><SheetField id="classResource1Max" label="Máximo" value={fields.classResource1Max} onChange={onChange} onFocus={onFocus} editor={editingMap.get("classResource1Max")} compact /></div>
            <div className="shadow-spell-tier"><span>Spell Tier</span><SheetField id="spellTier" label="Tier" value={fields.spellTier} onChange={onChange} onFocus={onFocus} editor={editingMap.get("spellTier")} compact /></div>
          </div>
        </div>

        <div className="shadow-writing-grid">
          <SheetField id="features" label="Reactions & Utility" value={fields.features} onChange={onChange} onFocus={onFocus} editor={editingMap.get("features")} multiline />
          <SheetField id="spells" label="Actions & Attacks" value={fields.spells} onChange={onChange} onFocus={onFocus} editor={editingMap.get("spells")} multiline />
        </div>
        <footer className="shadow-sheet-footer"><span>RPG NEXUS</span><p>Layout Shadowmancer · sincronizado em tempo real</p><span>NIMBLE</span></footer>
      </section>
    </div>
  );
}

function AppHeader({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <header className="app-header"><div className="brand-lockup"><span className="brand-mark small">N</span><span>RPG NEXUS</span></div><div className="header-user"><span className="avatar self">{initials(user.displayName)}</span><div><strong>{user.displayName}</strong><small>@{user.username}</small></div><button onClick={onLogout} title="Sair" aria-label="Sair da conta">↗</button></div></header>;
}

function SheetField({ id, label, hint, value = "", onChange, onFocus, editor, compact = false, multiline = false }: {
  id: string; label: string; hint?: string; value?: string;
  onChange: (field: string, value: string) => void; onFocus: (field: string | null) => void;
  editor?: Presence; compact?: boolean; multiline?: boolean;
}) {
  const style = editor ? ({ "--editor-color": editor.color } as React.CSSProperties) : undefined;
  return (
    <label className={`sheet-field ${compact ? "compact" : ""} ${multiline ? "multiline" : ""} ${editor ? "is-remote-editing" : ""}`} style={style}>
      <span>{label}{hint && <small>{hint}</small>}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(id, event.target.value)} onFocus={() => onFocus(id)} onBlur={() => onFocus(null)} placeholder="Clique para escrever..." /> : <input value={value} onChange={(event) => onChange(id, event.target.value)} onFocus={() => onFocus(id)} onBlur={() => onFocus(null)} />}
      {editor && <i className="editing-tag" style={{ background: editor.color }}>{editor.displayName}</i>}
    </label>
  );
}

function Wound({ id, checked, onChange, onFocus, editor }: {
  id: string; checked: boolean; onChange: (field: string, value: string) => void;
  onFocus: (field: string | null) => void; editor?: Presence;
}) {
  return <button type="button" className={`wound ${checked ? "checked" : ""} ${editor ? "is-remote-editing" : ""}`} style={editor ? ({ "--editor-color": editor.color } as React.CSSProperties) : undefined} onFocus={() => onFocus(id)} onBlur={() => onFocus(null)} onClick={() => onChange(id, checked ? "false" : "true")} aria-label={`${fieldLabels[id]}: ${checked ? "marcado" : "desmarcado"}`} aria-pressed={checked}>{checked ? "×" : ""}</button>;
}
