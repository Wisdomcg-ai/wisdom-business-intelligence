---
phase: 35
slug: report-approval-delivery-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Skeleton filled from RESEARCH.md §Validation Architecture. Deeper test-map entries are filled in by gsd-planner and gsd-nyquist-auditor.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit/integration) + Playwright (E2E, shipped Phase 40) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test && npx tsc --noEmit` |
| **Estimated runtime** | ~30-60 seconds unit; E2E coach-flow scaffold currently skipped |

---

## Sampling Rate

- **After every task commit:** Run quick unit tests touching changed files
- **After every plan wave:** Run full unit suite + `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite green; manual UAT for email send
- **Max feedback latency:** ~60 seconds for unit; E2E runs on-demand

---

## Per-Task Verification Map

Populated by gsd-planner and gsd-nyquist-auditor during planning. Keyed on APPR-01..APPR-05 + D-01..D-23 decisions from CONTEXT.md.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| _TBD_ | — | — | APPR-01..05 | mixed | _TBD_ | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/email/__tests__/send-report.test.ts` — Resend send wrapper unit test stub
- [ ] `src/lib/reports/__tests__/report-token.test.ts` — HMAC token sign/verify roundtrip
- [ ] `src/app/api/cfo/report-status/__tests__/route.test.ts` — status transition API stub
- [ ] Resend mock helper for unit tests (stub returning `{ data: { id }, error: null }`)

*Full list finalised by gsd-planner.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Resend delivery to test inbox | APPR-02, APPR-03 | Requires network + verified sender domain | Approve a draft report for a test business owned by mattmalouf@wisdomcg.com.au; confirm email lands with subject, body, PDF attachment, working token link |
| PDF attachment renders correctly | D-07 | Visual fidelity check | Open attachment in Apple Mail + Gmail; confirm Calxa layout preserved |
| Token URL works without login | D-19, D-20 | Auth bypass verification | In a Private/Incognito window, open `/reports/view/[token]` — confirm report renders from snapshot_data |
| CFO dashboard stats update | Phase 33 cross-check | Depends on real DB state | After approving a report, visit `/cfo` — confirm Pending Approval count decrements |
| Revert-on-edit behaviour | D-16, D-17 | End-to-end save flow | Approve a report → edit commentary → save → confirm pill flips to draft silently |
| Resend button on failure | D-11 | Requires induced failure | Temporarily break RESEND_API_KEY in dev → attempt approve-and-send → confirm error toast + Resend button appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
