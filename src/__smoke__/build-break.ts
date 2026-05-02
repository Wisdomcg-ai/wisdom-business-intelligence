// Phase 44 plan 5 — branch protection smoke test.
// DELIBERATE module-not-found error. PR is throwaway and will be CLOSED
// WITHOUT MERGING. Used to prove the `build` required check blocks
// merging. See .planning/phases/44-test-gate-ci-hardening/44-05-PLAN.md.
import './this-module-does-not-exist-and-never-will'

export const _ = null
