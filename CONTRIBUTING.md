# Contributing

## Development workflow (post-branching setup)

Everything that changes schema or ships code goes through a PR. Direct pushes
to `main` are discouraged — Supabase Branching makes PR-first much safer.

### 1. Start a branch

```bash
git checkout main && git pull
git checkout -b feature/your-thing        # or fix/bug-name, chore/..., etc.
```

### 2. Make changes

- **Code:** anywhere under `src/`
- **Schema:** add a new migration file to `supabase/migrations/` with a
  `YYYYMMDDHHMMSS_description.sql` filename. Never edit existing migrations
  or the baseline — add new ones for every change.

### 3. Push + open PR

```bash
git push -u origin feature/your-thing
gh pr create --title "..." --body "..."
```

### 4. Supabase auto-creates a preview branch

Within ~2 min of opening the PR, Supabase:

- Spins up a disposable Postgres database
- Applies the baseline schema (`00000000000000_baseline_schema.sql`)
- Applies any new migrations you added in the PR
- Runs `supabase/seed.sql` for minimal demo data
- Posts a comment on the PR with the preview branch's Studio URL

You can hit the preview DB via the Studio UI or configure a local dev
environment to point at its connection string.

### 5. Validate

GitHub Actions runs:

- `tsc --noEmit`
- `vitest run`
- Migration filename regex check

All three must be green before merge.

### 6. Merge

Squash-merge into `main`. Supabase automatically:

- Deletes the preview branch database (~$0 cost because it was open <1 day)
- **IF Deploy-to-production is ON**: runs new migrations against prod
- **IF Deploy-to-production is OFF** (current state): skips prod, you run
  migrations manually — see below

## Flipping Deploy-to-production ON (one-time future step)

Currently OFF. To turn on safely:

```bash
# Register the baseline as already applied on production, so Supabase
# doesn't try to re-run 14690 lines of CREATE TABLE IF NOT EXISTS that
# already exist in prod.
npx supabase migration repair --status applied 00000000000000 --linked
```

Then in the Supabase dashboard: Project Settings → Integrations → GitHub →
flip **Deploy to production** ON. Test by merging a trivial schema change
via PR and verifying it lands in prod.

## Structure

- `supabase/migrations/` — active migrations (baseline + anything new)
- `supabase/archive/pre-branching-migrations/` — 124 historical migrations,
  kept for git history. Not replayed. Don't edit.
- `supabase/seed.sql` — synthetic data for preview branches. **No real PII.**
- `supabase/config.toml` — Supabase CLI + branching config
- `.github/workflows/supabase-preview.yml` — PR validation gate

## Adding a new migration

```bash
# Name with YYYYMMDDHHMMSS timestamp so it sorts after baseline + earlier ones
TS=$(date -u +%Y%m%d%H%M%S)
touch "supabase/migrations/${TS}_my_change.sql"
# Edit the file with your DDL
```

Migrations must be idempotent where possible: `CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, policy `DROP IF EXISTS` before `CREATE`. This
ensures reruns (if they happen) don't fail halfway.

## Tips

- **Preview branch URL is sticky:** if you push more commits to the PR, the
  same preview DB is updated (migrations re-applied). Seed is NOT re-run.
- **Open preview branches cost money:** ~$0.013/hr per branch. Close PRs
  when done. Max concurrent branches capped at 3 in the Supabase settings.
- **No raw `supabase db query --linked`** going forward — that's how prod got
  out of sync with the migrations folder in the first place. Every schema
  change goes through a migration file.
