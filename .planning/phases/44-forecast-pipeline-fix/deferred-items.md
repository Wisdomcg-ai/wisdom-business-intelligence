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

## Audit-script bug from 44-02 deployment (2026-04-27)

`scripts/audit-xero-pl-lines-duplicates.ts` reported 0 duplicate groups in 44-01, but Migration 1's pre-flight caught a real collision (IICT Group: 2 rows with account_code=NULL on different accounts). The script's grouping logic is NULL-unaware and missed it. Also, the script reads via Supabase's default 1000-row limit which truncates against tables larger than that.

Fix needed before Phase 45 / future migrations:
- Mirror SQL GROUP BY semantics (treat NULL=NULL as same group)
- Paginate through full row sets, not just first 1000
- Add a unit test against a fixture with intentional NULL-collisions

Logged from Phase 44 Plan 44-02 SUMMARY.

## Plan 44-07 — out-of-scope discoveries

- `src/app/api/Xero/reconciliation/route.ts:156` contains a `// Non-fatal` comment. Not in 44-07's scope (Plan 44-07 retires non-fatal patterns only in the wizard generate route + sync-forecast). Reconciliation route is owned by Plan 44-04/44-05; if the pattern needs retiring there, raise as follow-up.
