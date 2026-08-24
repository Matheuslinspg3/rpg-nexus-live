-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (will integrate with Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  system TEXT NOT NULL DEFAULT 'Nimble RPG',
  master_email TEXT NOT NULL,
  master_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaign Members
CREATE TABLE campaign_members (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'player')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, email)
);

-- Campaign Scenes
CREATE TABLE campaign_scenes (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  image_key TEXT NOT NULL,
  image_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  reveal_percent INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dice Rolls
CREATE TABLE dice_rolls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  roller_user_id TEXT NOT NULL,
  roller_name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'master_private')),
  dice_sides INTEGER NOT NULL,
  dice_count INTEGER NOT NULL,
  modifier INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dice_rolls_campaign_created_idx ON dice_rolls(campaign_id, created_at);

-- Camera Rooms (Daily.co integration)
CREATE TABLE camera_rooms (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  room_url TEXT NOT NULL,
  room_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shield Layouts
CREATE TABLE shield_layouts (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  shield_type TEXT NOT NULL CHECK (shield_type IN ('master', 'player')),
  layout_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id, shield_type)
);

-- Sheet Fields
CREATE TABLE sheet_fields (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_by_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, field_key)
);

-- Characters
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  assigned_user_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Character Fields
CREATE TABLE character_fields (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_by_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, field_key)
);

-- Presence (for real-time collaboration)
CREATE TABLE presence (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'player')),
  color TEXT NOT NULL,
  cursor_x REAL,
  cursor_y REAL,
  editing_field TEXT,
  active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, email)
);

-- Enable Row Level Security
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dice_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE shield_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaigns
CREATE POLICY "Users can view campaigns they are members of"
  ON campaigns FOR SELECT
  USING (
    master_email = auth.jwt()->>'email' OR
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_members.campaign_id = campaigns.id
      AND campaign_members.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Masters can update their campaigns"
  ON campaigns FOR UPDATE
  USING (master_email = auth.jwt()->>'email');

CREATE POLICY "Any authenticated user can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (auth.jwt()->>'email' IS NOT NULL);

-- RLS Policies for campaign_members
CREATE POLICY "Members can view other members in their campaigns"
  ON campaign_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = campaign_members.campaign_id
      AND cm.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Masters can manage members"
  ON campaign_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_members.campaign_id
      AND campaigns.master_email = auth.jwt()->>'email'
    )
  );

-- RLS Policies for dice_rolls
CREATE POLICY "Users can view public rolls and their own private rolls"
  ON dice_rolls FOR SELECT
  USING (
    visibility = 'public' OR
    roller_user_id = auth.jwt()->>'email' OR
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = dice_rolls.campaign_id
      AND campaigns.master_email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Campaign members can create rolls"
  ON dice_rolls FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_members.campaign_id = dice_rolls.campaign_id
      AND campaign_members.email = auth.jwt()->>'email'
    )
  );

-- RLS Policies for presence (real-time collaboration)
CREATE POLICY "Members can view presence in their campaigns"
  ON presence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_members.campaign_id = presence.campaign_id
      AND campaign_members.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Members can update their own presence"
  ON presence FOR ALL
  USING (email = auth.jwt()->>'email');

-- RLS Policies for other tables (similar pattern)
CREATE POLICY "Members can view campaign data"
  ON campaign_scenes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_members.campaign_id = campaign_scenes.campaign_id
      AND campaign_members.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Members can view characters"
  ON characters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_members.campaign_id = characters.campaign_id
      AND campaign_members.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Members can view character fields"
  ON character_fields FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      JOIN characters c ON c.campaign_id = cm.campaign_id
      WHERE c.id = character_fields.character_id
      AND cm.email = auth.jwt()->>'email'
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
