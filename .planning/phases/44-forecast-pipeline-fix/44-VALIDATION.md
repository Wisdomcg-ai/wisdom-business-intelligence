---
phase: 44
slug: forecast-pipeline-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (jsdom env, `@vitejs/plugin-react`, setup `src/__tests__/setup.ts`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/__tests__/xero src/__tests__/services` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30-45s for full suite (currently 299/299 passing as of Phase 43); +~25-40 Phase 44 tests |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/xero src/__tests__/services` (Phase 44 surface only — fast)
- **After every plan wave:** Run `npm run test` (full suite)
- **Before `/gsd:verify-work`:** Full suite green AND Envisage manual smoke test via `/api/Xero/refresh-pl` (returns expected month count + coverage record)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Tasks finalized by gsd-planner. This map will be filled in once PLAN.md files exist.
> Each Phase 44 decision (D-05 through D-18) maps to the test categories below.

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-05 | Canonical Xero query returns 12 monthly columns for active tenant | unit (parser) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'returns 12 monthly columns'` | ❌ W0 | ⬜ pending |
| D-05 | Canonical query handles sparse tenant (≤6 months) | unit (parser) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'sparse tenant'` | ❌ W0 | ⬜ pending |
| D-06 | FY YTD + Prior FY = 24 months when tenant has full history | unit (orchestrator) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'two FY windows'` | ❌ W0 | ⬜ pending |
| D-07 | Concurrent sync calls serialize via advisory lock | integration (DB) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'advisory lock'` | ❌ W0 | ⬜ pending |
| D-07 | ON CONFLICT upsert idempotent on re-run | integration (DB) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'idempotent upsert'` | ❌ W0 | ⬜ pending |
| D-08 | Reconciliation fails loud on $0.01+ monthly-vs-FY-total mismatch | unit (reconciler) | `npx vitest run src/__tests__/xero/pl-reconciler.test.ts` | ❌ W0 | ⬜ pending |
| D-08 | Reconciliation tolerates ≤$0.01 rounding | unit (reconciler) | `npx vitest run src/__tests__/xero/pl-reconciler.test.ts -t 'tolerance'` | ❌ W0 | ⬜ pending |
| D-09 | Long-format storage: unique key (business, tenant, account, period_month) enforced at DB | integration (constraint) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'natural key uniqueness'` | ❌ W0 | ⬜ pending |
| D-09 | Multi-tenant rows aggregate correctly at read | unit (ForecastReadService) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'multi-tenant aggregate'` | ❌ W0 | ⬜ pending |
| D-10 | Coverage record `months_covered` accurate | unit (orchestrator) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'coverage record'` | ❌ W0 | ⬜ pending |
| D-11 | Cron handler rejects unauth requests | unit (route) | `npx vitest run src/__tests__/api/cron-sync-all.test.ts -t 'unauth'` | ❌ W0 | ⬜ pending |
| D-12 | Atomic RPC: assumption save succeeds → forecast_pl_lines.computed_at set | integration (RPC) | `npx vitest run src/__tests__/services/save-and-materialize.test.ts -t 'atomic'` | ❌ W0 | ⬜ pending |
| D-12 | Atomic RPC: derivation failure → both rolled back | integration (RPC) | `npx vitest run src/__tests__/services/save-and-materialize.test.ts -t 'rollback'` | ❌ W0 | ⬜ pending |
| D-13 | ForecastReadService.getMonthlyComposite produces same numbers as legacy `pl-summary` | parity (snapshot) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'parity'` | ❌ W0 | ⬜ pending |
| D-14 | Cannot create second `is_active=true` for same (business_id, fiscal_year) | integration (constraint) | already enforced — covered by `unique_active_forecast_per_fy` shipped in e337a42 | ✅ existing | ✅ green |
| D-15 | Wizard renders `—` for missing months, `$0` for real-zero months | component (RTL) | `npx vitest run src/__tests__/components/Step3RevenueCOGS.test.tsx` | ❌ W0 | ⬜ pending |
| D-16 | Envisage fixture parser produces expected row count | unit (fixture) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'envisage'` | ❌ W0 | ⬜ pending |
| D-17 | JDS fixture parser produces expected row count | unit (fixture) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'jds'` | ❌ W0 | ⬜ pending |
| D-18 | ForecastReadService throws + Sentry-tags on stale `computed_at` | unit (invariant) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'invariant'` | ❌ W0 | ⬜ pending |
| D-18 | Negative coverage in xero_pl_lines triggers invariant | unit (invariant) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'negative coverage'` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/xero/fixtures/envisage-fy26.json` — recorded P&L by Month response (D-17)
- [ ] `src/__tests__/xero/fixtures/envisage-fy26-reconciler.json` — recorded single-period FY total (D-17)
- [ ] `src/__tests__/xero/fixtures/jds-fy26.json` — recorded P&L by Month (D-17)
- [ ] `src/__tests__/xero/fixtures/jds-fy26-reconciler.json` — recorded single-period FY total (D-17)
- [ ] `src/__tests__/xero/pl-by-month-parser.test.ts` — covers D-05, D-09, D-16, D-17
- [ ] `src/__tests__/xero/pl-reconciler.test.ts` — covers D-08
- [ ] `src/__tests__/xero/sync-orchestrator.test.ts` — covers D-06, D-07, D-09, D-10
- [ ] `src/__tests__/services/forecast-read-service.test.ts` — covers D-13, D-18
- [ ] `src/__tests__/services/save-and-materialize.test.ts` — covers D-12
- [ ] `src/__tests__/api/cron-sync-all.test.ts` — covers D-11
- [ ] `src/__tests__/components/Step3RevenueCOGS.test.tsx` — covers D-15 (or equivalent wizard step component)
- [ ] `scripts/capture-xero-fixture.ts` — utility for recording new fixtures (modeled on `scripts/diag-envisage.ts`)
- [ ] `scripts/audit-xero-pl-lines-duplicates.ts` — pre-migration audit (one-shot)

*Framework + setup file already exist — no install step required.*

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Envisage Australia smoke test | D-04, D-08 | Validates that the rebuilt sync produces values reconciling 100% to what Matt sees in Xero's "Profit & Loss by Month" report for Envisage. | 1. Trigger `/api/Xero/refresh-pl?businessId=<envisage>`. 2. In Xero web UI, run "Profit & Loss" report by-month for FY26. 3. Open `/finances/forecast` for Envisage; compare every line/month against Xero. 4. Numbers must match within $0.01 per account-month. |
| Just Digital Signage smoke test | D-04 | Same as above, on the canonical happy-path tenant. | 1. Trigger refresh-pl on JDS. 2. Compare wizard P&L tab to Xero by-month report. 3. Match within $0.01. |
| Vercel cron timezone | D-11 | Vercel Cron is UTC; Sydney DST drift requires preview-deploy verification. | Deploy to preview with cron `0 16 * * *` UTC. Observe first trigger time in Vercel logs. Confirm matches 02:00 AEST (or 03:00 AEDT during summer). Adjust schedule if needed. |
| Sparse-tenant wizard UX | D-15 | Visual / interaction quality requires human sign-off. | Open wizard for a sparse tenant (e.g. fresh test business with 4 months Xero data). Confirm coverage banner shows correct range; missing months render as `—`; `$0` real-zero months render as `$0`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
