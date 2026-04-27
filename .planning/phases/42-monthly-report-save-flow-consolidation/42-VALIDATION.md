---
phase: 42
slug: monthly-report-save-flow-consolidation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Skeleton from RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (E2E, optional un-skip) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test && npx tsc --noEmit` |
| **Estimated runtime** | ~30-60s unit |

---

## Sampling Rate

- **After every task commit:** Run quick unit tests touching changed files
- **After every plan wave:** Full unit suite + tsc
- **Before final UAT:** Full suite green; manual flow test
- **Max feedback latency:** ~60s

---

## Per-Task Verification Map

Populated by gsd-planner. Maps each D-01..D-17 to test/verify points.

| Task ID | Plan | Wave | Decision | Test Type | Automated Command | Status |
|---------|------|------|----------|-----------|-------------------|--------|
| _TBD_ | — | — | D-01..D-17 | mixed | _TBD_ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.ts` — debounce + onBlur + retry tests
- [ ] `src/app/finances/monthly-report/components/__tests__/SaveIndicator.test.tsx` — indicator state rendering
- [ ] `src/app/finances/monthly-report/components/__tests__/CommentaryLine.test.tsx` — always-editable inline editing
- [ ] Mock helpers for `vi.useFakeTimers()` debounce simulation

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Type → pause → indicator flips to "Saving..." → "All changes saved" | D-01, D-08 | Visual feedback timing | Type 5 chars in any commentary; observe indicator text changes within 500ms-1s |
| Approve & Send → edit commentary → pill flips to Draft within ~500ms | D-15, Phase 35 D-16 | Real-time pill reactivity | Approve report; wait for Sent; type → blur → pill should change immediately (not wait 10s) |
| Network failure → indicator shows retry → manual Save Now | D-11, D-12 | Induced failure | DevTools throttle to "Offline"; type → confirm "retrying..." then "Save Now" button after retries |
| Finalise locks auto-save | D-06 | UX behavior | Click Finalise; verify commentary fields become read-only (planner confirms exact UX) |
| beforeunload guard prevents lose-work navigation | D-12 fallback | Browser behavior | After failed save, attempt Cmd+W or back-button → confirmation prompt |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] No 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
