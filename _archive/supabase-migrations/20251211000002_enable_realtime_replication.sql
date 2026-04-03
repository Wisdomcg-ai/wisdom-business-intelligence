-- =====================================================
-- ENABLE REALTIME REPLICATION FOR COACH PORTAL
-- =====================================================
-- This migration enables Supabase Realtime for tables
-- that the coach portal subscribes to for live updates.
--
-- Run each statement separately in SQL Editor.
-- If a table doesn't exist or is already added, it will error (that's OK).

-- Enable replication for business_profiles
ALTER PUBLICATION supabase_realtime ADD TABLE public.business_profiles;

-- Enable replication for strategic_initiatives
ALTER PUBLICATION supabase_realtime ADD TABLE public.strategic_initiatives;

-- Enable replication for weekly_reviews
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_reviews;

-- Enable replication for audit_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;

-- Enable replication for swot_analyses
ALTER PUBLICATION supabase_realtime ADD TABLE public.swot_analyses;

-- Enable replication for vision_targets
ALTER PUBLICATION supabase_realtime ADD TABLE public.vision_targets;

-- Enable replication for assessments
ALTER PUBLICATION supabase_realtime ADD TABLE public.assessments;

-- Enable replication for ideas
ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas;

-- Note: If a table is already in the publication, the command will error.
-- You can check current tables with:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
