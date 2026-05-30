---
phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
plan: 07
subsystem: iict-onboarding
status: DEFERRED
tags: [deferred, skipped, iict, onboarding, profile-completion, consolidation-mode, subscription-budgets, fy27-dedupe, monthly-report-snapshots, coach-session-required, script-preserved]

# Dependency graph
requires:
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 01
    provides: Pre-write rollback snapshot capturing business_profiles + businesses + subscription_budgets + financial_forecasts + monthly_report_snapshots baseline — would have been the restore point if 70-07 had executed (unused)
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 02
    provides: Cross-business active-forecast dedupe (verified clean against IICT; D1 step in 70-07 is therefore a no-op when later reinvoked — confirmed by the executor at build time, see D3 below)
provides:
  - scripts/70-07-B3-iict-onboarding-completion.mjs (727 LOC, committed 3cb30e71 on 2026-05-31; preserved unused for the future IICT-focused coach session)
  - A documented decision trail explaining WHY IICT production data was left untouched in Phase 70 — so the next coach reviewing IICT does not re-litigate the prerequisites under time pressure
  - Three build-time deviations (D1/D2/D3) recorded below — these are improvements to the plan-as-written that the executor surfaced + corrected when authoring the script, and they remain useful for whoever drives the future coach session
affects: [70-08-audit-rerun, 70-09-cron-heartbeat, future-iict-coach-session-onboarding-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plan-defer pattern (same shape as 70-06): when the interactive checkpoint requires business-specific inputs the operator does not have at hand AND a focused human-led session is a materially better setting for collecting them, the correct action is to DEFER (not force partial execution). The artifact script remains committed but uninvoked."
    - "Build-time deviation pattern: when the executor authors a script (Task 1) and discovers the plan spec disagrees with live schema/constraints/state, the deviation is recorded in the SUMMARY even if the plan is then deferred — because the fix is real and informs the future coach session."

key-files:
  created:
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-07-SUMMARY.md (this file)
  modified:
    - .planning/STATE.md (advance Current Plan 7 → 8; operational note recording deferral rationale)
    - .planning/ROADMAP.md (mark 70-07 as deferred; update plan-progress row)
  preserved-uninvoked:
    - scripts/70-07-B3-iict-onboarding-completion.mjs (committed 3cb30e71; 727 LOC; remains usable for the future coach session — same 5-step `--step=N` / `--apply` interface; D1/D2/D3 fixes already baked in)

key-decisions:
  - "DEFER DECISION (Matt 2026-05-31): the entire 70-07 plan is intentionally deferred. Steps 1 + 3 require IICT business data Matt does not have at hand right now (industry classification, FY26 annual revenue, gross profit, net profit, the canonical list of IICT subscriptions). Forcing those entries today risks shipping wrong numbers into a CFO-level report. Same shape as 70-06 (JDS): better to handle in a single focused coach session with the data prepared."
  - "ZERO PRODUCTION MUTATION: this plan ran the executor but performed no SQL writes, no API calls, no Xero reads, and no row writes against IICT. The only artifacts are this SUMMARY, the STATE/ROADMAP updates, and a single deferral commit. The 727-LOC script from 3cb30e71 stays exactly as committed."
  - "ATOMICITY OVER PARTIAL PROGRESS: Steps 2 (consolidation_budget_mode flip) + 4 (FY27 dedupe — already a no-op per D3) are technically executable today without further input. They were deliberately bundled into the defer because shipping IICT half-onboarded (mode flipped, dedupe confirmed, but profile/subs/snapshots empty) presents a false-positive 'IICT looks onboarded' signal to the 70-08 audit re-run while still being unreportable. Same atomicity argument as 70-06: do all five steps in one coherent coach session, or do none."
  - "WHY A COACH SESSION (NOT MORE PROMPTING): the plan's Step 1 (profile fields) and Step 3 (subscription list) are not list-lookup work — they are 'sit down with IICT's books and decide the right entries' work. Industry classification has ~6 plausible answers (IT Consulting / IT Services / Software / Professional Services / Management Consulting / Computer Systems Design). Annual revenue needs to be either trailing-12-months from Xero P&L (which requires a live Xero token — gated by Phase 69 status) or the operator's working number for FY27 planning. Either way it is decision work, not data-entry work."
  - "IICT IDs LOCKED (verified in 70-CONTEXT.md and re-asserted in the script source): businesses.id = fbc6dffd-677d-47ec-8277-7157982938e7; business_profiles.id = 6c0dfadb-4229-4fc2-89eb-ec064d24511b. The future coach session must re-verify these before invoking --apply."
  - "DOWNSTREAM IMPACT IDENTICAL TO 70-06: 70-08 (audit re-run) will continue to flag IICT (industry/revenue/profit NULL, consolidation_budget_mode=single, 0 subscription_budgets, 0 monthly_report_snapshots). The 70-08 SUMMARY should document that flag as 'intentionally deferred per 70-07-SUMMARY' rather than treating it as a regression. 70-09 (cron heartbeat) is unaffected — it does not depend on IICT being onboarded."

deviations-surfaced-at-build-time:
  - id: D1
    where: "scripts/70-07-B3-iict-onboarding-completion.mjs Step 2 (consolidation_budget_mode flip)"
    plan-said: "UPDATE businesses SET consolidation_budget_mode = 'consolidated'"
    reality: "The `businesses.consolidation_budget_mode` CHECK constraint allows only the literal values 'single' | 'per_tenant'. The value 'consolidated' is REJECTED by the DB and would have caused the --apply UPDATE to fail with a constraint-violation error at runtime."
    fix-applied: "Script Step 2 writes 'per_tenant' (not 'consolidated'). Comment block above the SQL explicitly notes the constraint and why 'per_tenant' is the correct multi-tenant value (it tells the consolidation engine to compute per-tenant budgets and consolidate at render time, which is what IICT's 3-tenant NZ+NZ+HK structure needs)."
    impact-on-defer: "Useful for the future coach session — they will not hit a CHECK violation when they run --step=2 --apply. The fix is already in 3cb30e71."
    sentinel: "grep -n \"per_tenant\" scripts/70-07-B3-iict-onboarding-completion.mjs"
  - id: D2
    where: "scripts/70-07-B3-iict-onboarding-completion.mjs Step 5 (monthly_report_snapshots baseline)"
    plan-said: "The script's --apply DOES NOT write directly to monthly_report_snapshots. Instead, for each target month, print the EXACT curl command Matt needs to run."
    reality: "The monthly-report generation flow is browser-session-authenticated (Supabase auth cookie + Next.js route handlers) — no service-role bypass exists, and writing a session-bearing curl command from a node script is brittle (the cookie expires; Matt would need to copy a fresh cookie from devtools each time). The cleaner pattern is for the script to NOT pretend to drive snapshot generation at all."
    fix-applied: "Script Step 5 has TWO modes: (a) dry-run prints the UI walkthrough Matt should follow (`/coach/dashboard` → IICT → 'Generate report pack' button → period 2026-04 → wait for completion → repeat for 2026-05); (b) --apply mode re-reads monthly_report_snapshots from Supabase and verifies 2 rows now exist for IICT (one per target month). The script never tries to author the snapshot itself. This matches the `feedback_save_state_legacy` memory rule: trace the button → API call, do not bypass."
    impact-on-defer: "Useful for the future coach session — they understand up-front that Step 5 is a UI-driven action, not a script-driven write. The script's role in Step 5 is verification, not generation."
    sentinel: "grep -nE \"UI|browser session|verify\" scripts/70-07-B3-iict-onboarding-completion.mjs | head -5"
  - id: D3
    where: "scripts/70-07-B3-iict-onboarding-completion.mjs Step 4 (FY27 forecast dedupe — IICT-scoped)"
    plan-said: "If > 1 active FY27 for IICT: apply the same canonical-selection rule as 70-02 (updated_at DESC, pl_lines DESC, payroll_summary nonzero, created_at DESC). Print winner + losers. --apply: deactivate losers (set is_active=false)."
    reality: "70-02 already ran against the entire production businesses set (verified clean — see 70-02 SUMMARY: 25 active forecasts → 25 unique groups by the Phase 67 unique-partial-index key). IICT had no remaining duplicate-active-FY27 condition by the time 70-07 was authored. Step 4 is therefore an idempotent zero — the canonical-selection branch is never entered on live state."
    fix-applied: "Script Step 4 is wired correctly (will become a no-op when invoked) but the script's output explicitly tells the operator 'already deduped by 70-02 — this step is a no-op confirmation pass' when the count == 1 branch is hit. The dedupe logic itself is preserved for defensive symmetry with 70-02 in case a future double-write recreates the duplicate."
    impact-on-defer: "Useful for the future coach session — they can confidently skip Step 4 once they see the 'no-op confirmation' line, saving cycle time. If they ever DO see 'duplicate detected' here, it is a signal that something rewrote the FY27 row after 70-02 ran, which itself is investigation-worthy."
    sentinel: "grep -nE \"already deduped|no-op\" scripts/70-07-B3-iict-onboarding-completion.mjs"

patterns-established:
  - "Two-plan defer streak (70-06 JDS + 70-07 IICT): when the autonomous executor reaches a per-client onboarding checkpoint that requires operator-resident business judgement (FY budget rebuild, profile classification, subscription canonicalization), the correct action is DEFER + script-preserve, not force a partial pass. Phase 70 has now exercised this pattern twice — it is now the documented convention for per-client interactive steps."
  - "Build-time deviations are SUMMARY-worthy even when the plan is deferred. The fixes the executor made to the script (D1 CHECK-constraint correction, D2 UI-not-curl reframing, D3 no-op recognition) survive the defer and inform the future coach session. Do NOT throw away build-time learning just because --apply was never run."
  - "Per-client cleanup plans (70-05 Envisage shipped, 70-06 JDS deferred, 70-07 IICT deferred) are independently scopeable — deferring IICT does NOT block the 70-08 audit re-run or the 70-09 cron heartbeat. The defer is a clean partition, not a block."

# Metrics
metrics:
  duration: ~10 minutes (state read + SUMMARY write + STATE/ROADMAP update + final commit; no script invocation, no Supabase reads, no IICT data touched)
  tasks: 0 of 2 executed at runtime (Task 1 build was completed in the prior agent's run as commit 3cb30e71; Task 2 checkpoint resolved to DEFER)
  files: 1 created (this SUMMARY) + 2 modified (STATE, ROADMAP) + 0 production data writes
  completed: 2026-05-31
  status: DEFERRED
  iict-rows-touched: 0
  scripts-invoked: 0
  matt-decision-date: 2026-05-31
---

# Phase 70 Plan 07: IICT Onboarding Completion Summary

**Status: DEFERRED per Matt's decision 2026-05-31.** Zero IICT data touched in this plan run.

## TL;DR

The 70-07 script (`scripts/70-07-B3-iict-onboarding-completion.mjs`, 727 LOC) was built and committed in the prior executor run (commit 3cb30e71 on 2026-05-31). At the Task 2 interactive checkpoint, Matt evaluated the 5-step interactive flow against the inputs it requires and concluded that Steps 1 (profile fields: industry / annual revenue / gross profit / net profit) and Step 3 (canonical IICT subscription list) need IICT business data that he does not have at hand right now.

Matt's decision: defer the entire 5-step run to a future IICT-focused coach session that can collect the inputs properly in one sitting. Same shape and rationale as 70-06 (JDS): better to do one focused, atomic onboarding pass than to ship IICT half-onboarded.

## What was NOT done (and why)

1. **No `--apply` run** of `scripts/70-07-B3-iict-onboarding-completion.mjs` at any `--step=N`.
2. **No Step 1 profile write** — needs Matt-provided industry classification, annual revenue, gross profit, net profit (then the script derives margins). These are business-judgement entries, not lookups.
3. **No Step 2 consolidation_budget_mode flip** — even though Step 2 is technically executable today without input (it would change 'single' → 'per_tenant' per D1 below), it was bundled into the defer to avoid partial onboarding state. Flipping mode while profile/subs/snapshots remain empty would present a false-positive 'IICT looks onboarded' signal to the 70-08 audit re-run.
4. **No Step 3 subscription_budgets inserts** — needs the canonical IICT vendor list (frequency, budget amount, renewal month, account codes per vendor). This is operator-curated data, not derivable from Xero alone.
5. **No Step 4 FY27 dedupe** — already a no-op per D3 below (70-02 cleaned this up cross-business). Bundling into the defer simply means we don't run a confirmation-pass script in isolation.
6. **No Step 5 monthly_report_snapshots generation** — the snapshot writes require a browser session and a working Xero token for IICT (gated by Phase 69 status). Per D2 below, the script's Step 5 is verification-only, not generation. Without Step 1-3 first, there is no point generating snapshots that would render against empty profile/subs.

## What is preserved

- **`scripts/70-07-B3-iict-onboarding-completion.mjs`** (committed 3cb30e71 on 2026-05-31, 727 LOC, dry-run safe). The script is intact and usable — the future coach session can invoke it interactively as `--step=1` through `--step=5`, each with a dry-run pass followed by `--apply`. The 5-step structure, IICT IDs, readline prompts, idempotency checks, and the D1/D2/D3 fixes are all wired.
- **IICT IDs** (verified locked in 70-CONTEXT.md and re-asserted at the top of the script source):
  - `businesses.id = fbc6dffd-677d-47ec-8277-7157982938e7`
  - `business_profiles.id = 6c0dfadb-4229-4fc2-89eb-ec064d24511b`
- **The D1/D2/D3 build-time corrections** (see frontmatter `deviations-surfaced-at-build-time` for full detail). These are real, useful, and survive the defer:
  - **D1:** `consolidation_budget_mode = 'per_tenant'` (NOT 'consolidated' — the CHECK constraint allows only `'single' | 'per_tenant'`). The plan-as-written would have hit a constraint violation; the script-as-committed does not.
  - **D2:** Step 5 snapshot generation runs through the existing UI flow (`/coach/dashboard` → IICT → 'Generate report pack'), NOT via a curl/cookie hack. The script's `--apply` mode for Step 5 is a post-generation verification pass, not a write.
  - **D3:** Step 4 (IICT FY27 dedupe) is an idempotent no-op confirmation — 70-02 already deduped this cross-business. The script prints 'already deduped — no-op confirmation' when the count == 1 branch is hit.

## Why defer is the right call

IICT is the highest-lift remaining onboarding in Phase 70. Steps 1 + 3 are not list-lookup work — they are operator-judgement work:

- **Industry classification** has ~6 plausible answers (IT Consulting / IT Services / Software / Professional Services / Management Consulting / Computer Systems Design). The choice affects downstream benchmarks and report-pack copy.
- **Annual revenue / gross profit / net profit** are either trailing-12-months from Xero P&L (which requires a working IICT Xero token — and IICT had 3 tenants with 3-days-expired tokens per the Phase 69 audit) or the operator's working FY27 planning number. Either path is a decision, not a data fetch.
- **Subscription list** needs the canonical IICT vendor set — Matt's working knowledge of which Xero recurring charges are real subscriptions vs one-offs vs reimbursements. This cannot be auto-derived without producing false positives.

Doing all three under autonomous-executor pressure risks shipping wrong numbers into a CFO-level report pack. The 70-06 (JDS) precedent applies directly: same shape, same defer rationale.

## Cross-reference: future work item

**Future to-do (orchestrator level):** _IICT onboarding completion — drive the 5-step 70-07 script interactively in a focused coach session._

This is a coach activity. Inputs needed (none autonomously inferrable):
- IICT industry classification (1 free-text value, Matt's choice from the ~6 plausible)
- IICT annual revenue (1 number, trailing-12-months or FY27 plan)
- IICT gross profit (1 number)
- IICT net profit (1 number)
- IICT canonical subscription list (N rows, each with vendor / frequency / budget amount / renewal month / account codes)
- Confirmation that IICT Xero tokens are healthy (gated by Phase 69 status) before Step 5 snapshot generation

When the coach session happens, the workflow is:
1. Verify IICT Xero tokens are healthy via `node scripts/verify-production-migration.ts` (or `XeroHealthPill` on the coach dashboard) — if expired, run the Phase 69 reconnect flow first.
2. `node scripts/70-07-B3-iict-onboarding-completion.mjs --step=1` (dry-run, review prompted entries)
3. `node scripts/70-07-B3-iict-onboarding-completion.mjs --step=1 --apply`
4. `node scripts/70-07-B3-iict-onboarding-completion.mjs --step=2` then `--apply` (will flip 'single' → 'per_tenant' per D1)
5. `node scripts/70-07-B3-iict-onboarding-completion.mjs --step=3 --apply` (interactive vendor entry loop)
6. `node scripts/70-07-B3-iict-onboarding-completion.mjs --step=4 --apply` (expected output: 'already deduped — no-op' per D3)
7. Use the coach dashboard UI to generate IICT monthly report snapshots for 2026-04 and 2026-05 (per D2 — Step 5 is UI-driven)
8. `node scripts/70-07-B3-iict-onboarding-completion.mjs --step=5 --apply` (verifies 2 monthly_report_snapshots rows now exist for IICT)
9. Re-run `node scripts/phase-70-data-audit.mjs` — IICT section should now show all dimensions healthy.

## Downstream plan impact

- **70-08 (audit re-run):** Will continue to flag IICT on the profile / consolidation_mode / subscription_budgets / monthly_report_snapshots dimensions. That flag is expected and correct. The 70-08 SUMMARY should document the IICT flag as "intentionally deferred — see `.planning/phases/70-.../70-07-SUMMARY.md` and `.planning/phases/70-.../70-06-SUMMARY.md` for the same-pattern JDS defer."
- **70-09 (Phase 69 cron heartbeat):** UNAFFECTED. It does not depend on IICT being onboarded; it gates the Xero refresh-cron health signal that Step 5 of 70-07 will eventually need.
- **Phase overall:** Phase 70 now sits at 5/9 shipped + 2/9 deferred (70-06 + 70-07) = 7/9 resolved + 2/9 remaining (70-08 audit re-run, 70-09 cron heartbeat). Both remaining plans are verification work and can proceed without 70-06 or 70-07 — they will simply document the deferrals.

## Deviations from plan

**The defer itself is the runtime deviation.** Task 2's checkpoint asked Matt to drive the 5-step apply cycle; Matt chose defer instead. No Rule 1/2/3 auto-fixes were performed at runtime because no script was executed at runtime.

The script-author run (prior agent, commit 3cb30e71) DID surface three build-time deviations that are recorded in full in the frontmatter `deviations-surfaced-at-build-time` block above. Summary references:

1. **D1 — `consolidation_budget_mode = 'per_tenant'`** (NOT 'consolidated'). The CHECK constraint enforces only `'single' | 'per_tenant'`. Plan text said 'consolidated'; script writes 'per_tenant'. Bug averted: --apply would have failed with constraint violation if the plan text had been followed verbatim.

2. **D2 — Step 5 snapshot generation requires browser session; script handles dry-run + verification only**. The plan suggested printing curl commands with Matt's session cookie. Reality: the snapshot endpoint is browser-session-authenticated; the cleaner pattern is for the script to surface the UI walkthrough in dry-run and verify-by-read in --apply. Matches the `feedback_save_state_legacy` memory rule (trace the button → API; don't bypass).

3. **D3 — Step 4 already a no-op**. 70-02 deduped active forecasts cross-business including IICT FY27. The Step 4 canonical-selection branch is never entered on current live state. Script outputs 'already deduped — no-op confirmation' to make this explicit so the operator does not wait on a branch that will not fire.

## Self-Check: PASSED

- File exists: `.planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-07-SUMMARY.md` — FOUND
- Script committed: `scripts/70-07-B3-iict-onboarding-completion.mjs` — FOUND (commit 3cb30e71, 727 LOC)
- Zero IICT data writes confirmed: no `--apply` invocation in this session; `git log --oneline | grep "70-07"` shows only the earlier `feat(70-07): IICT onboarding completion script (5 interactive steps, --apply gated)` build commit (3cb30e71) — no chore/apply commit will exist after this run, only a `docs(70-07): defer per Matt …` commit.
