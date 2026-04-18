---
phase: 34
slug: dragon-multi-entity-consolidation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30-45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/consolidation --reporter=dot` (fast feedback on engine changes)
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green, `npx tsc --noEmit` clean
- **Max feedback latency:** ~10 seconds for engine tests

---

## Per-Task Verification Map

> Populated by planner during PLAN.md creation. Each task maps to a requirement, secure behavior, and automated test command. The planner-produced tasks must reference this map via `verify:` field.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-00-01 | 00 | 0 | MLTE-01 | T-34-01 | RLS prevents cross-business consolidation leak | unit | `npx vitest run src/lib/consolidation/engine.test.ts` | ❌ W0 | ⬜ pending |

*(Populated during planning — this row is a template)*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/consolidation/engine.test.ts` — unit tests for aggregation engine (stubs for MLTE-01, MLTE-02, MLTE-03)
- [ ] `src/lib/consolidation/eliminations.test.ts` — unit tests for elimination rule engine
- [ ] `src/lib/consolidation/fx.test.ts` — unit tests for FX translation (HKD/AUD monthly-average)
- [ ] `src/lib/consolidation/__fixtures__/dragon-mar-2026.ts` — reference fixture transcribed from Dragon PDF
- [ ] `src/lib/consolidation/__fixtures__/iict-mar-2026.ts` — reference fixture transcribed from IICT PDF
- [ ] `src/app/api/monthly-report/consolidated/route.test.ts` — integration test for the consolidated endpoint
- [ ] RLS unit tests for new tables (`consolidation_groups`, `consolidation_group_members`, `consolidation_elimination_rules`, `fx_rates`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Consolidated report layout matches Dragon Mar 2026 PDF visually | MLTE-02 | Visual layout comparison requires eye | (1) Flag Dragon Consolidation as active business. (2) Open /monthly-report?business_id=<dragon_consolidation_id>&month=2026-03. (3) Compare P&L Comparison tab to page 6 of Dragon PDF. (4) Verify 3 columns: Dragon Roofing / Easy Hail Claim / DRAGON CONSOLIDATION. (5) Verify Sales - Deposit row = 11,652 (Easy Hail column) and 11,652 (Consolidated column). |
| Consolidated report layout matches IICT Mar 2026 PDF visually | MLTE-02 | Visual layout comparison requires eye | (1) Enter HKD/AUD monthly_average rate for 2026-03 in settings. (2) Open /monthly-report?business_id=<iict_consolidation_id>&month=2026-03. (3) Compare P&L Comparison tab to page 7 of IICT PDF. (4) Verify 4 columns render correctly on desktop; toggle pills render correctly on mobile. |
| Missing FX rate shows warning (not silent 1:1 fallback) | FX safety | Requires live UI interaction | (1) Delete HKD/AUD rate for 2026-03. (2) Open IICT consolidation for March. (3) Verify warning banner "HKD/AUD rate missing for 2026-03 — add rate to proceed" is prominent. (4) Verify no numbers are shown that could be misinterpreted as correct. |
| Approval snapshot preserves numbers after Xero changes | Phase 35 hook | Requires approval workflow + Xero resync | (1) Approve a consolidated report for month M. (2) Re-sync Xero (changes a transaction in month M). (3) Re-open the approved report. (4) Verify snapshot-view shows ORIGINAL numbers. (5) Verify live-view shows NEW numbers. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixtures, engine tests, RLS tests)
- [ ] No watch-mode flags (`--watch` forbidden in task commands)
- [ ] Feedback latency < 15s for engine-focused test runs
- [ ] `nyquist_compliant: true` set in frontmatter after planner populates per-task map

**Approval:** pending
