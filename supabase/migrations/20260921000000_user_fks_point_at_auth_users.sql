-- Seven user_id foreign keys pointed at a table almost nobody is in.
--
-- `public.profiles` holds 2 rows against 41 auth users — `demo@wisdombi.au` and
-- a retired `mattmalouf@wisdomcoaching.com.au` account. Seven tables reference it
-- from `user_id`/`created_by`, so for 39 of 41 users every insert into them fails
-- with a foreign-key violation (SQLSTATE 23503).
--
-- Found 21 Sep 2026 by driving a quarterly review to completion in production:
-- the review reported success while `kpi_actuals` and `quarterly_snapshots` wrote
-- nothing, because `review.user_id` (whoever completes the review — often the
-- coach) is not in `profiles`. Every row those two tables hold belongs to one of
-- the two accounts that are.
--
-- `auth.users` is the house convention by a distance: 126 foreign keys across
-- this schema point at it and only these 7 point at `profiles` — which itself
-- has `profiles.id REFERENCES auth.users`. `quarterly_reviews.user_id` already
-- references `auth.users`, which is why the review row saved while its actuals
-- did not: the same id, accepted by one table and rejected by the next.
--
-- Safe to re-point: every existing row in all seven tables already has a user_id
-- present in auth.users (verified 21 Sep 2026 — zero orphans), so nothing needs
-- repairing and no row is rejected by the new constraint.
--
-- ON DELETE behaviour is preserved exactly as it was on each constraint.
-- No new table, no new grants, no SECURITY DEFINER.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('annual_snapshots',    'user_id',    'CASCADE'),
      ('business_members',    'user_id',    'CASCADE'),
      ('forecasts',           'created_by', 'SET NULL'),
      ('kpi_actuals',         'user_id',    'CASCADE'),
      ('quarterly_snapshots', 'user_id',    'CASCADE'),
      ('roadmap_completions', 'user_id',    'SET NULL'),
      ('strategic_plans',     'user_id',    'CASCADE')
    ) AS v(tbl, col, on_delete)
  LOOP
    -- Drop whichever constraint currently points that column at public.profiles.
    EXECUTE (
      SELECT coalesce(
        string_agg(format('ALTER TABLE public.%I DROP CONSTRAINT %I;', t.tbl, con.conname), ' '),
        ''
      )
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_class ref ON ref.oid = con.confrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_namespace rn ON rn.oid = ref.relnamespace
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND n.nspname = 'public' AND cl.relname = t.tbl
        AND rn.nspname = 'public' AND ref.relname = 'profiles'
        AND a.attname = t.col
    );

    -- Re-point at auth.users, preserving the original ON DELETE action.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_class ref ON ref.oid = con.confrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_namespace rn ON rn.oid = ref.relnamespace
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND n.nspname = 'public' AND cl.relname = t.tbl
        AND rn.nspname = 'auth' AND ref.relname = 'users'
        AND a.attname = t.col
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s;',
        t.tbl, t.tbl || '_' || t.col || '_fkey', t.col, t.on_delete
      );
    END IF;
  END LOOP;
END $$;
