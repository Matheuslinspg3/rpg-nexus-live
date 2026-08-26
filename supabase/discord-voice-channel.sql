-- Cianna's Stage: canal de voz separado da integração Discord.
-- O canal PVRP nunca é armazenado ou consultado.
ALTER TABLE discord_campaign_integrations
  ADD COLUMN IF NOT EXISTS audiovisual_voice_channel_id TEXT;

COMMENT ON COLUMN discord_campaign_integrations.audiovisual_voice_channel_id
  IS 'Canal de voz do Discord usado para gravação, somente após consentimento dos participantes.';
