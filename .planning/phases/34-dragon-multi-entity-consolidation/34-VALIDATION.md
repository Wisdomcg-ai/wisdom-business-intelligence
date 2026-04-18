---
phase: 34
slug: dragon-multi-entity-consolidation
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-18
updated: 2026-04-18
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
| **Consolidation slice** | `npx vitest run src/lib/consolidation --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30-45 seconds |

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/lib/consolidation --reporter=dot` (~5-10s)
- **After every plan wave:** `npx vitest run --reporter=dot` (full suite)
- **Before `/gsd-verify-work`:** Full suite green, `npx tsc --noEmit` clean
- **Max feedback latency:** ~10 seconds for engine tests

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-00a-T1 | 00a | 1 | MLTE-01 (infrastructure) | — | shared.ts extraction preserves sign conventions | unit | `npx vitest run src/lib/monthly-report/shared.test.ts` | ❌ W0 | ⬜ pending |
| 34-00a-T2 | 00a | 1 | MLTE-01, MLTE-02 | T-34-01 | Fixture data matches PDFs (Sales-Deposit=11652, Advertising±9015) | unit | `npx tsc --noEmit` (types + fixtures compile) | ❌ W0 | ⬜ pending |
| 34-00a-T3 | 00a | 1 | MLTE-01 | T-34-01 | RLS trifecta on all new tables; CHECK constraints on enums | sql | `npx supabase db lint --linked` | ❌ W0 | ⬜ pending |
| 34-00b-T1 | 00b | 2 | MLTE-03 | — | Alignment key is type::name-normalized (Pitfall 4) | unit | `npx vitest run src/lib/consolidation/account-alignment.test.ts` | ❌ W0 | ⬜ pending |
| 34-00b-T2 | 00b | 2 | MLTE-02 | T-34-01 | Parallel fetch via resolveBusinessIds; pure combine | unit | `npx vitest run src/lib/consolidation/engine.test.ts` | ❌ W0 | ⬜ pending |
| 34-00c-T1 | 00c | 2 | MLTE-02 | T-34-02 (dos via bad rate) | No silent 1.0 fallback on missing rate | unit | `npx vitest run src/lib/consolidation/fx.test.ts` | ❌ W0 | ⬜ pending |
| 34-00d-T1 | 00d | 3 | MLTE-01, MLTE-02 | T-34-02 | DoS guard on regex pattern length + invalid-regex guard | unit | `npx vitest run src/lib/consolidation/eliminations.test.ts` | ❌ W0 | ⬜ pending |
| 34-00d-T2 | 00d | 3 | MLTE-02 | — | Eliminations apply only in reportMonth; Dragon advertising nets to 0 | unit | `npx vitest run src/lib/consolidation/engine.test.ts` | ❌ W0 | ⬜ pending |
| 34-00d-T3 | 00d | 3 | MLTE-01 | T-34-03 | Idempotent seed via ON CONFLICT DO NOTHING | sql | `npx supabase db lint --linked` | ❌ W0 | ⬜ pending |
| 34-00d-T4 | 00d | 3 | MLTE-01 | T-34-01 | Schema + seed pushed + verified in DB | manual | post-push SQL verification queries | ✅ checkpoint | ⬜ pending |
| 34-00e-T1 | 00e | 4 | MLTE-02, MLTE-03 | T-34-05, T-34-06, T-34-07 | Auth-gated route with stage tracking + FX wiring | integration | `npx vitest run src/app/api/monthly-report/consolidated/route.test.ts` | ❌ W0 | ⬜ pending |
| 34-00e-T2 | 00e | 4 | MLTE-04 | — | Group detection hook + page mode switch | compile-only | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 34-00e-T3 | 00e | 4 | MLTE-02 | — | Sticky columns + mobile toggle + FX banner | compile-only | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 34-00e-T4 | 00e | 4 | MLTE-02 | — | Dragon + IICT visual match to reference PDFs | manual | Human checkpoint (VALIDATION.md § Manual-Only) | ✅ checkpoint | ⬜ pending |
| 34-00f-T1 | 00f | 5 | MLTE-01 | T-34-09, T-34-10 | Role-gated CRUD + format validation (PAIR_RE + rate_type + positive rate) | compile-only | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 34-00f-T2 | 00f | 5 | MLTE-05 | T-34-11 | Coach/super_admin layout guard; diagnostic view RLS-scoped | compile-only | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 34-00f-T3 | 00f | 5 | MLTE-01, MLTE-02 | — | End-to-end FX flow: add rate → banner disappears; delete → banner returns | manual | Human checkpoint | ✅ checkpoint | ⬜ pending |
| 34-01a-T1 | 01a | 6 | MLTE-02, MLTE-03 | T-34-15 | BS translation positive-finite guard; CTA absorbs translation residual | unit | `npx vitest run src/lib/consolidation --reporter=dot` | ❌ W0 | ⬜ pending |
| 34-01a-T2 | 01a | 6 | MLTE-02 | T-34-13, T-34-14 | BS API auth + stage tracking; Assets = Liab + Equity after CTA | integration | `npx vitest run src/app/api/monthly-report/consolidated-bs` | ❌ W0 | ⬜ pending |
| 34-01a-T3 | 01a | 6 | MLTE-05 | — | BS tab wiring + migration push | compile-only | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 34-01a-T4 | 01a | 6 | MLTE-02 | — | Dragon + IICT consolidated BS visual match to PDFs | manual | Human checkpoint | ✅ checkpoint | ⬜ pending |
| 34-02a-T1 | 02a | 7 | MLTE-02 | T-34-18 | combineMemberForecasts re-threads opening→closing correctly | unit | `npx vitest run src/lib/consolidation/cashflow.test.ts` | ❌ W0 | ⬜ pending |
| 34-02a-T2 | 02a | 7 | MLTE-02, MLTE-05 | T-34-16, T-34-17 | Consolidated cashflow API + tab wiring | compile-only | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 34-02a-T3 | 02a | 7 | MLTE-02 | — | Dragon + IICT 12-month cashflow visual match to PDFs | manual | Human checkpoint | ✅ checkpoint | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** No 3 consecutive tasks without automated verification. Checkpoints (00d-T4, 00e-T4, 00f-T3, 01a-T4, 02a-T3) always follow at least one fully automated task in the same plan.

