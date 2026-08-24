import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  resetAt: text("reset_at").notNull(),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  system: text("system").notNull().default("Nimble RPG"),
  masterEmail: text("master_email").notNull(),
  masterName: text("master_name").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const campaignScenes = sqliteTable("campaign_scenes", {
  campaignId: text("campaign_id").primaryKey().references(() => campaigns.id, { onDelete: "cascade" }),
  imageKey: text("image_key").notNull(),
  imageName: text("image_name").notNull(),
  contentType: text("content_type").notNull(),
  revealPercent: integer("reveal_percent").notNull().default(0),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const diceRolls = sqliteTable(
  "dice_rolls",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    rollerUserId: text("roller_user_id").notNull(),
    rollerName: text("roller_name").notNull(),
    visibility: text("visibility", { enum: ["public", "master_private"] }).notNull(),
    diceSides: integer("dice_sides").notNull(),
    diceCount: integer("dice_count").notNull(),
    modifier: integer("modifier").notNull().default(0),
    resultsJson: text("results_json").notNull(),
    total: integer("total").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("dice_rolls_campaign_created_idx").on(table.campaignId, table.createdAt)],
);

// Simplified camera system - stores only active camera states
export const cameraStates = sqliteTable(
  "camera_states",
  {
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index("camera_states_campaign_active_idx").on(table.campaignId, table.isActive, table.updatedAt),
  ],
);

// WebRTC signaling messages
export const cameraSignals = sqliteTable(
  "camera_signals",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    signal: text("signal").notNull(), // JSON: offer, answer, or ice candidate
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("camera_signals_recipient_idx").on(table.campaignId, table.toUserId, table.createdAt),
  ],
);

export const shieldLayouts = sqliteTable(
  "shield_layouts",
  {
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    shieldType: text("shield_type", { enum: ["master", "player"] }).notNull(),
    layoutJson: text("layout_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.userId, table.shieldType] })],
);

export const campaignMembers = sqliteTable(
  "campaign_members",
  {
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["master", "player"] }).notNull(),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.email] })],
);

export const sheetFields = sqliteTable(
  "sheet_fields",
  {
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    fieldValue: text("field_value").notNull().default(""),
    updatedBy: text("updated_by").notNull(),
    updatedByName: text("updated_by_name").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.fieldKey] })],
);

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  assignedUserId: text("assigned_user_id"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const characterFields = sqliteTable(
  "character_fields",
  {
    characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    fieldValue: text("field_value").notNull().default(""),
    updatedBy: text("updated_by").notNull(),
    updatedByName: text("updated_by_name").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.characterId, table.fieldKey] })],
);

export const presence = sqliteTable(
  "presence",
  {
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["master", "player"] }).notNull(),
    color: text("color").notNull(),
    cursorX: real("cursor_x"),
    cursorY: real("cursor_y"),
    editingField: text("editing_field"),
    activeAt: text("active_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.email] })],
);
