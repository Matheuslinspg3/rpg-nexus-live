-- Cianna's Stage: three Discord channels per campaign.
-- The only persisted channel roles are Audiovisual, Dados (also session notices), and Música.
-- PVRP is intentionally absent and is never read, imported or cataloged.
ALTER TABLE discord_campaign_integrations
  ADD COLUMN IF NOT EXISTS dice_channel_id TEXT;
