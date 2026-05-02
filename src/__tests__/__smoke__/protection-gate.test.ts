// Phase 44 plan 5 — branch protection smoke test.
// DELIBERATELY FAILING test. PR is throwaway and will be CLOSED WITHOUT
// MERGING. Used to prove the `vitest` required check blocks merging.
// See .planning/phases/44-test-gate-ci-hardening/44-05-PLAN.md.
import { describe, it, expect } from 'vitest'

describe('phase 44 protection smoke (intentional fail — DO NOT MERGE)', () => {
  it('should fail to prove the vitest gate blocks bad PRs', () => {
    expect(1).toBe(2)
  })
})
