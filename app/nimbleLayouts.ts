export const NIMBLE_LAYOUT_IDS = [
  "BASE",
  "BERSERKER",
  "COMMANDER",
  "HEXBINDER",
  "HUNTER",
  "MAGE",
  "OATHSWORN",
  "SHADOWMANCER",
  "SHEPHERD",
  "SONGWEAVER",
  "STORMSHIFTER",
  "THE_CHEAT",
  "ZEPHYR",
] as const;

export type NimbleLayoutId = (typeof NIMBLE_LAYOUT_IDS)[number];

export type NimbleLayoutDefinition = {
  id: NimbleLayoutId;
  name: string;
  subtitle: string;
  proficiencies: string;
  featureTitle: string;
  features: string[];
  resource1?: string;
  resource2?: string;
  usesSpellTier?: boolean;
  accent: string;
  accentSoft: string;
  accentInk: string;
};

export const NIMBLE_LAYOUTS: NimbleLayoutDefinition[] = [
  {
    id: "BASE",
    name: "Ficha Base",
    subtitle: "Modelo livre para classes personalizadas",
    proficiencies: "",
    featureTitle: "Características da classe",
    features: [],
    accent: "#2f7f70",
    accentSoft: "#e1f1ec",
    accentInk: "#184c43",
  },
  {
    id: "BERSERKER",
    name: "Berserker",
    subtitle: "Fúria, resistência e pressão corpo a corpo",
    proficiencies: "STR Weapons",
    featureTitle: "Savage Arsenal",
    resource1: "Fury Dice",
    accent: "#a3444f",
    accentSoft: "#f6e3e5",
    accentInk: "#702d36",
    features: ["Death Blow", "Deathless Rage", "Eager for Battle", "Into the Fray", "MORE BLOOD!", "Mighty Endurance", "Rampage", "Swift Fury", "Thunderous Steps", "Unstoppable Force", "Whirlwind", "You’re Next!"],
  },
  {
    id: "COMMANDER",
    name: "Commander",
    subtitle: "Tática, liderança e domínio do campo de batalha",
    proficiencies: "Mail Armor, Shields, All Martial Weapons",
    featureTitle: "Combat Abilities",
    resource1: "Combat Dice",
    resource2: "Weapon Mastery",
    accent: "#a26825",
    accentSoft: "#f7ead4",
    accentInk: "#704716",
    features: ["Coordinated Strike!", "Face Me!", "Hold the Line!", "I Can Do This ALL DAY!", "Move it! Move it!", "Reposition!", "Commanding Presence", "Heavy Strike", "Inerrant Strike", "Lunging Strike", "Sweeping Strike"],
  },
  {
    id: "HEXBINDER",
    name: "Hexbinder",
    subtitle: "Aflições, marcas místicas e magia de pacto",
    proficiencies: "Cloth Armor, Blades, Wands",
    featureTitle: "Afflictions & Mystic Marks",
    resource1: "Mana",
    usesSpellTier: true,
    accent: "#7550a1",
    accentSoft: "#eee6f7",
    accentInk: "#4e326e",
    features: ["Brittle", "Dimmed", "Doomed", "Enfeebled", "Frenzied", "Pestilent", "Sundered", "Withered", "Bramble Mark", "Broom Flight", "Coven", "Mark of Protection", "Pact of Enmity", "Sigil of Journey", "Sigil of Root", "Word of Decay"],
  },
  {
    id: "HUNTER",
    name: "Hunter",
    subtitle: "Mobilidade, armadilhas e ataques de precisão",
    proficiencies: "Leather Armor, DEX Weapons",
    featureTitle: "Thrill of the Hunt",
    resource1: "Thrill Charges",
    accent: "#35795c",
    accentSoft: "#e1f0e8",
    accentInk: "#23513d",
    features: ["Addling Arrow", "Come Get Some!", "Decoy", "Fleet Feet", "Grease Trap", "Hail of Arrows", "Heavy Shot", "Incendiary Shot", "Multishot", "Pinning Shot", "Snare Trap", "Sharpshooter", "Vital Shot", "Wild Instinct"],
  },
  {
    id: "MAGE",
    name: "Mage",
    subtitle: "Manipulação elemental e versatilidade arcana",
    proficiencies: "Cloth Armor, Blades, Staves, Wands",
    featureTitle: "Spellshaper",
    resource1: "Mana",
    resource2: "Elemental Mastery",
    usesSpellTier: true,
    accent: "#27758b",
    accentSoft: "#dff0f4",
    accentInk: "#164f5f",
    features: ["Dimensional Compression", "Echo Casting", "Elemental Destruction", "Elemental Transmutation", "Extra-Dimensional Vision", "Methodical Spellweaver", "Precise Casting", "Stretch Time"],
  },
  {
    id: "OATHSWORN",
    name: "Oathsworn",
    subtitle: "Proteção, justiça e poder sagrado",
    proficiencies: "All Armor, STR Weapons",
    featureTitle: "Sacred Decrees",
    resource1: "Mana",
    resource2: "Lay on Hands",
    usesSpellTier: true,
    accent: "#9a7a24",
    accentSoft: "#f6efd7",
    accentInk: "#675013",
    features: ["Blinding Aura", "Courage!", "Explosive Judgement", "Improved Aura", "Radiant Aura", "Reliable Justice", "Shining Mandate", "Stand Fast, Friends!", "Unstoppable Protector", "Well Armored", "Judgement Dice", "Aura Reach"],
  },
  {
    id: "SHADOWMANCER",
    name: "Shadowmancer",
    subtitle: "Invocações sombrias e poder roubado",
    proficiencies: "Cloth Armor, Blades, Wands",
    featureTitle: "Greater Invocations",
    resource1: "Pilfered Power",
    usesSpellTier: true,
    accent: "#4c568d",
    accentSoft: "#e4e6f3",
    accentInk: "#30385f",
    features: ["Armor of Shadows", "Fiendish Boon", "Hungering Shadows", "One with Shadows", "Repelling Blast", "Shadow Magus", "Shadow Spear", "Shadow Rush", "Shadow Warp", "Swarming Shadows", "Vengeful Blast"],
  },
  {
    id: "SHEPHERD",
    name: "Shepherd",
    subtitle: "Companheiros, cura e graças sagradas",
    proficiencies: "Mail Armor, Shields, STR Weapons, Wands",
    featureTitle: "Sacred Graces",
    resource1: "Mana",
    resource2: "Searing Light",
    usesSpellTier: true,
    accent: "#63813b",
    accentSoft: "#eaf1df",
    accentInk: "#405723",
    features: ["Assist Me, My Friend!", "Empowered Companion", "Guiding Spirit", "Hasty Companion", "Illuminate Soul", "Light Bearer", "Not Beyond MY Reach", "Vengeful Spirit"],
  },
  {
    id: "SONGWEAVER",
    name: "Songweaver",
    subtitle: "Canções, inspiração e controle da narrativa",
    proficiencies: "Cloth Armor, Leather Armor, DEX Weapons, Wands",
    featureTitle: "Lyrical Weaponry",
    resource1: "Mana",
    resource2: "Songweaver’s Inspiration",
    usesSpellTier: true,
    accent: "#9c4f79",
    accentSoft: "#f5e3ed",
    accentInk: "#69314f",
    features: ["Heroic Ballad", "Inspiring Anthem", "Not My Beautiful Faaace!", "Rhapsody of the Normal", "Song of Domination"],
  },
  {
    id: "STORMSHIFTER",
    name: "Stormshifter",
    subtitle: "Transformação, natureza e movimento bestial",
    proficiencies: "Cloth Armor, Leather Armor, Staves, Wands",
    featureTitle: "Chimeric Boons",
    resource1: "Mana",
    resource2: "Beastshift",
    usesSpellTier: true,
    accent: "#3a779a",
    accentSoft: "#e0edf4",
    accentInk: "#24516b",
    features: ["Beast of the Sea", "Climber", "Fleet Footed", "Earthwalker", "Keen Senses", "Leader of the Pack", "Phasebeast", "Prehensile Tail", "Winged"],
  },
  {
    id: "THE_CHEAT",
    name: "The Cheat",
    subtitle: "Truques, vantagem e ataques oportunistas",
    proficiencies: "Leather Armor, DEX Weapons",
    featureTitle: "Underhanded Abilities",
    resource1: "Sneak Attack",
    accent: "#ad642f",
    accentSoft: "#f7e8dc",
    accentInk: "#74401e",
    features: ["Creative Accounting", "Exploit Weakness", "Feinting Attack", "How’d YOU Get Here?!", "I’m Outta Here!", "Misdirection", "Steal Tempo", "Sunder Armor (Heavy)", "Sunder Armor (Med.)", "Trickshot"],
  },
  {
    id: "ZEPHYR",
    name: "Zephyr",
    subtitle: "Velocidade, disciplina e artes marciais",
    proficiencies: "Melee Weapons",
    featureTitle: "Martial Arts Abilities",
    resource1: "Bursts of Speed",
    accent: "#2b817b",
    accentSoft: "#def1ef",
    accentInk: "#195853",
    features: ["Airshift", "Blur", "Bodily Discipline", "Enduring Soul", "I Jump On His Back!", "Kinetic Barrage", "Mighty Soul", "Quickstrike", "Use Momentum", "Vital Rejuvenation", "Windstrider"],
  },
];

export function isNimbleLayout(value: unknown): value is NimbleLayoutId {
  return typeof value === "string" && (NIMBLE_LAYOUT_IDS as readonly string[]).includes(value);
}

export function getNimbleLayout(value: unknown): NimbleLayoutDefinition {
  return NIMBLE_LAYOUTS.find((layout) => layout.id === value) ?? NIMBLE_LAYOUTS[0];
}
