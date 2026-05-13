# 61-02 PLAN-CHECK

**Verdict:** PASS (with one documented ambiguity for executor)

## Coverage analysis
Delivers the security-critical core of the phase: asymmetric RLS (broad SELECT, owner-only mutation) plus the two SECURITY DEFINER RPCs that are the only channel through which non-owners can flip status. Directly implements RESEARCH.md §5 Risk 1 Option B.

## Decision compliance
- Asymmetric RLS: SELECT clause exactly matches `(owner) OR (shared_with_all=true AND business_id=ANY(auth_get_accessible_business_ids())) OR (auth.uid()=ANY(shared_with))`. Owner-only INSERT/UPDATE/DELETE preserved verbatim (D-2).
- Mark-complete via SECURITY DEFINER RPC: `mark_task_complete` and `mark_idea_status` both perform their own visibility check and narrowly update only `status`/`completed_at`/`updated_at`. Explicitly REVOKE PUBLIC + GRANT authenticated (D-3).
- Status sync = single row: RPC updates the same shared row both owner and recipients read (D-4).
- Coexistence: zero references to `action_items`, `issues_list`, `ideas_filter` — asserted via grep (D-5).
- Ideas SELECT preserves the pre-existing super_admin/coach/business-membership OR clauses verbatim — non-negotiable noted explicitly in plan (D-2 coach visibility).

## Test coverage
Task 2 is a blocking human checkpoint walking 9 representative cells from the 24-case matrix (6 daily_tasks + 3 ideas). Crucially covers: Private+non-owner (404), Team-wide+teammate, Specific+recipient, Recipient UPDATE blocked, RPC succeeds, non-recipient RPC fails with 42501, super_admin still works, mark_idea_status invalid-status. Good selection.

## Issues found
Documented ambiguity (acceptable):
- The `v_allowed` list of valid `ideas.status` values is left for the executor to read from `ideas_status_check` in baseline_schema.sql (one of the 4 flagged ambiguities). The plan explicitly says "Do not guess — read and copy." Correctly punted.

No blockers. The SQL skeletons are tight; the executor copies-and-fills.

## Nice-to-haves
- Atomic commit via BEGIN/COMMIT wrapper is explicit. Good.
- The plan flags coach/super_admin visibility derives from the business-membership AND shared_with_all clause for daily_tasks (no special clause needed) — correct framing of the additive-OR model.
