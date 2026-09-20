-- Quarterly review — the coach chooses how a client's next review runs.
--
-- The workshop detects a "first session" from the data (no plan, no prior
-- completed review) and switches the backward-looking steps to baseline capture.
-- Detection cannot know that a client who has SOME data should still be run as a
-- first session — a half-set-up client, a client whose plan is a year stale, a
-- client the coach simply wants to start again with. This column is the coach's
-- override of that decision.
--
--   auto          — use the detected state (default, and what every existing row gets)
--   first_session — always run the first-session flow for this client
--   standard      — never run it, whatever the data says
--
-- It lives on `businesses` rather than `business_profiles` deliberately: it is a
-- coaching preference about a client, the coach relationship (`assigned_coach_id`)
-- is here, and `quarterly_reviews.business_id` is already businesses-space — so
-- both the workshop and the coach's list address it without crossing id-spaces.
-- Crossing them is the #1 recurring incident class in this codebase.
--
-- No new table and no new grants, so the migration-security gate has nothing to
-- flag. Writes are already governed by the existing `businesses_access` policy,
-- whose WITH CHECK admits super_admin, the owner, and the assigned coach — which
-- is exactly who may set this. No policy change is needed, and none is made.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS review_session_mode text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'businesses_review_session_mode_check'
      AND conrelid = 'public.businesses'::regclass
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_review_session_mode_check
      CHECK (review_session_mode IN ('auto', 'first_session', 'standard'));
  END IF;
END $$;

COMMENT ON COLUMN public.businesses.review_session_mode IS
  'Coach override for how this client''s quarterly review runs: auto (detect), first_session (always the first-session flow), standard (never). See src/app/quarterly-review/utils/review-readiness.ts.';
