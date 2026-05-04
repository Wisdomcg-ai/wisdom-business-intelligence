# Phase 46 — Plan Check

**Verdict:** PASS WITH NOTES
**Date:** 2026-05-04
**Plans checked:** 4 (46-01, 46-02, 46-03, 46-04)
**Methodology:** Goal-backward verification. Started from PHASE.md's 5 success criteria and 8 SEC requirements, traced each to a delivering task, then audited each plan for internal consistency, scope sanity, dependency correctness, and CONTEXT compliance (CONTEXT.md absent — discretion-based scrutiny only).

The plans are safe to execute as-written. The notes below are refinements, not blockers. The single ambiguity worth surfacing to the operator is in 46-04 Task 3 (Section "Plan-specific scrutiny → 46-04"); the planner self-flagged it and the recommendation here is to keep it as-is with one minor amendment.

---

## PHASE.md success-criterion coverage

| # | Success criterion | Delivered by | Status |
|---|-------------------|--------------|--------|
| 1 | `/api/migrate/*` returns 404 | 46-01 Task 1 (route delete) + Task 4 (regression test) | COVERED |
| 2 | `POST /api/Xero/sync-all` without `CRON_SECRET` returns 500/401 | 46-02 Task 1 (RED) + Task 2 (GREEN: `!cronSecret \|\| auth !==` pattern) — applied to `Xero/sync-all` AND `Xero/refresh-tokens` | COVERED (note: PHASE.md says 500, plans return 401 — the canonical fail-closed cron pattern in this repo is 401, matching `cron/daily-health-report:11-15`. Plans are correct; PHASE.md's "500" is imprecise) |
| 3 | SEC-03 verifier 100% pass + SEC-04 plaintext-fallback unit test | 46-02 Task 3 (verifier script) + Task 5 (operator runs against prod) → 46-04 Task 1 (RED unit test for fallback removal) + Task 4 (GREEN: removes all 3 fallbacks) | COVERED — and the plans correctly identify the THREE fallbacks RESEARCH.md flagged (PHASE.md only called out one) |
| 4 | Sentry.captureException count climbs from 2 to 28+; `console.error` drops ≥80% | 46-04 Task 2 (canary RED test) + Task 6 (admin batch) + Task 7 (8 remaining batches) + Task 8 (post-merge Sentry health check) | COVERED — plans use 408-line / 117-file baseline from RESEARCH.md (more accurate than PHASE.md's "28" service-role estimate) |
| 5 | Production boot fails fast on missing `APP_SECRET_KEY` or `SENTRY_DSN`; SEC-06 onboarding gate decided | 46-01 Tasks 2+4 (SEC-06 Option A: delete; preserves coach/super_admin bypass) + 46-04 Task 4 (encryption strict) + Task 5 (Sentry config fail-loud + CI workflow updated) + Task 8 (operator confirms) | COVERED |

All 8 SEC requirements (SEC-01..08) appear in at least one plan's `requirements:` frontmatter:
- SEC-01: 46-01
- SEC-02: 46-02
- SEC-03: 46-02
- SEC-04: 46-02 (PART 1) + 46-04 (PART 2)
- SEC-05: 46-03
- SEC-06: 46-01
- SEC-07: 46-04
- SEC-08: 46-04

Coverage is complete. The deletion of `src/lib/utils/logger.ts` is included as SEC-07 prep in 46-01.

---

## Cross-plan: dependency graph & wave ordering

| Plan | wave | depends_on | Validated against |
|------|------|------------|-------------------|
| 46-01 | 1 | [44-05] | Independent — pure deletions, no shared files with 46-02/03/04 |
| 46-02 | 2 | [44-05] | Independent of 46-01/46-03 (touches `Xero/sync-all`, `Xero/refresh-tokens`, `scripts/`, CI workflow) |
| 46-03 | 1 | [44-05] | Independent — single SQL migration, no shared files |
| 46-04 | 3 | [44-05, 46-02] | **Correctly gated on 46-02** — needs APP_SECRET_KEY env-var migration window + SEC-03 verifier prod-clean before encryption fallback can be removed |

**Wave declaration mismatch (cosmetic, not blocking):** 46-02 is declared `wave: 2` but its `depends_on` only references `44-05` (no Phase-46 dependency). By the wave rule (`wave = max(deps) + 1`), 46-02 should be `wave: 1` alongside 46-01 and 46-03. The wave 2 declaration appears to be the planner's intent to encode "humans should review/merge this AFTER 46-01" for cognitive-load reasons, not a true execution dependency. Either:
- Change 46-02 to `wave: 1` (technically correct), OR
- Keep `wave: 2` as a soft serialization signal and add a comment

**Recommendation:** Either change is fine. Keeping `wave: 2` is defensible because 46-02 is the highest-risk plan (touches encryption + cron auth) and serializing it after the trivial deletions reduces blast radius. **No action required**, but flag in 46-04 SUMMARY.

The critical dependency (46-04 → 46-02) is correctly declared. Cycles: none. Forward references: none. All plan numbers exist.

---

## Cross-plan: CI env-block coordination (RESEARCH.md flagged item)

`.github/workflows/supabase-preview.yml:113-133` build job env block was verified against the live file. Currently absent: `APP_SECRET_KEY`, `SENTRY_DSN`, `CRON_SECRET`.

| Var | Added by | When | Status |
|-----|----------|------|--------|
| `APP_SECRET_KEY` | 46-02 Task 4 | Same PR as SEC-04 PART 1 (workflow placeholder) | CORRECTLY SCHEDULED |
| `SENTRY_DSN` | 46-04 Task 5 (Edit 4) | Same PR as SEC-08 fail-loud | CORRECTLY SCHEDULED |
| `CRON_SECRET` | Not needed (RESEARCH.md confirmed module-init does not read it; only request-time access) | n/a | OK |

**No CI gap exists.** Both env-block updates ship in the same PR as the code change that requires them. Build will not go red mid-phase.

---

## Cross-plan: SEC-04 migration safety (highest-risk item)

The 2-PR split (46-02 PART 1 → 46-04 PART 2) is the right structure per RESEARCH.md's "highest-risk callout." Verified all gating mechanisms are in place:

1. **Operator must verify APP_SECRET_KEY value in Vercel before setting** — 46-02 Task 5 explicitly says "if `APP_SECRET_KEY` is unset, set it to the hex-encoded form of the PBKDF2-derived key from `SUPABASE_SERVICE_KEY` (re-run `getEncryptionKey()` logic offline to extract). If you're unsure, do NOT set a fresh random key — that would orphan all xero_connections tokens." **CORRECT.**
2. **SEC-04-MIGRATION-NOTE.md exists** — 46-02 Task 6 creates it with explicit preconditions for 46-04. **CORRECT.**
3. **46-04 Task 3 re-runs the SEC-03 verifier before fallback removal** — and adds a `verify-decrypt-roundtrip.ts` script (RESEARCH.md SEC-04 mitigation step 2). **CORRECT.**
4. **46-04's `depends_on` includes `46-02`** — **CORRECT.**
5. **46-04 Task 8 re-runs SEC-03 verifier POST-merge** — proves no decrypt regressions. **CORRECT.**

This is properly engineered. No blockers.

---

## Cross-plan: PHASE.md stale line refs

PHASE.md cites `Xero/sync-all/route.ts:573-580`. Verified live: file is **85 lines total**, current SEC-02 vulnerability is at lines **38-46**. 46-02's `<interfaces>` block calls this out explicitly ("the file is 86 lines, NOT 573 as PHASE.md states") and the action body references the correct lines. **No issue.**

---

## Cross-plan: out-of-scope hygiene

PHASE.md defers: CSRF middleware, distributed rate limiting, `auth-helpers→ssr` migration, persistent audit log table.

Verified no plan creeps into these:
- 46-01: pure deletion, no scope creep
- 46-02: scoped to Xero cron + crypto + verifier + workflow
- 46-03: single SQL migration
- 46-04: encryption + Sentry + sweep — does NOT touch CSRF, rate limiting, auth-helpers, or audit log

**Clean.**

---

## Plan-specific scrutiny

### 46-01: Deletions (SEC-01 + SEC-06 + delete logger.ts) — VERDICT: PASS

- 4 tasks, 5 files modified, single PR — well within scope budget
- Each task has files/action/verify/done/acceptance_criteria
- Pre-flight greps (defensive dead-ness checks) before deletion are a nice safety pattern
- Task 2 correctly preserves the coach/super_admin role bypass at middleware.ts:160-170 (the regression test in Task 4 explicitly asserts this)
- Task 4 regression test asserts both presence (preserved) and absence (deleted) — comprehensive
- Rollback story: trivial `git revert`

**One note:** SEC-06 chose Option A (delete) per RESEARCH.md recommendation. The plan flags this as operator-revisable. If Matt prefers Option B (re-enable behind `ONBOARDING_ENFORCED=true`), the plan needs revision — but this matches RESEARCH.md's default and the operator note in Task 2 makes the swap path explicit.

### 46-02: Cron + Crypto Part 1 (SEC-02 + SEC-03 + SEC-04 PART 1) — VERDICT: PASS

- 6 tasks, 6 files modified — at upper edge of "good" scope (warning territory at 4 tasks/plan, but the work is genuinely cohesive)
- TDD pattern: Task 1 (RED) → Task 2 (GREEN) — clean
- Task 4 correctly adds `APP_SECRET_KEY` placeholder (64 hex chars = 32 bytes — valid AES-256 length)
- Task 5 (operator checkpoint) is appropriately blocking and includes the critical PBKDF2-derived-key warning
- Task 6 produces SEC-04-MIGRATION-NOTE.md with explicit 46-04 preconditions
- The `!cronSecret ||` prefix correctly defends against the "Bearer undefined" sentinel attack RESEARCH.md flagged
- Generalises SEC-02 to `Xero/refresh-tokens` (RESEARCH.md plan-ready signal #5) — defence-in-depth

**Notes:**
1. RESEARCH.md plan-ready signal #5 lists 5 cron routes for the generalisation: `Xero/sync-all`, `Xero/refresh-tokens`, `cron/daily-health-report`, `cron/weekly-digest`, `cron/sync-all-xero`, `cron/reconciliation-watch`. 46-02 only fixes the first 2. RESEARCH.md notes the others ALREADY use the canonical fail-closed pattern (`cron/daily-health-report:13-15` is the reference), so they don't need fixing. This is correctly scoped.
2. The `.env.example` update suggested in Task 2 is conditional ("If `.env.example` exists, add `CRON_SECRET=local-dev-secret` line. If neither exists, skip."). Defensible.

### 46-03: SQL input validation (SEC-05) — VERDICT: PASS

- 3 tasks, 2 files modified — small, focused
- TDD pattern: Task 1 (RED, 6 tests) → Task 2 (GREEN migration) → Task 3 (operator applies)
- Task 1 includes pre-flight grep for any existing `system_roles` CHECK constraint (so the role list doesn't diverge from the canonical one) — correct
- Task 2 includes optional `REVOKE EXECUTE ... FROM "anon"` for `create_test_user` (RESEARCH.md SEC-05 risk mitigation) with operator opt-out — correct
- ERRCODE '22023' (`invalid_parameter_value`) is the correct PostgreSQL SQLSTATE for input validation
- Year range 2020..2100 is sensible (RESEARCH.md flagged year-9999 bombs)
- Rollback story: follow-up migration restoring original function bodies (timestamp would be `20260503000001_*`) — described but not pre-authored

**One note:** Task 3 mentions "supabase preview-branch CI hook (already exists per `.github/workflows/supabase-preview.yml`)" — the plan should verify the auto-apply behaviour rather than assume. The `<how-to-verify>` Step 1 says "verify it does" which is good defensive language.

### 46-04: Logging + Config + Crypto Part 2 (SEC-07 + SEC-08 + SEC-04 PART 2) — VERDICT: PASS WITH NOTES

This is the plan I scrutinized hardest because:
- It bundles 3 SEC items
- It includes the highest-risk encryption-key migration
- It performs a 117-file sweep
- The planner self-flagged a question about Task 3 structure

**8 tasks, ~117+ files modified, multiple per-batch commits expected.** This exceeds the "5 tasks/plan blocker" threshold from the scope sanity dimension. However:
- Tasks 6 and 7 are intentionally batched per-directory (RESEARCH.md plan-ready signal #4); Task 7 alone covers 8 batches
- Each batch is a separate commit — surgical revert capability per RESEARCH.md
- The plan can't be split further without breaking the cohesion of "now that Sentry is the sink, fail-loud on its DSN" (SEC-07 + SEC-08 logical pairing) and "now that prod has APP_SECRET_KEY, harden encryption" (SEC-04 PART 2)
- Risk is managed through 2 blocking checkpoints (Task 3, Task 8) and the per-batch commit boundary in Task 7

**Decision:** Accept the scope. The alternative (splitting into 46-04 / 46-05) would create a new dependency cycle and double the operator-checkpoint overhead.

**On the planner's self-flagged risk (Task 3 — embedded `verify-decrypt-roundtrip.ts` script):**

The script body is embedded inside the operator checkpoint instructions rather than authored as a discrete TDD-style task. Reading Task 3 carefully:
- The script is ~30 lines and primarily orchestrates `decrypt(encrypt(...))` on a single live row
- It has no test coverage of its own (it's an integration script, not a unit)
- Splitting into "Task 3a: author script (auto), Task 3b: operator runs script (checkpoint)" would add overhead without clear value — the script is small enough that "operator copy-pastes from instruction block, runs against prod" is workable

**Recommendation: keep the embedded approach BUT make one amendment:**
- Add a line in Task 3's `<files>` declaration: `scripts/verify-decrypt-roundtrip.ts` (currently the file is mentioned in the body but not in the frontmatter `files_modified` either — it IS in the frontmatter `files_modified` block at line 18; good)
- Add an explicit "before resume-signal, commit the script to the branch so it's version-controlled" instruction in `<how-to-verify>` Step 3

The script is critical infrastructure; it should not exist only inside the checkpoint instructions. Once committed, Task 3 functions as both author + checkpoint for the script.

**Other notes for 46-04:**

1. **Task 5 Edit 3 (createHmacSignature)** correctly defers the decision to operator with explicit framing — but the decision needs to be MADE before merge, not just "documented in PR description." Recommend the operator confirm in Task 8 resume signal whether `createHmacSignature` was hardened or deferred.

2. **Task 7 baseline counts** assume 408 console.error / 18 Sentry.captureException from RESEARCH.md (dated 2026-05-02). RESEARCH.md itself flags "re-verify counts before SEC-07 sweep starts if more than a week has passed." Today is 2026-05-04 — within the 7-day window, so the baselines are usable. If 46-04 actually executes more than a week from now, the operator should re-baseline at the start of Task 6.

3. **Task 7 verify line** has a duplicated `<automated>` opener (lines 743-744) — minor formatting bug, doesn't affect execution. Fix:
   ```
   <verify>
     <automated>BEFORE=408; AFTER=$(grep -rn 'console\.error' src/app/api/ | wc -l); ...</automated>
   </verify>
   ```
   (The closing `</automated>` on line 744 is correct; the duplicated opening on line 743 should be deleted.)

4. **Sentry mock pattern** is correctly per-test-file (RESEARCH.md cross-cutting note about not adding global mock to `setup.ts`). Tasks 6 and 7 both reinforce this — no risk of breaking `forecast-read-service.test.ts`'s call-shape assertions.

5. **Rollback story** for 46-04 is the most complex. PR revert is fine for code; the `APP_SECRET_KEY` env var must NOT be rotated in the same window per RESEARCH.md SEC-04 callout. Task 8 Step 6 explicitly defers DSN rotation to a follow-up PR — correct.

---

## Atomicity per plan

| Plan | Single-PR atomic? | Notes |
|------|-------------------|-------|
| 46-01 | YES | Pure deletion. No multi-step sequencing. |
| 46-02 | YES | Code + verifier script + CI workflow + migration note ship together. The operator checkpoint (Task 5) does not require a second PR; it's deploy-time setup. |
| 46-03 | YES | Single migration. Operator applies in Task 3 — no code change required. |
| 46-04 | YES (with discipline) | 8 batches in Task 7 should commit individually inside one PR. The PR is large but cohesive. |

No plan accidentally requires multi-PR sequencing internally. The 2-PR split (46-02 PART 1 → 46-04 PART 2) is plan-level, not internal-to-a-plan.

---

## Recommendations for the executor

If status is PASS WITH NOTES, the executor can proceed but should apply these refinements before merging the affected plans:

1. **46-02:** Consider declaring `wave: 1` for accuracy (not blocking — the wave 2 declaration is interpretable as a soft serialization signal).

2. **46-04 Task 3:** Amend `<how-to-verify>` Step 3 to instruct the operator to commit `scripts/verify-decrypt-roundtrip.ts` to the branch BEFORE typing the resume signal. The script is valuable infrastructure; it should be version-controlled, not just exist in checkpoint instructions.

3. **46-04 Task 7:** Fix the duplicated `<automated>` opener in the `<verify>` block (cosmetic; doesn't affect execution but trips XML parsers).

4. **46-04 Task 8 resume signal:** Add an explicit "createHmacSignature change: tightened OR deferred (state which)" line to capture the operator's decision from Task 5 Edit 3.

5. **46-04 Task 6 baseline:** If executing 46-04 more than 7 days after RESEARCH.md (2026-05-02), re-baseline `console.error` and `Sentry.captureException` counts at the start of the sweep. RESEARCH.md self-flagged this validity window.

6. **46-03 Task 3:** Verify the Supabase preview-branch CI hook auto-applies migrations BEFORE typing the resume signal. The plan correctly says "verify it does" but Operator should not assume.

None of these are blockers. All can be applied during execution without round-tripping back to the planner.

---

## Recommended execution order

Plans can run concurrently per their wave declarations:

**Wave 1 (parallel):** 46-01 (deletions) + 46-03 (SQL migration). These are independent, low-risk, can ship same day.

**Wave 2 (after 46-01/46-03 merge):** 46-02 (cron + crypto PART 1). Includes the APP_SECRET_KEY Vercel env migration + SEC-03 verifier run — operator pause point.

**Wave 3 (≥7 days after 46-02 merges):** 46-04 (logging + config + crypto PART 2). Gated on SEC-04-MIGRATION-NOTE.md preconditions per Task 3 checkpoint.

The 7-day gap between 46-02 and 46-04 is intentional (RESEARCH.md SEC-04 mitigation) and gives the env-var migration window time to surface any prod issues before the encryption fallback is removed.