---

## Wave 0 Requirements

- [ ] `src/lib/consolidation/types.ts` — domain interfaces (00a-T2)
- [ ] `src/lib/consolidation/account-alignment.ts` + `account-alignment.test.ts` (00b-T1)
- [ ] `src/lib/consolidation/engine.ts` + `engine.test.ts` (00b-T2, 00d-T2)
- [ ] `src/lib/consolidation/fx.ts` + `fx.test.ts` (00c-T1, 01a-T1)
- [ ] `src/lib/consolidation/eliminations.ts` + `eliminations.test.ts` (00d-T1)
- [ ] `src/lib/consolidation/balance-sheet.ts` + `balance-sheet.test.ts` (01a-T1)
- [ ] `src/lib/consolidation/cashflow.ts` + `cashflow.test.ts` (02a-T1)
- [ ] `src/lib/consolidation/__fixtures__/dragon-mar-2026.ts` — PDF transcription (00a-T2)
- [ ] `src/lib/consolidation/__fixtures__/iict-mar-2026.ts` — PDF transcription + HKD rates (00a-T2)
- [ ] `src/app/api/monthly-report/consolidated/route.test.ts` — integration (00e-T1)
- [ ] `src/lib/monthly-report/shared.ts` + `shared.test.ts` — refactor foundation (00a-T1)

---

## Manual-Only Verifications

