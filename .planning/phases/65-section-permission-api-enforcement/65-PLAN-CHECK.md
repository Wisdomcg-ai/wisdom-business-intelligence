# Phase 65 — Overall PLAN-CHECK

> **Re-check 2026-05-15 (current):** Plan 65-02 revised per Matt's "Interpretation A" decision (helper gets auth-bound client; service-role data-fetching tolerated and deferred to Phase 66+). New Task 1.5 introduces `auth.getUser()` on the 5 auth-less routes. Verify block tightened to `-eq 32`. Phase 66 follow-ups encoded in SUMMARY contract. 65-CONTEXT.md updated to match. Re-run of gsd-plan-checker returned **PASS**. **Phase greenlit for execution.**
>
> Phase rename hygiene: all 12 phase docs had stale "Phase 64" references from a pre-rename pass; bulk-renamed to "Phase 65" with forward references to "Phase 65+" bumped to "Phase 66+" to preserve original meaning.

---

**Original verdict (superseded):** BLOCK — request revision of Plan 65-02 before execution starts.

The phase architecture is sound. Plans 01, 03, 04, 05 are execution-ready (PASS). Plan 02 has two BLOCKER issues that are structurally Phase-61-class failures — the precision pattern is designed to catch exactly these. Fix 65-02 and the phase is unblocked.

## Per-plan verdicts at a glance

| Plan | Verdict | One-line reason |
|------|---------|-----------------|
| 65-01 | PASS | Helper + 11 unit tests + section-key spelling lock — all precision items honored |
| 65-02 | **BLOCK** | (1) service-role bypass policy mis-greps; (2) 5+ routes have no `auth.getUser()` to insert after |
| 65-03 | PASS | Manual Sentry soak gate with three explicit acceptance criteria |
| 65-04 | PASS | ENFORCE-mode tests + cutover runbook + kill switch all locked |
| 65-05 | PASS | PR risk assessment + phase SUMMARY + ROADMAP completion |

## Verdict on the planner's 4 FLAGs

| Flag | Planner's framing | My verdict |
|------|-------------------|------------|
| FLAG 1 — super_admin / coach TS query patterns left to executor | "Acceptable risk?" | **Proceed as-is.** The codebase has clear canonical patterns; the plan instructs the executor to grep + mirror, not invent. Risk is low. |
| FLAG 2 — `auto-map` route gated | "Is this correct?" | **Correct to gate IT, BUT see BLOCKER below.** Auto-map touches `xero_pl_lines` + `forecast_pl_lines` + `account_mappings` = finance data; it belongs in scope. However the route has NO user auth at all — plan can't be executed verbatim. Resolve via 65-02 revision. |
| FLAG 3 — `vi.mock` vs `vi.stubEnv` for ENFORCE-mode tests | "Acceptable?" | **Proceed as-is.** Both approaches work; `vi.mock` of the config module is the safer recommended path (bypasses module-load timing issues). The plan documents both. |
| FLAG 4 — Consolidated route drift not fixed in scope | "Acceptable? (Phase 66 work)" | **Pre-resolve before execution.** Plan 65-02 step 8 instructs the executor to use whatever `business_id` the consolidated routes currently have — fine for the gate logic (helper will return `not_a_member` if wrong). But the SUMMARY for 65-02 must explicitly state the consolidated routes remain on the existing (possibly drifted) business-ID resolution, so Phase 66 picks it up cleanly. Low-effort hardening — add to the plan's `<output>` block. |

## Top 3 issues across all plans

1. **Plan 65-02 — service-role bypass policy is grep-only enforceable for `createServiceRoleClient`, but most in-scope routes use raw `createClient(..., process.env.SUPABASE_SERVICE_KEY!)`.** Confirmed in: `auto-map`, `snapshot`, `wages-detail`, `commentary`, `full-year`, `generate`, `consolidated*`, `settings`, `subscription-detail`, `account-mappings`, all `forecast/cashflow/*`, and `Xero/{reconciliation,subscription-transactions,balance-sheet}`. The plan's grep passes (false negative) and the precision policy is silently violated. Resolution: either tighten the grep AND change the routes to pass an auth-bound client to the helper (canonical pattern in `Xero/reconciliation:22-23` and `forecast/cashflow/capex:59-60`), OR carve service-role routes out per the CONTEXT.md service-role policy. Matt must pick.

2. **Plan 65-02 — 5+ in-scope routes have no `auth.getUser()` to insert the helper after.** Confirmed: `auto-map`, `snapshot`, `wages-detail`, `commentary`, `full-year` all accept `business_id` from request body with zero authentication. Plan Task 2 step 2 instruction is unexecutable for these routes. The executor will either invent (precision violation) or skip silently (security gap). Resolution: either add an auth-client-introduction sub-task to 65-02 OR carve those routes out and document them as a known leak path for Phase 65.

3. **Plan 65-02 verify block tolerates undercount.** `EXPECTED_COUNT=32; [ "$ACTUAL_COUNT" -ge 30 ]` — accepts a state where 2 routes silently lack the helper. Tighten to `-ge 32` or `-eq 32` so the inventory enforcement is real.

## Recommendation

**Request revisions on Plan 65-02 before execution.** Specifically:

a. Resolve the service-role / auth-client question with Matt sign-off. Update CONTEXT.md if the policy needs to evolve; otherwise tighten the grep and rework the route edits to pass a `createRouteHandlerClient()`-derived `supabase` to the helper.
b. Enumerate auth-less routes explicitly. For each: add an auth-introduction step OR carve out with a SUMMARY-level note.
c. Tighten 65-02 verify block: `EXPECTED_COUNT=32` should be exact, not a lower bound.
d. Add to 65-02 `<output>` block: SUMMARY must note Phase 66 follow-up for consolidated-route drift (FLAG 4 hardening).

After the four edits above land in `65-02-PLAN.md`, re-run `/gsd:plan-phase 64 --check` and the phase is greenlit for execution.

Plans 01, 03, 04, 05 do NOT need changes. They depend on 65-02 (waves), so execution must wait until 65-02 revises — but the plans themselves are sound.

The phase's precision-first framing is good. The section-key spelling decision is correctly resolved. The log-then-enforce + soak window + env-var-gate + kill-switch architecture is exactly what should exist after Phase 61. The blockers are not architectural — they're a route-inventory blind spot in 65-02 that surfaces only when you grep the actual files.
