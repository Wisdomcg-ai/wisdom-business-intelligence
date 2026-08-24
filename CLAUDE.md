# WisdomBI (business-coaching-platform)

This is **WisdomBI** — Matt Malouf's business-intelligence platform for his
coaching clients (18+ businesses, each connected to Xero). CFO-level accuracy
is the bar; the target user is "not a numbers person", so simplicity beats
completeness.

**This is NOT inLIFE Pulse.** Pulse is a separate fork at
`/Users/mattmalouf/Desktop/inlife-pulse` with its own database, accounts, and
deploy rules. Never operate on that directory from a session here.

## Identity & accounts
- GitHub remote: `Wisdomcg-ai/wisdom-business-intelligence` — NEVER push
  anywhere else; verify `git remote -v` before any push.
- Supabase prod: project `uudfstpvndurzwnapibf` (WisdomBI Supabase account —
  different account from Pulse's). MCP: `supabase-wisdombi` (project-scoped).
- Vercel: team `wisdom-business-intelligence`, project
  `wisdom-business-intelligence`.
- Sentry, Supabase and Vercel dashboards need the WISDOMBI logins, not the
  inLIFE ones.

## Deploy model
- Work on a branch → PR to `main` → wait for CI green (build, lint, typecheck,
  vitest, migration filenames, Supabase Preview) → squash-merge. Merging to
  main deploys prod via Vercel automatically.
- Verify deploys via the commit status API, never from page content.
- Run the FULL `npx vitest run` locally before pushing. Known local-only
  failure: `plan-period-banner.test.tsx` (timezone-shaped) — fails on
  unmodified main too; CI passes it.

## Database rules
- **Migrations**: repo files under `supabase/migrations/`, names must match
  the ledger. The auto-apply pipeline is BROKEN — after merge, apply to prod
  deliberately (MCP `apply_migration`), then make the ledger row's version
  match the repo filename. NEVER blind `db push`.
- **Dual business IDs** (the #1 recurring incident class): `businesses.id`
  and `business_profiles.id` are different id-spaces sharing column names.
  Any code touching `business_id` goes through the branded
  `resolveBusinessProfileIds` resolver. `sync_jobs.business_id` is
  business_profiles-space; `xero_connections.business_id` is businesses-space
  — join them on `tenant_id`, never on business_id.
- SWOT is keyed by owner user_id (legacy); business_kpis canonical key is
  business_profiles.id.

## Xero pipeline (since Aug 2026 backport)
- sync-all-xero: 6-hourly (`0 4,10,16,22 * * *`), 700s budget, stalest-first
  rotation, self-chaining, start-marker heartbeats, ONE aggregated Sentry
  event per run. P&L reconciliation materiality $0.05; BS equation stays $0.01.
- "Connected" has ONE definition: `src/lib/xero/connection-status.ts`
  (7 states, auth×data axes). Never derive connection health inline.
- Heartbeats in `cron_heartbeats`; watchdog every 2h; metric invariants daily
  05:00 UTC into `metric_invariant_runs` (all checks start at `watch`
  severity — promote only after history proves them quiet). Never clamp a
  metric.
- Fail-closed CRON_SECRET gates on every cron:
  `if (!cronSecret || auth !== \`Bearer ${cronSecret}\`)` — never the loose
  comparison. CRON_SECRET never passes through Claude; use the Vercel cron
  Run button via Matt's session for manual triggers.

## Conventions
- All API routes use the Phase-47 `withSchema`/`withQuerySchema` Zod wrappers.
- SECURITY DEFINER functions: revoke PUBLIC/anon/authenticated, grant only
  what's needed — and re-issue revokes after every DROP+CREATE (DROP discards
  the ACL). A SECURITY DEFINER function that bypasses RLS to write must guard
  internally (`auth_can_manage_business`, with a `service_role` bypass keyed on
  `auth.role()` since `auth.uid()` is null under service_role).
- CI gate `scripts/ci/check-migration-security.mjs` (job "migration security")
  scans PR-changed migrations: no new anon/PUBLIC grants, SECURITY DEFINER must
  `SET search_path`, new public tables must enable RLS. Escape via
  `-- security-allow: anon-grant|no-rls <reason>`. See scripts/ci/README.md.
- Every swallowed failure on a WRITE gets a Sentry capture with an
  `invariant:` tag — no silent `.catch(() => {})` on writes.
- Secrets never pass through Claude's context: tokens go into Vercel/Supabase
  dashboards or local config by Matt directly.