| Behavior | Requirement | Plan/Task | Why Manual | Test Instructions |
|----------|-------------|-----------|------------|-------------------|
| Consolidated P&L layout matches Dragon Mar 2026 PDF visually | MLTE-02 | 00e-T4 | Visual layout comparison requires eye | (1) Flag Dragon Consolidation as active business. (2) Open /finances/monthly-report?business_id=&lt;dragon parent id&gt;&month=2026-03. (3) Click Consolidated P&L tab. (4) Compare to page 6 of Dragon PDF: 3 columns (Dragon Roofing / Easy Hail Claim / DRAGON CONSOLIDATION). (5) Verify Sales - Deposit row = 11,652 (Easy Hail column + Consolidated column). (6) Verify Advertising eliminations apply (Dragon -9015 + EasyHail +9015 + elim column → consolidated 0). |
| Consolidated P&L layout matches IICT Mar 2026 PDF visually | MLTE-02 | 00e-T4 | Visual layout comparison requires eye | (1) Enter HKD/AUD monthly_average rate for 2026-03 at /admin/consolidation. (2) Open /finances/monthly-report?business_id=&lt;iict parent id&gt;&month=2026-03. (3) Compare P&L Comparison tab to page 7 of IICT PDF. (4) Verify 4 columns (IICT Aust / IICT Group Pty Ltd / IICT Group Limited (HKD→AUD) / IICT CONSOLIDATION) render correctly on desktop; toggle pills on mobile. |
| Missing FX rate shows warning (not silent 1:1 fallback) | FX safety | 00e-T4 / 00f-T3 | Requires live UI interaction | (1) Delete HKD/AUD rate for 2026-03 via /admin/consolidation. (2) Open IICT consolidation for March. (3) Verify amber banner "HKD/AUD: 2026-03 — values shown untranslated. Add the rate to complete consolidation." is prominent. (4) Verify "Enter FX rate →" button navigates to /admin/consolidation. (5) Verify IICT HK column still shows raw HKD values (passed through, not silently zero). |
| FX round-trip: add rate → banner disappears | MLTE-02 | 00f-T3 | End-to-end user journey | (1) At /admin/consolidation add HKD/AUD rate. (2) Navigate to IICT consolidation. (3) Confirm banner gone. (4) Confirm HK column values translated. (5) Delete rate. (6) Confirm banner returns. |
| Consolidated BS layout matches Dragon + IICT Mar 2026 PDFs | MLTE-02 | 01a-T4 | Visual layout + balance check | (1) Enter HKD/AUD closing_spot rate for 2026-03-31. (2) Open consolidated BS tab for Dragon. (3) Confirm Assets = Liabilities + Equity for Consolidated column. (4) Confirm intercompany loan eliminated (Dragon Loan Payable consolidated = 0 AND Easy Hail Loan Receivable consolidated = 0). (5) For IICT: confirm Translation Reserve (CTA) line appears in Equity, and BS still balances. |
| Consolidated Cashflow 12-month forecast matches PDFs | MLTE-02 | 02a-T3 | Visual comparison + running balance check | (1) Ensure HKD/AUD monthly_average rates entered for FY months and closing_spot for FY start date. (2) Open consolidated cashflow tab. (3) Verify combined opening balance = Σ member opening balances. (4) Verify monthly movements sum. (5) Verify closing balance threads correctly. (6) Compare to user's Dragon + IICT cashflow PDFs. |
| Approval snapshot preserves numbers after Xero changes | Phase 35 hook | Phase 35 | Out of scope for Phase 34 | Deferred to Phase 35 approval workflow; the cfo_report_status.snapshot_data column exists (added in 34-00a-T3) ready for Phase 35 to populate. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (checkpoints follow automated tasks)
- [x] Wave 0 covers all MISSING references (fixtures, engine tests, RLS indirectly via migrations)
- [x] No watch-mode flags (`--watch` forbidden in task commands)
- [x] Feedback latency < 15s for engine-focused test runs
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
