-- Cianna's Stage: Discord campaign integration.
-- PVRP is intentionally absent: it is never read, imported or cataloged.
CREATE TABLE IF NOT EXISTS discord_campaign_integrations (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  guild_id TEXT,
  rpg_channel_id TEXT,
  audiovisual_channel_id TEXT,
  announcements_channel_id TEXT,
  music_channel_id TEXT,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE discord_campaign_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Campaign members can read Discord integration" ON discord_campaign_integrations FOR SELECT USING (EXISTS (SELECT 1 FROM campaign_members cm WHERE cm.campaign_id = discord_campaign_integrations.campaign_id AND cm.email = auth.jwt()->>'email'));
