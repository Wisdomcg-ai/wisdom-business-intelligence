---
phase: 46-server-side-hardening
plan: 02
subsystem: auth
tags: [cron-auth, encryption, vercel-env, ci-workflow, supabase, xero]

# Dependency graph
requires:
  - phase: 44-05
    provides: src/app/api/Xero/sync-all/route.ts thin-shim shape (the file is now 86 lines, NOT 573 — PHASE.md ref was stale)
provides:
  - SEC-02 fail-closed cron auth on /api/Xero/sync-all and /api/Xero/refresh-tokens
  - SEC-03 verifier script (scripts/verify-xero-tokens-encrypted.ts) for xero_connections token encryption audit
  - SEC-04 PART 1 — APP_SECRET_KEY plumbed in CI workflow + (after operator action) in Vercel Production + Preview env scopes
  - SEC-04-MIGRATION-NOTE.md documenting why fallback removal is split across 46-02 + 46-04, the 5 preconditions for 46-04, and the 7-day cooling rationale
affects: [46-04, future-cron-routes, encryption-key-rotation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical fail-closed cron auth — !cronSecret || auth !== Bearer cronSecret (no NODE_ENV carve-out)"
    - "2-PR migration for env-var-coupled code changes (env var + verifier first, code change gated on operator confirmation + cooling period)"

key-files:
  created:
    - src/__tests__/api/xero-sync-all-cron-auth.test.ts
    - scripts/verify-xero-tokens-encrypted.ts
    - .planning/phases/46-server-side-hardening/SEC-04-MIGRATION-NOTE.md
    - .planning/phases/46-server-side-hardening/deferred-items.md
  modified:
    - src/app/api/Xero/sync-all/route.ts
    - src/app/api/Xero/refresh-tokens/route.ts
    - .github/workflows/supabase-preview.yml
    - .env.example

key-decisions:
  - "Apply the same fail-closed pattern to refresh-tokens that we apply to sync-all (defence-in-depth — same fail-open shape per RESEARCH.md)"
  - "Drop the dev/preview NODE_ENV carve-out entirely — devs set CRON_SECRET=local-dev-secret in .env.local"
  - "Split SEC-04 across two PRs (env var + verifier in 46-02, fallback removal in 46-04) to make the prod migration window verifiable before the strict key chain locks in"

patterns-established:
  - "Cron auth pattern: const cronSecret = process.env.CRON_SECRET; if (!cronSecret || auth !== `Bearer ${cronSecret}`) return 401"
  - "Verifier script pattern: re-use existing helpers from src/lib (here: isEncrypted) rather than re-implement; emit JSON report; non-zero exit on any failure"
  - "CI build env-block placeholder strategy — add a syntactically-valid placeholder for any env var that module-init code reads, BEFORE the strict-throw code lands"

requirements-completed: [SEC-02, SEC-03, SEC-04-PART-1]

# Metrics
duration: ~30min (autonomous tasks; operator action pending)
completed: 2026-05-02
---

# Phase 46 Plan 02: Cron + Crypto Part 1 Summary

**Fail-closed cron auth on both Xero cron-using routes (SEC-02), one-shot encryption-audit script for xero_connections (SEC-03), and APP_SECRET_KEY plumbing in CI ahead of plan 46-04's strict key-chain change (SEC-04 PART 1).**

## Status

**HANDED OFF MID-PLAN — AWAITING OPERATOR ACTION (Task 5).**

All autonomous tasks (1, 2, 3, 4, 6) are complete and committed. Task 5 is `checkpoint:human-action` — the operator must:

1. **Set `APP_SECRET_KEY` in Vercel** (Production + Preview scopes). **Critical:** if neither `APP_SECRET_KEY` nor `ENCRYPTION_KEY` is currently set, the system has been encrypting xero_connections tokens with the PBKDF2-derived `SUPABASE_SERVICE_KEY`. The value set MUST decrypt existing tokens — do NOT use a fresh random key without first extracting the PBKDF2 derivation, or every Xero sync will start failing with decryption errors.
2. **Run the SEC-03 verifier against prod:**
   ```bash
   SUPABASE_URL='<prod url>' \
   SUPABASE_SERVICE_ROLE_KEY='<prod service role key>' \
   npx tsx scripts/verify-xero-tokens-encrypted.ts > sec-03-report.json
   echo "exit code: $?"
   ```
   Expected: exit 0, `failures: 0` in the JSON.
3. **Smoke test the new fail-closed auth on a Vercel preview deploy:**
   ```bash
   curl -i https://<preview-url>/api/Xero/sync-all
   # expected: 401 Unauthorized
   curl -i -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/Xero/sync-all
   # expected: 200 OK
   ```
4. **Attach** the `sec-03-report.json` JSON to the PR description (operator/orchestrator step).
5. **Reply "approved"** with the JSON pasted in.

The orchestrator will surface this to the operator and resume.

## Performance

- **Duration:** ~30 min (autonomous portion)
- **Started:** 2026-05-02T07:25Z
- **Completed (autonomous portion):** 2026-05-02T07:35Z
- **Tasks:** 5 of 6 (Task 5 is the operator checkpoint)
- **Files modified/created:** 8

## Accomplishments

- **SEC-02:** Both Xero cron-using routes (`/api/Xero/sync-all`, `/api/Xero/refresh-tokens`) now use the canonical `!cronSecret || auth !== \`Bearer ${cronSecret}\`` guard. No more `NODE_ENV === 'production'` carve-out — fails closed in dev, preview, and prod.
- **SEC-02:** 4 regression tests added; the failing one (`CRON_SECRET unset → expect 401`) was RED at start (proving the vulnerability) and is GREEN after the fix. Tests 1, 2, 3 were already-green guards against header-tampering and bearer-mismatch.
- **SEC-03:** `scripts/verify-xero-tokens-encrypted.ts` re-uses `isEncrypted()` from `encryption.ts:115` (3-part base64 check, NOT just colon-presence — RESEARCH.md explicitly flagged this distinction). Includes inactive connections per RESEARCH.md SEC-03 risk mitigation. Emits JSON report; exits non-zero on any failure.
- **SEC-04 PART 1:** `APP_SECRET_KEY` placeholder (64 hex chars = 32 bytes for AES-256) added to `.github/workflows/supabase-preview.yml` build env block — primes CI for plan 46-04's strict `getEncryptionKey()` change.
- **SEC-04-MIGRATION-NOTE.md:** Documents the 2-PR split, the 5 preconditions plan 46-04 must meet before merging, the 7-day cooling rationale, and the worst-case rollback story.

## Task Commits

1. **Task 1 (RED):** `e2a7f7c` `test(46-02): add failing fail-closed cron auth regression tests (SEC-02)`
2. **Task 2 (GREEN):** `fad22fc` `feat(46-02): SEC-02 fail-closed cron auth on Xero sync-all + refresh-tokens`
3. **Task 3:** `23e4bb8` `feat(46-02): SEC-03 verifier script for xero_connections token encryption`
4. **Task 4:** `e84ab78` `chore(46-02): add APP_SECRET_KEY placeholder to CI build env (SEC-04 PART 1)`
5. **Task 6 (written before checkpoint to keep it complete pre-handoff):** `a786afa` `docs(46-02): SEC-04 2-PR migration plan + plan 46-04 preconditions`
6. **Task 5:** _operator-action checkpoint — see Status section above_

_Plan metadata commit (this SUMMARY) lands after operator confirmation completes Task 5._

## Files Created/Modified

- `src/__tests__/api/xero-sync-all-cron-auth.test.ts` (new) — 4 regression tests proving fail-closed semantics, including the headline test for "CRON_SECRET unset → 401"
- `src/app/api/Xero/sync-all/route.ts` (modified, GET handler ~lines 38-50) — replaced 3-conditional guard with `!cronSecret || ...`
- `src/app/api/Xero/refresh-tokens/route.ts` (modified, GET handler ~lines 136-150) — same pattern
- `.env.example` (modified) — documents `CRON_SECRET=local-dev-secret` for devs
- `scripts/verify-xero-tokens-encrypted.ts` (new) — SEC-03 verifier
- `.github/workflows/supabase-preview.yml` (modified) — `APP_SECRET_KEY` placeholder added to build job env
- `.planning/phases/46-server-side-hardening/SEC-04-MIGRATION-NOTE.md` (new) — 2-PR migration plan + preconditions for plan 46-04
- `.planning/phases/46-server-side-hardening/deferred-items.md` (new) — 2 items logged: (a) `refresh-tokens` batch-loop migration to Vercel Workflow (vercel-plugin recommendation, out of scope), (b) `plan-period-banner.test.tsx` pre-existing date assertion failure (created in Phase 42-03, unrelated to 46-02)

## Decisions Made

1. **Drop the NODE_ENV carve-out outright.** Original guard had `cronSecret && NODE_ENV === 'production' && auth !== ...`. The `!cronSecret || auth !== Bearer cronSecret` replacement has no environment-specific logic — devs MUST set `CRON_SECRET` locally. Documented in `.env.example`. Rationale: any environment-conditional logic in security guards is a future fail-open waiting to happen.
2. **Generalise the fix to `refresh-tokens` in the same plan.** RESEARCH.md plan-ready signal #5 flagged that `Xero/refresh-tokens` has the same fail-open shape. Splitting the fix across two plans would leave the second one fail-open in the meantime. One plan, two routes, one regression-test suite focused on `sync-all` (the more frequently-hit route).
3. **Write Task 6 (migration note) before Task 5 (operator checkpoint).** The migration note is the operator's reference for HOW to do Task 5. Putting it in their hands first means the handoff message can point at a complete document, not a "still being written" placeholder.

## Deviations from Plan

### Auto-fixed Issues

None at code level — the plan was followed exactly.

### Out-of-scope items deferred (logged to `deferred-items.md`)

**1. Vercel-plugin posttool validator suggested migrating `refresh-tokens`'s 100ms `setTimeout` throttle to Vercel Workflow.**
- **Found during:** Task 2 (editing the GET handler for SEC-02)
- **Decision:** Out of scope. The setTimeout is rate-limit throttling, not long polling. `maxDuration = 60s` is already set. Vercel Workflow migration would be an architectural change for a future plan.
- **Logged in:** `deferred-items.md`

**2. Pre-existing failing test `src/__tests__/goals/plan-period-banner.test.tsx:78`.**
- **Found during:** Final local CI gate (`npx vitest run`)
- **Confirmed pre-existing:** test file was created in Phase 42-03; this plan did not touch it. Likely a date/TZ off-by-one issue (asserts `2026-04-01`, gets `2026-03-31`).
- **Logged in:** `deferred-items.md`. Out of scope per execute-plan rules.

---

**Total code-level deviations:** 0 (plan executed exactly as written)
**Out-of-scope items deferred:** 2 (both logged for future plans)

## Issues Encountered

None during execution. The TDD RED step worked as designed: Test 4 (`CRON_SECRET unset → 401`) failed at start with `expected 200 to be 401` — exactly the SEC-02 fail-open shape. Tests 1-3 already passed because in the `NODE_ENV === 'production'` branch with `CRON_SECRET` set, the original guard does block unauthenticated requests; the bypass was specifically when `CRON_SECRET` was unset (Test 4) or when NODE_ENV was anything other than production. The fix collapses both into a single fail-closed condition.

## Local CI Status (at handoff)

- **vitest:** 632 passed, 1 pre-existing failure (`plan-period-banner.test.tsx`, unrelated), 19 skipped, 4 todo. All 4 SEC-02 regression tests pass.
- **tsc --noEmit:** clean
- **next lint:** clean (only pre-existing warnings in unrelated files)

## User Setup Required

**Yes — see Status section above for the 5-step operator action.** Specifically:

- `APP_SECRET_KEY` env var to be set in Vercel Production AND Preview scopes
- SEC-03 verifier (`scripts/verify-xero-tokens-encrypted.ts`) to be run against prod
- 401/200 curl smoke test on a Vercel preview deploy
- Operator pastes the SEC-03 JSON report into the resume message and types "approved"

## Next Phase Readiness

- **Plan 46-04 prerequisites being staged:** APP_SECRET_KEY plumbing + SEC-03 audit trail. Once Task 5 lands and the 7-day cooling period elapses (per `SEC-04-MIGRATION-NOTE.md`), plan 46-04 can ship the strict key-chain + plaintext-fallback removal.
- **Risk worth the verifier scrutinizing hardest:** the Test 4 import-flush logic. The test does `process.env = { ...ORIGINAL_ENV }; delete (process.env as any).CRON_SECRET; vi.resetModules(); await import(...)`. If route-handler module-init ever caches `process.env.CRON_SECRET` at import time (it doesn't today — reads happen inside `GET()`), the test would still pass even if the prod runtime read a stale cached value. Verifier should confirm the read is per-request, not per-module-init.

---
*Phase: 46-server-side-hardening*
*Status: 5 of 6 tasks complete; Task 5 awaiting operator action*
*Last commit at handoff: a786afa*
