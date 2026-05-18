# Supabase Legacy Keys → Publishable/Secret — Migration Plan & Progress

**Branch:** `supabase-api-key-migration` · **Status:** All code commits done (1–5 + 4.5).
Nothing pushed. App runs on legacy keys via fallback. Next: open PR + Step 4 verify.

## Goal
Migrate Supabase client init from legacy JWT keys (`anon` / `service_role`) to the
new keys (`sb_publishable_…` / `sb_secret_…`). Legacy keys valid until end-2026 and
kept as fallback. Do NOT disable JWT keys in Supabase — operator's call post-verify.

## Key facts
- New keys are a **drop-in value swap** for SDK clients (`createClient` /
  `createBrowserClient` / `createServerClient`) — signatures unchanged.
- **Gotcha:** new keys are NOT JWTs — they cannot go in an `Authorization: Bearer`
  header. Use the `apikey` header (or pass as the SDK key arg) only.

## Decisions (operator-approved)
- New env vars: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- Resolvers in `src/lib/supabase/keys.ts` prefer new, fall back to legacy
  (secret resolver also collapses the two legacy names SERVICE_KEY / SERVICE_ROLE_KEY).
- `scripts/` (~197 refs) LEFT on legacy keys — works via fallback; out of scope.
- Do not change which client TYPE a route uses — only the key source.

## Commit plan — ALL DONE
1. **DONE** (`039da52e`) — `keys.ts` resolvers + `.env.example` scaffold.
2. **DONE** (`9c3f04d6`) — anon→publishable: 15 files (wrappers + inline +
   org-chart anon line + env-validation.ts).
3. **DONE** (`79a32d09`) — `Authorization` header fix, 10 `fetch()` sites, 4 files:
   send-invitation, resend-invitation, team/invite, demo-client.
4. **DONE** (`95c2238c`) — 3 `src/lib` service-role clients (admin.ts,
   notifications.ts, verify-business-access.ts) → `getSupabaseSecretKey()`.
   encryption.ts skipped — comment-only refs, no live env usage.
4.5 **DONE** (`58c5f794`) — Commit 3's discovery undercounted: 3 MORE files do
   Auth-Admin-REST calls with the `Authorization: Bearer` pattern. Fixed 6 sites
   in admin/clients, coach/clients, team/remove-member.
5. **DONE** (`f56664db`) — 57 `src/app` route files: inline `process.env`
   service-key → `getSupabaseSecretKey()`. Plus 6 migration-test files (kept a
   non-throwing `?? ` chain with `SUPABASE_SECRET_KEY` prepended — module-scoped
   skip-guards must not throw) and `src/__tests__/setup.ts` (placeholder env
   vars so route modules resolve a key at import time under test).
6. **DONE** (this doc) — `.env.example` was C1. CLAUDE.md key-system section:
   CLAUDE.md is in unmerged PR #200, absent from this branch — fold the
   key-system note into PR #200 or fast-follow after it merges.

Verification each commit: `npx tsc --noEmit` + `npx vitest run`.
Known pre-existing failures (NOT regressions): `plan-period-banner` (AEST
timezone), `db-05-filename-hygiene` (untracked stray `… 2.sql`).
Final state: 1431 passed, 2 known failures, tsc clean (errors only in stray
`… 2/3`-suffixed files + out-of-scope `scripts/`).

## Step 4 — Production verification & cutover

### Pre-merge
- [ ] Open ONE PR vs `wisdom-business-intelligence` (no push to main).
- [ ] Confirm CI green (the 2 known failures are local-only — verify CI baseline).

### Add new env vars (Vercel) — keep legacy vars in place as fallback
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…` (from Supabase
      dashboard → API keys) — Production + Preview + Development.
- [ ] `SUPABASE_SECRET_KEY` = `sb_secret_…` — Production + Preview + Development.
- [ ] Leave `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` set — resolvers fall back to them.

### Post-deploy smoke (production, after merge auto-deploys)
- [ ] Browser/auth: log in as a coach — dashboard loads (publishable key + SSR).
- [ ] User-scoped RLS read: open a client's monthly report — data scoped correctly.
- [ ] Admin/service path: create a test client via admin (admin/clients POST —
      exercises the Auth-Admin-REST `apikey`-only header from Commit 4.5).
- [ ] Xero: open a Xero-connected client's report (service-role read path).
- [ ] Team: invite + remove a team member (Commit 3 + 4.5 paths).
- [ ] Check Sentry — no `Missing Supabase … key` errors, no 401 from Auth Admin API.

### Cutover (operator-only, after smoke passes)
- [ ] Once verified, optionally remove the legacy env vars in Vercel.
- [ ] ONLY THEN: toggle "Disable JWT-based API keys" in Supabase — operator's call.

### Rollback
- New keys are additive; legacy keys still work. To roll back: remove the new
  env vars (resolvers fall straight back to legacy) or `git revert` the branch.
- Do NOT disable JWT keys until smoke is fully verified — that step is irreversible
  for the legacy keys.
