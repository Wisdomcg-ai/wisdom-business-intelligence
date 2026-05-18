# Supabase Legacy Keys → Publishable/Secret — Migration Plan & Progress

**Branch:** `supabase-api-key-migration` · **Status:** Commits 1–3 done, Commit 4 next.
Resume by reading this file. Nothing pushed; app runs on legacy keys via fallback.

> Commit 3 done (`79a32d09`): 10 Authorization-header sites fixed across the 4
> Auth-Admin-REST files; `tsc` clean. NOTE: full `vitest` not yet run post-Commit-3
> (header-only change in `fetch()` calls) — run it at the start of the next session.
> Commit 4 PRECONDITION still pending: the user-scoped-vs-admin client confirmation.

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
- Migration-test files route through the resolver (Commit 5).
- Commit 5 = ONE commit; `tsc` every ~15 files mid-edit; commit after full tsc+vitest.
- Do not change which client TYPE a route uses — only the key source.

## Commit plan
1. **DONE** (`9c…1`) — `keys.ts` resolvers + `.env.example` scaffold.
2. **DONE** (`9c3f04d6`) — anon→publishable: 15 files (4 wrappers + 9 inline +
   org-chart anon line + env-validation.ts). Step-1 discovery under-counted the
   inline `createBrowserClient` sites — now reconciled.
3. **NEXT** — `Authorization` header fix. 10 `fetch()` sites, 4 files, all identical:
   drop `'Authorization': \`Bearer ${SERVICE_ROLE_KEY}\`,` line; keep
   `'apikey': getSupabaseSecretKey()`; add the import. Sites:
   - `api/clients/send-invitation/route.ts` — L79
   - `api/admin/clients/resend-invitation/route.ts` — L67
   - `api/team/invite/route.ts` — L120, L212, L250
   - `api/admin/demo-client/route.ts` — L81, L106, L140, L190, L869
   These 4 files also have SDK service-role clients → also touched in Commit 5.
4. Service-role wrappers + 5 `src/lib` files → `getSupabaseSecretKey()`.
   PRECONDITION: confirm user-scoped (publishable+SSR+cookies, RLS applies) vs
   admin (secret+admin client, RLS bypassed) distinction before editing; do not
   change which client a route uses.
5. The ~62 inline `src/app/api/**` service-role sites: `process.env.SUPABASE_SERVICE_KEY!`
   / `SUPABASE_SERVICE_ROLE_KEY!` → `getSupabaseSecretKey()`. One mechanical commit.
   Includes the 6 migration-test files referencing both names.
6. Docs — `.env.example` (done in C1) + CLAUDE.md key-system section. NOTE: CLAUDE.md
   is in unmerged PR #200, absent from `origin/main`/this branch — fold the key-system
   note into PR #200 or fast-follow after it merges.

After each commit: `npx tsc --noEmit` + `npx vitest run` (full suite / `/preflight`).
Known pre-existing local-only test failures (NOT regressions): `plan-period-banner`
(AEST timezone), `db-05-filename-hygiene` (untracked stray `… 2.sql`), `phase-51-step4-termination`.

## Then
One PR vs `wisdom-business-intelligence` (no push to main). Step 4 = verification
checklist + production cutover order + rollback (to be written before cutover).
