# Phase 61 PLAN-CHECK — Overall Summary

**Verdict:** PASS (proceed to execute, with two nice-to-have adjustments in 61-05 and 61-06)

## Per-plan verdicts at a glance

| Plan | Title | Wave | Verdict |
|------|-------|------|---------|
| 61-01 | DDL migration (columns + GIN indexes) | 1 | PASS |
| 61-02 | RLS + SECURITY DEFINER RPCs | 2 | PASS |
| 61-03 | Service layer (broadening, share, RPC, ownership gaps) | 2 | PASS |
| 61-04 | API routes (share + complete + status) | 3 | PASS |
| 61-05 | UI (ShareDialog + Picker + Badge + wiring) | 4 | FLAG |
| 61-06 | Coach dashboard breakdown | 3 | FLAG |

## Goal coverage check

Locked goal: "Let users share individual `daily_tasks` and `ideas` either with the entire team or with selected teammates — defaulting to private. Recipients can mark complete but not edit/delete; owners retain full control. Coach dashboard surfaces owned vs team-shared idea counts."

- "Share individual daily_tasks and ideas": 61-01 (columns) + 61-04 (share routes) + 61-05 (dialog) ✓
- "Entire team or selected teammates": ShareDialog three modes, mapping to `shared_with_all` vs `shared_with` ✓
- "Defaulting to private": 61-01 column defaults + 61-05 dialog default ✓
- "Recipients can mark complete": 61-02 RPCs + 61-04 complete/status routes + 61-05 recipient mark-complete branch ✓
- "Not edit/delete": 61-02 owner-only INSERT/UPDATE/DELETE policies + 61-03 service-layer regression + 61-05 hidden affordances ✓
- "Owners retain full control": preserved owner-only paths throughout ✓
- "Coach dashboard surfaces owned vs team-shared idea counts": 61-06 ✓

No uncovered goal pieces. The 9 locked decisions are all correctly captured. Coexistence boundary (action_items, issues_list, ideas business-wide board, ideas_filter) is explicit in every plan that could plausibly touch them.

## Wave/dependency correctness

Verified against frontmatter `depends_on`:
- Wave 1: 61-01 (`depends_on: []`) ✓
- Wave 2: 61-02 (`["61-01"]`), 61-03 (`["61-01"]`) — both parallel, both gated on 61-01 ✓
- Wave 3: 61-04 (`["61-02","61-03"]`), 61-06 (`["61-03"]`) — both can run in parallel after Wave 2 ✓
- Wave 4: 61-05 (`["61-04"]`) — UI waits for API ✓

No cycles. No forward references. Wave assignments consistent with depends_on (max+1 rule).

## Test coverage assessment

Combined manual + integration coverage of the 24-cell matrix:
- 61-02 walks 9 cells (RLS + RPC layer)
- 61-05 walks 6+ cells (UI flows including off-boarding)
- Plus ≥33 service unit tests (61-03), ≥48 route tests (61-04), ≥10 coach route tests (61-06), ShareDialog/Picker component tests (61-05)

Combined test count ≥100 cases across 6 plans. Matrix is well-exercised. Manual cells are biased toward the high-risk paths (recipient UPDATE blocked, RPC visibility denial, owner-only affordances hidden).

## Top 3 issues across all plans

1. **Owner-name resolution (61-05)** — UI plan defers owner display name to a "small lookup or follow-up". Risk: SharedByBadge ships with raw UUIDs. Fix: extend service read in 61-03 (or surgically in 61-05) to join `users(email)` for owner_user_id. Recommended before merging 61-05.

2. **Coach total semantics (61-06)** — Plan presents preserve-headline (a) vs new-semantics (b) as executor's choice, but the Group D test pins (b). The executor must reconcile and document in 61-06-SUMMARY.md. Low risk because both options are defensible; just needs explicit pinning.

3. **Planner-flagged ambiguities (4 items)** — owner display name, coach `ideas_total` semantics, `ideas_status_check` values, route style. All four are explicitly documented in their respective plans for executor resolution — none are silently left ambiguous. The `ideas_status_check` values must be read verbatim from baseline_schema.sql; the route style is locked to separate endpoints (`/complete`, `/status`).

## Recommendation

**Proceed to execute.** All 9 locked decisions are honored. Goal coverage is complete. Dependency graph is clean. The two FLAG verdicts (61-05 owner-name, 61-06 semantics) are nice-to-haves that can be resolved during execution without blocking — but Matt should be aware of them before the executor ships.

Suggested guardrails for the executor:
- Read `ideas_status_check` from baseline_schema.sql before writing `mark_idea_status` (61-02).
- Land `owner_email` join in 61-03's service read so 61-05 has a real label.
- Pin coach total semantics in 61-06 tests and document the choice in SUMMARY.md.

Once you start execution, you can ask me to verify the end-to-end flow (browser walkthrough of the 6 manual cells from 61-05 plus the coach dashboard render from 61-06).
