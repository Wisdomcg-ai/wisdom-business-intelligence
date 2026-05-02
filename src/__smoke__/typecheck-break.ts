// Phase 44 plan 5 — branch protection smoke test.
// DELIBERATE TS2322 (string assigned to number). PR is throwaway and
// will be CLOSED WITHOUT MERGING. Used to prove the `typecheck` required
// check blocks merging. See .planning/phases/44-test-gate-ci-hardening/44-05-PLAN.md.
export const x: number = 'this is not a number'
