-- Áudios das sessões do Cianna's Stage.
-- O bucket permanece privado; o site e o bot usam URLs temporárias.
ALTER TABLE public.discord_campaign_integrations
  ADD COLUMN IF NOT EXISTS recording_text_channel_id TEXT;

COMMENT ON COLUMN public.discord_campaign_integrations.recording_text_channel_id
  IS 'Canal de texto onde os áudios convertidos das sessões serão publicados.';

CREATE TABLE IF NOT EXISTS public.recording_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_code TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  voice_channel_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'ready', 'failed')),
  part_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recording_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.recording_sessions(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL DEFAULT 'audio/ogg',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, part_number)
);

CREATE INDEX IF NOT EXISTS recording_sessions_campaign_created_idx
  ON public.recording_sessions(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recording_parts_session_number_idx
  ON public.recording_parts(session_id, part_number);

ALTER TABLE public.recording_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Campaign members can view recording sessions" ON public.recording_sessions;
CREATE POLICY "Campaign members can view recording sessions"
  ON public.recording_sessions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaign_members cm
    WHERE cm.campaign_id = recording_sessions.campaign_id
      AND cm.email = auth.jwt()->>'email'
  ));

DROP POLICY IF EXISTS "Campaign members can view recording parts" ON public.recording_parts;
CREATE POLICY "Campaign members can view recording parts"
  ON public.recording_parts FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public.recording_sessions rs
    JOIN public.campaign_members cm ON cm.campaign_id = rs.campaign_id
    WHERE rs.id = recording_parts.session_id
      AND cm.email = auth.jwt()->>'email'
  ));

INSERT INTO storage.buckets (id, name, public)
VALUES ('session-audio', 'session-audio', false)
ON CONFLICT (id) DO NOTHING;
