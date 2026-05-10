---
phase: 46-server-side-hardening
plan: 04
subsystem: infra
tags: [sentry, encryption, observability, security, aes-256-gcm, sec-04, sec-07, sec-08]

# Dependency graph
requires:
  - phase: 44-test-gate-and-ci-hardening
    provides: CI build env block + vitest gate
  - phase: 46-server-side-hardening (plan 46-02)
    provides: APP_SECRET_KEY env wiring, SEC-03 verifier, SEC-04-MIGRATION-NOTE.md preconditions
provides:
  - Hardened decrypt() with no plaintext fallbacks (throws on malformed input)
  - getEncryptionKey() requires APP_SECRET_KEY or ENCRYPTION_KEY (no SUPABASE_SERVICE_KEY fallback)
  - createHmacSignature() tightened (drops SUPABASE_SERVICE_KEY; OAUTH_STATE_SECRET preserved)
  - Fail-loud Sentry config (sentry.{client,server,edge}.config.ts) — boot fails if DSN unset in production
  - SENTRY_DSN placeholder in CI build env
  - Sentry-first logging across ~120 API route files (console.error → Sentry.captureException)
affects:
  - 47-validation-zod (SEC-07's Sentry adoption is precondition for VALID-01 observe-mode logs)
  - 48+ (any future plan touching encryption or Xero token decryption)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentry.captureException with { tags: { route: '<slug>' }, extra: { context, ... } } as any"
    - "Sentry.captureMessage(`<msg>`, 'warning' | 'error' as any) for non-error log paths"
    - "if (process.env.NODE_ENV !== 'production') { console.log(...) } for dev-trace logs"
    - "Per-test-file vi.mock('@sentry/nextjs', ...) — never global setup mock"

key-files:
  created:
    - src/__tests__/utils/encryption.test.ts
    - src/__tests__/api/sentry-capture-wiring.test.ts
  modified:
    - src/lib/utils/encryption.ts
    - sentry.client.config.ts
    - sentry.server.config.ts
    - sentry.edge.config.ts
    - .github/workflows/supabase-preview.yml
    - "src/app/api/admin/**/route.ts (7 files)"
    - "src/app/api/Xero/**/route.ts (17 files; employees revert per Phase 53-05)"
    - "src/app/api/forecast/**/route.ts (14 files)"
    - "src/app/api/forecasts/**/route.ts (6 files)"
    - "src/app/api/cfo/**/route.ts (3 files)"
    - "src/app/api/cron/**/route.ts (2 files)"
    - "src/app/api/team/**/route.ts (3 files)"
    - "src/app/api/coach/**/route.ts (4 files)"
    - "src/app/api/<remainder>/route.ts (~57 files)"
    - src/__tests__/api/pl-summary-lookup-error.test.ts (added Sentry mock)

key-decisions:
  - "createHmacSignature: tightened now (drop SUPABASE_SERVICE_KEY, keep OAUTH_STATE_SECRET) — operator must confirm OAUTH_STATE_SECRET in Vercel before merge."
  - "Canary route: src/app/api/coach/stats/route.ts — clean try/catch with single console.error in catch path. Test mocks supabase.auth.getUser to throw (returning {error} would 401 and not exercise catch)."
  - "Sweep strategy: per-batch commits (9 commits, surgical rollback). Per-file Sentry mocks only — no global setup mock (RESEARCH.md SEC-07 cross-cutting)."
  - "Phase 53-05 invariant: Xero/employees/route.ts MUST NOT import @sentry/nextjs — deactivation Sentry capture is centralized in token-manager.ts. SEC-07 sweep was reverted on this single file; console.* wrapped in NODE_ENV guards instead."
  - "Stopping point: branch pushed; do NOT open PR. Operator opens PR with SEC-03 pre-merge JSON in description."

patterns-established:
  - "Sentry-first logging: console.error / console.warn -> Sentry.captureException / captureMessage with tags+extra context"
  - "Dev-trace gating: console.log only inside if (process.env.NODE_ENV !== 'production')"
  - "Per-file Sentry mocks: each test file importing a swept route adds its own vi.mock"

requirements-completed:
  - SEC-04
  - SEC-07
  - SEC-08

# Metrics
duration: ~135min
completed: 2026-05-11
---

# Phase 46 Plan 46-04: Server-Side Hardening Summary

**SEC-04 PART 2 + SEC-07 + SEC-08 shipped: hardened encryption (no plaintext fallbacks, no SUPABASE_SERVICE_KEY derivation), fail-loud Sentry config (no hardcoded DSN), and Sentry-first logging swept across ~120 API route files (console.error count dropped 97% from baseline).**

## Performance

- **Duration:** ~135 min
- **Started:** 2026-05-11T04:25:39Z
- **Completed:** 2026-05-11T06:21:00Z
- **Tasks executed:** 6 of 8 (Task 3 done by operator pre-execution; Task 8 is post-merge operator)
- **Commits:** 15 (including the employees-route revert mop-up)
- **Files modified:** ~120 (route files) + 5 (encryption + Sentry config + CI) + 2 (regression tests) + 1 (existing test mock add)

## Accomplishments

- **SEC-04 PART 2 complete.** All 3 silent fallbacks removed from `decrypt()`. `getEncryptionKey()` now hard-requires `APP_SECRET_KEY` or `ENCRYPTION_KEY`. `createHmacSignature()` tightened (operator must confirm `OAUTH_STATE_SECRET` set in Vercel before merge). 7/7 regression tests RED → GREEN.
- **SEC-08 complete.** Hardcoded fallback DSN literal removed from all 3 Sentry config files. Module-load throw added when `NODE_ENV === 'production' && !DSN`. `SENTRY_DSN` placeholder added to CI build env block.
- **SEC-07 complete.** ~120 route files swept; console.error count in `src/app/api/` dropped from baseline **399 → 5** (≥98% drop, exceeds PHASE.md ≥80% target). Sentry.captureException grew from baseline **21 → 393** (per-route tagged captures with context). The 5 residual `console.error` calls are all inside `NODE_ENV !== 'production'` guards in `Xero/employees/route.ts` (Phase 53-05 invariant — see deviations).
- **Sentry wiring canary** (`src/__tests__/api/sentry-capture-wiring.test.ts`) flipped RED → GREEN after the api/coach batch.

## BEFORE / AFTER counts

| Metric | BEFORE (re-baselined 2026-05-11) | AFTER | Delta |
| ------ | --- | --- | --- |
| `console.error` lines in `src/app/api/` | 399 | 5 | **−98.7%** (target ≥80%) |
| `console.error` files in `src/app/api/` | 115 | 1 | −99.1% |
| `console.warn` lines in `src/app/api/` | ~20 | 6 | (residual all guarded) |
| `Sentry.captureException` lines in `src/` | 21 | 393 | +372 |
| `Sentry.captureException` files in `src/` | 11 | 124 | +113 |
| `Sentry.captureMessage` lines in `src/` | 0 (this plan introduced) | 49 | +49 |

**RESEARCH.md baseline of 408 lines / 117 files (dated 2026-05-02) drifted slightly by execution time (399/115 on 2026-05-11) — re-baselined per plan instructions.**

The 5 residual `console.error` and 6 residual `console.warn` lines are 100% inside `if (process.env.NODE_ENV !== 'production')` guards or in scripted dev paths.

## Task Commits

In execution order:

1. **Task 1: RED encryption strictness tests** — `b48d899d` (test) — 4 of 7 tests fail RED before encryption hardening, exactly as expected.
2. **Task 2: RED Sentry wiring canary** — `f23d23e2` (test) — coach/stats canary fails RED before SEC-07 sweep.
3. **Task 3: Operator preconditions** — done by Matt Malouf 2026-05-10 (skipped per executor scope).
4. **Task 4: GREEN encryption.ts hardening** — `a063c818` (feat) — 7/7 encryption tests GREEN; createHmacSignature tightened.
5. **Task 5: SEC-08 Sentry config + CI** — `41c5b458` (feat) — hardcoded DSN removed; SENTRY_DSN placeholder added.
6. **Task 6: SEC-07 batch 1 (api/admin)** — `ddee8abf` (feat) — 7 admin routes swept (~80 console.* → Sentry/devLog).
7. **Task 7: SEC-07 batches 2–9:**
   - `589537be` — batch 2 (api/Xero, 17 files, 130 swaps + 31 manual fixups)
   - `329c0c0c` — batch 3 (api/forecast, 14 files, 36 swaps)
   - `1dedeecf` — batch 4 (api/forecasts, 6 files, 20 swaps)
   - `5018146f` — batch 5 (api/cfo, 3 files, 9 swaps)
   - `1eb59136` — batch 6 (api/cron, 2 files, 2 swaps)
   - `000543a3` — batch 7 (api/team, 3 files, 19 swaps)
   - `57d99168` — batch 8 (api/coach, 4 files, 13 swaps; canary flipped GREEN)
   - `4a73f55f` — batch 9 (~57 files, 210 swaps + 14 manual fixups)
   - `f2b063d7` — batch 9 mop-up (2 files missed by sweep)
8. **Phase 53-05 invariant fix** — `480a7476` (fix) — reverted Sentry sweep on `Xero/employees/route.ts`; wrapped console.* in NODE_ENV guards instead.

**Plan metadata commit:** _written by orchestrator after this SUMMARY merges._

## Files Created/Modified

### Created (regression tests)
- `src/__tests__/utils/encryption.test.ts` — 7 tests covering all 3 decrypt fallbacks + getEncryptionKey strictness + round-trip
- `src/__tests__/api/sentry-capture-wiring.test.ts` — Canary test asserting `coach/stats` calls `Sentry.captureException` on catch path

### Modified (security-critical)
- `src/lib/utils/encryption.ts` — Removed 3 silent fallbacks from decrypt(); removed SUPABASE_SERVICE_KEY from getEncryptionKey() and createHmacSignature() chains
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — Removed hardcoded DSN literal; added module-load throw when production AND DSN unset
- `.github/workflows/supabase-preview.yml` — Added `SENTRY_DSN: 'https://example@sentry.io/0'` placeholder to build env block

### Modified (SEC-07 sweep)
- 9 batches across `src/app/api/` per the plan's directory list. See per-batch commit body for file lists.
- `src/__tests__/api/pl-summary-lookup-error.test.ts` — Added per-file `vi.mock('@sentry/nextjs', ...)` since the swept `Xero/pl-summary/route.ts` it imports now uses Sentry.

## Decisions Made

1. **createHmacSignature tightening (operator decision per prompt):** Tightened immediately. Dropped `SUPABASE_SERVICE_KEY` from chain. Kept `OAUTH_STATE_SECRET` (separate rotation cadence). **Operator must confirm `OAUTH_STATE_SECRET` is set in Vercel Production before merge** — otherwise OAuth state HMACs in flight at deploy time fail to verify.

2. **Canary route:** `src/app/api/coach/stats/route.ts` — has a clean `try/catch` with a single `console.error` in the catch. To trigger the catch deterministically, the test mocks `supabase.auth.getUser()` to **throw** (the `{ error }` return path returns 401 without exercising catch — it's the catch that SEC-07 wires to Sentry).

3. **Per-batch commits:** 9 commits (one per batch) for surgical rollback per RESEARCH.md SEC-07 recommendation. Plus `480a7476` revert and `f2b063d7` mop-up = 11 swap commits in total.

4. **Phase 53-05 invariant override:** `Xero/employees/route.ts` is the only swept file that does NOT import `@sentry/nextjs`. Phase 53-05's `phase-53-token-manager-sentry.test.ts` Test 6 explicitly forbids it ("deactivation Sentry capture is centralized in token-manager.ts; do NOT add a second capture here"). On batch 2 the sweep injected Sentry calls; the cross-phase test caught it; reverted and used `NODE_ENV !== 'production'` guards on all console.* calls instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Phase 53-05 cross-phase invariant on Xero/employees/route.ts**
- **Found during:** Full vitest run after batch 9
- **Issue:** SEC-07 sweep added `import * as Sentry from '@sentry/nextjs'` to `src/app/api/Xero/employees/route.ts`. Phase 53-05's `phase-53-token-manager-sentry.test.ts` Test 6 asserts that file MUST NOT import Sentry — the deactivation capture is centralized in `token-manager.ts`, and a second capture in this route would create double-report noise.
- **Fix:** Reverted `Xero/employees/route.ts` to its pre-sweep contents. Then ran a custom transform that wraps ALL `console.error` / `console.warn` / `console.log` calls in `if (process.env.NODE_ENV !== 'production')` guards (no Sentry import).
- **Files modified:** `src/app/api/Xero/employees/route.ts`
- **Verification:** `phase-53-token-manager-sentry.test.ts` Test 6 + `employees-route.test.ts` Test I both pass.
- **Committed in:** `480a7476`

**2. [Rule 3 — Blocking] Multi-line import injection bug in sweep script**
- **Found during:** First post-batch-9 typecheck
- **Issue:** The sweep script's regex `^((?:import .+\n)+)` matched a multi-line `import { ... }` block at its first line, then injected `import * as Sentry from '@sentry/nextjs'` between the opening brace and the destructured names — breaking parsing in 9 files (ai-assist, ai/forecast-{assistant,insights}, email/{send,test}, monthly-report/generate, processes/ai-mapper, sessions/[id]/analyze-transcript, wizard/chat).
- **Fix:** Manually moved the `import * as Sentry` line above each broken `import { ... } from '...'` block. Also fixed 4 files where my Edits added Sentry calls but the file originally started with a docblock (no imports for the regex to match): added the Sentry import after the first `import` line.
- **Files modified:** 9 ai/email/multi-line-import files + 4 docblock-first files (consolidation/fx-rates/[id], monthly-report/{consolidated,consolidated-bs,consolidated-cashflow})
- **Verification:** `npx tsc --noEmit` clean for all plan files.
- **Committed in:** rolled into `4a73f55f` (batch 9)

**3. [Rule 3 — Blocking] devLog perl regex created infinite recursion**
- **Found during:** While sweeping `admin/demo-client/route.ts`
- **Issue:** Used `perl -i -pe 's/\bconsole\.log\(/devLog(/g'` to bulk-replace 22 noisy seeder log calls. Regex matched `console.log` inside the `devLog` helper itself, replacing it with `devLog(...args)` — infinite recursion at runtime.
- **Fix:** Changed `devLog` body to use `globalThis.console.log(...args)` so the regex doesn't match.
- **Files modified:** `src/app/api/admin/demo-client/route.ts`
- **Committed in:** rolled into `ddee8abf` (admin batch)

**4. [Rule 3 — Blocking] Double NODE_ENV wrap in clients/send-invitation/route.ts**
- **Found during:** Post-batch-9 typecheck
- **Issue:** I manually added a NODE_ENV wrap to the `Email sent successfully` log; the wrap script then re-wrapped it, creating a TS error ("'development' | 'test' has no overlap with 'production'" — comparing a NODE_ENV check inside another).
- **Fix:** Collapsed the double wrap.
- **Committed in:** rolled into `4a73f55f` (batch 9)

**5. [Rule 3 — Out of scope] `src/__tests__/goals/plan-period-banner.test.tsx` failure (pre-existing)**
- **Found during:** Full vitest run
- **Issue:** Test asserts a date input renders `2026-04-01` but receives `2026-03-31` — a UTC/timezone bug in the goals UI's date initialization, completely unrelated to SEC-07.
- **Action:** Verified pre-existing on the branch tip via `git stash` + rerun. Documented as out-of-scope per scope-boundary rule. Not fixed.
- **Logged to:** `.planning/phases/46-server-side-hardening/deferred-items.md` (added entry below).

---

**Total deviations:** 5 (4 auto-fixed, 1 documented as pre-existing/out-of-scope). All auto-fixes were necessary for correctness; no scope creep beyond the SEC-04/SEC-07/SEC-08 trio.

**Impact on plan:** All deviations preserve plan intent. The Phase 53-05 invariant fix is the most significant — it converted ONE file's sweep from Sentry-based to NODE_ENV-guard-based, but the file's `console.error` calls are now still gated out of production logs (the SEC-07 spirit), just via a different mechanism that respects the cross-phase invariant.

## Validator hook noise (informational, no action)

During execution, the Vercel-plugin's `posttooluse-validate` hook surfaced repeated false-positive recommendations on `route.ts` files:

- **`searchParams is async in Next.js 16` (~50 occurrences)** — Pattern-matched on `searchParams` identifier without checking that route handlers use the synchronous `URL.searchParams` Web API (via `new URL(request.url).searchParams.get(...)`), not the async page-prop. Route handlers do NOT have an async `searchParams` prop — this would only apply to `page.tsx` / `layout.tsx`. Disregarded as systematic false-positive.
- **`AI SDK / AI Gateway / Workflow` (~10 occurrences)** — Suggested architectural rewrites of OpenAI/Anthropic SDK calls and long-running cron handlers. These are Rule 4 architectural changes, completely out of scope for SEC-07's logging-only sweep. Disregarded.
- **`vercel-storage` (~3 occurrences)** — Triggered on `@supabase/supabase-js` import. Project uses Supabase for its primary DB, not Vercel Storage. Disregarded.

None of these affect plan correctness; they are documented here so reviewers don't need to chase the same dismissals.

## Issues Encountered

- The sweep script's auto-detection of multi-line `import { ... }` blocks didn't account for the destructured-import shape; manually fixed in 9 files (deviation #2 above).
- 80 `console.error` / `console.warn` calls had multi-arg signatures (e.g. `console.error('label:', err, extraData)`) that the simple regex couldn't transform; each handled manually by case.
- The plan's expected baseline (RESEARCH.md from 2026-05-02) was 408/117; re-baselined to 399/115 at execution time. Drift is expected for any month-old baseline.

## User Setup Required

**Operator MUST confirm BEFORE merging this PR:**

1. **`OAUTH_STATE_SECRET`** is set in Vercel Production scope. (createHmacSignature() tightening removed `SUPABASE_SERVICE_KEY` fallback — if `OAUTH_STATE_SECRET` is not set, in-flight OAuth state HMACs at deploy time will fail to verify.)
2. **`SENTRY_DSN`** is set in Vercel Production scope. (sentry.server.config.ts and sentry.edge.config.ts now throw at module load if production+unset → boot failure.)
3. **`NEXT_PUBLIC_SENTRY_DSN`** is set in Vercel Production scope. (sentry.client.config.ts same throw pattern.)
4. **`APP_SECRET_KEY`** is set in Vercel Production AND Preview. (Already done per Task 3 operator confirmation 2026-05-10. encryption.ts now hard-fails without it.)

5. **DO NOT rotate the previously-committed Sentry DSN (`5f617384407d5579ae786ca49693fb1f`) in this PR.** RESEARCH.md SEC-08 rollback callout — rotation is a separate follow-up.
6. **PR description must include the SEC-03 verifier's pre-merge JSON** (`scripts/verify-xero-tokens-encrypted.ts` output, `failures: 0`). The operator captures this; this executor did not generate it.

## Open Items for Task 8 (post-merge operator checkpoint)

These are restated for the operator's reference. None of them are this executor's responsibility:

1. Confirm Vercel env vars in Production: `vercel env ls | grep -E "APP_SECRET_KEY|SENTRY_DSN|NEXT_PUBLIC_SENTRY_DSN|OAUTH_STATE_SECRET"` — expect ≥4 entries.
2. Smoke test prod after merge:
   - `curl -i https://wisdombi.ai/api/Xero/sync-all` → expect 401 (SEC-02 regression check)
   - `curl -i -H "Authorization: Bearer $CRON_SECRET" https://wisdombi.ai/api/Xero/sync-all` → expect 200
   - `curl -i https://wisdombi.ai/api/migrate` → expect 404 (SEC-01 regression check)
3. Re-run SEC-03 verifier post-merge: `npx tsx scripts/verify-xero-tokens-encrypted.ts > sec-03-report-post-46-04.json` → expect `"failures": 0`.
4. Sentry health check: confirm Sentry Issues "Most Captured" view shows event count climbing from baseline 2 toward 28+ within 24-48h.
5. Watch `vercel logs --prod` for 24-48h for boot failures from new module-load throws.
6. **Do NOT rotate the Sentry DSN in this PR** — separate follow-up.

## Self-Check: PASSED

**Created files:**
- `src/__tests__/utils/encryption.test.ts` — FOUND
- `src/__tests__/api/sentry-capture-wiring.test.ts` — FOUND
- `.planning/phases/46-server-side-hardening/46-04-SUMMARY.md` — FOUND (this file)

**Commits (all 15 swap/test commits exist on `feat/46-04-server-side-hardening`):**
- `b48d899d` test(46-04): RED encryption — FOUND
- `f23d23e2` test(46-04): RED Sentry canary — FOUND
- `a063c818` feat(46-04): encryption hardening — FOUND
- `41c5b458` feat(46-04): Sentry config + CI — FOUND
- `ddee8abf` batch 1 admin — FOUND
- `589537be` batch 2 Xero — FOUND
- `329c0c0c` batch 3 forecast — FOUND
- `1dedeecf` batch 4 forecasts — FOUND
- `5018146f` batch 5 cfo — FOUND
- `1eb59136` batch 6 cron — FOUND
- `000543a3` batch 7 team — FOUND
- `57d99168` batch 8 coach — FOUND
- `4a73f55f` batch 9 remainder — FOUND
- `480a7476` fix Phase 53-05 invariant — FOUND
- `f2b063d7` batch 9 mop-up — FOUND

**Test gates:**
- 7/7 encryption regression tests GREEN
- 1/1 Sentry wiring canary GREEN (RED → GREEN flip confirmed after batch 8)
- 0 typecheck errors in plan-modified files (pre-existing errors in untracked diag scripts and Finder-duplicate `2.tsx`/`2.ts` files are out-of-scope)
- 1151 / 1153 vitest tests passing; 1 pre-existing failure (plan-period-banner — unrelated, documented in deferred-items)

## Next Phase Readiness

- Encryption + Sentry-first observability foundation is in place. Phase 47 (Zod validation) can rely on `Sentry.captureException` for VALID-01 observe-mode logs.
- Phase 53-05 invariant preserved; Xero token-manager Sentry centralization continues to work.
- Operator must complete the 6 pre-merge confirmations above before opening the PR.

---
*Phase: 46-server-side-hardening*
*Plan: 04*
*Completed: 2026-05-11*
