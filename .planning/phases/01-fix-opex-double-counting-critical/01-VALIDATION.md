---
phase: 1
slug: fix-opex-double-counting-critical
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None installed (no Jest, Vitest, or similar) |
| **Config file** | None |
| **Quick run command** | `npm run lint` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | R1.1 | build | `npm run build` | N/A | ⬜ pending |
| 01-01-02 | 01 | 1 | R1.1 | build | `npm run build` | N/A | ⬜ pending |
| 01-01-03 | 01 | 1 | R1.1 | build | `npm run build` | N/A | ⬜ pending |
| 01-01-04 | 01 | 1 | R1.1 | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework installation needed for this bug fix phase — `npm run build` (TypeScript compile) catches import/type errors, and manual browser verification confirms correct calculation results.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BudgetTracker shows < 100% utilization | R1.1 | No unit test infra; requires rendered React component | Load forecast for Just Digital Signage, check BudgetTracker shows reasonable % (not 461%) |
| Step 5 greyed-out rows visible and labelled | R1.1 | Visual/DOM check | Open Step 5 OpEx, verify wage/super lines show greyed with "Counted in Team Costs" label |
| Step 8 Net Profit correct | R1.1 | Requires full P&L context | Open Step 8 Review, verify Net Profit = GP - Team - OpEx - Depreciation - Other - Investments |
| OpEx prior year total excludes team costs | R1.1 | Table footer visual check | Check Step 5 footer "Prior Year" column doesn't include wage/super amounts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
