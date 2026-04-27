# Phase 44 — Deferred Items

Items discovered during Phase 44 plan execution that are out of scope for the
current plan and should be addressed separately.

---

## Pre-existing test failure: `plan-period-banner.test.tsx` line 78

**Discovered during:** Plan 44-01 Task 4 verification (`npm run test` baseline check)
**Status:** Pre-existing — present at HEAD before Plan 44-01 began (verified via `git stash` rerun on commit 6b77d0d).

**Failing assertion:**
```
src/__tests__/goals/plan-period-banner.test.tsx:78
  expect((inputs[0] as HTMLInputElement).value).toBe('2026-04-01')
  Received: '2026-03-31'
```

**Root cause (likely):** Timezone artifact. The test constructs a `Date` from
`'2026-04-01'` in the local timezone, but the modal's `<input type="date">`
renders via `toISOString().slice(0,10)` which converts to UTC — and at certain
local times (notably any system clocked to GMT-* during DST transitions),
`new Date('2026-04-01')` parsed as local midnight → ISO string yields the
prior day. The Phase 43 plan-period work (commit dc0581b / a8ad838 era)
shipped these tests under a UTC CI assumption.

**Recommended fix (defer to its own plan):** Replace `toISOString().slice(0,10)`
with a local-TZ formatter (`fmt(d) = YYYY-MM-DD via getFullYear/getMonth/getDate`)
inside `PlanPeriodAdjustModal` — same pattern Plan 43-03 Task 1 used in its
`suggestPlanPeriod` test. One-line component fix + test rerun.

**Out of scope for Plan 44-01:** This plan only adds test infrastructure +
audit script + fixture commits. No production code touched. Per Scope
Boundary rule, only auto-fix issues directly caused by current task changes.

**Phase 44 baseline:** With this single failure, full suite is 395 passed /
22 todo / 1 failed. The 22 todos are intentional — they belong to Plan 44-01's
seven new scaffold files and will be filled in by Plans 44-03 through 44-11.
