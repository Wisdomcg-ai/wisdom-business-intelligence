# Phase 70 — Month-End Reporting Audit

**Date:** 2026-05-30
**Scope:** Steps 1-6 of Matt's month-end process (unreconciled review, multi-page PDF, variance commentary, payroll vs budget, subscription summary, cashflow + BS)
**Clients audited:** Envisage, Just Digital, IICT (Hong Kong consolidated)
**Goal:** Determine whether WisdomBI can replace Calxa for monthly reporting today, and what blocks it.

## Verdict

**Not production-ready for Calxa migration in current state.**

- 3 P1 code bugs that break wages, subscription, and draft-save flows for every client
- 5 cross-cutting data-quality issues that mean **none** of the 3 sampled clients can generate a fully populated month-end PDF today
- Multiple Calxa-parity scope gaps in commentary breadth, vendor visibility, and PDF templating
- Phase 67's unique-active-forecast enforcement was not backfilled — dirty data in production
- Phase 53 Xero token durability work appears to be failing for these tenants (all expired 3-7 days)

**Recommended sprint length:** 2-3 weeks to ship Phase 71 (fixes) + Phase 72 (data backfill) before any Calxa migration begins.

---

## P1 Production-Blocker Bugs (code)

### B1. Wages-detail employee name matching is brittle
**File:** [src/app/api/monthly-report/wages-detail/route.ts:481](src/app/api/monthly-report/wages-detail/route.ts#L481)
**Bug:** Forecast employee names compared to Xero PayRun names via `normEmployeeName` (basic trim/lowercase). "John Smith" vs "Smith, John" never match. Result: same employee appears in two rows — Xero side has actual but no budget, forecast side has budget but zero actual. Total budget variance breaks.
**Severity:** Hits Step 4 directly.
**Fix:** Token-based matching (sort tokens, compare) or Levenshtein distance ≥0.85 threshold. Add Sentry log when fallback fires so we can see which names diverge in practice.

### B2. Subscription vendor-key normalization mismatch
**Files:** [subscription-detail/route.ts:184](src/app/api/monthly-report/subscription-detail/route.ts#L184) and [commentary/route.ts:293](src/app/api/monthly-report/commentary/route.ts#L293)
**Bug:** Two different vendor normalization functions. Vendors entered into `subscription_budgets` never key-match against vendors extracted from Xero bank transactions. Result: every vendor looks unbudgeted in the variance commentary.
**Severity:** Hits Steps 3 + 5.
**Fix:** Consolidate to one shared util in `src/lib/vendor-normalization.ts`. Add round-trip test.

### B3. "Proceed as Draft" does not persist the draft
**File:** [page.tsx:1123](src/app/finances/monthly-report/page.tsx#L1123) and [ReconciliationGate.tsx](src/app/finances/monthly-report/components/ReconciliationGate.tsx)
**Bug:** Clicking "Proceed as Draft" generates the report in memory only. Auto-save watches `commentary`, which is empty on a freshly-generated draft. Closing the tab = report lost.
**Severity:** Common workflow: 5th-business-day, recs incomplete, coach proceeds as draft, walks away. Report disappears.
**Fix:** Save a snapshot row immediately on Proceed-as-Draft with `status='draft'`. Auto-save then updates that row instead of creating it lazily.

---

## P1 Data-Quality Issues (affect all 3 clients + likely all 18)

### D1. Phase 67 unique-active-forecast enforcement not backfilled
**Evidence:** Envisage has 2 active forecasts (FY26 + FY27). JDS has 2 active forecasts. Phase 67 added a unique constraint, but pre-existing duplicates were never resolved.
**Impact:** Wages tab and commentary lookup `budget_forecast_id` — ambiguous lookup pulls the older or wrong row. JDS's active FY26 forecast has zero `forecast_pl_lines` so variance dashboard is empty even though a "good" FY27 exists.
**Fix:** Migration script that deactivates older forecasts in conflict, picks the most recent + most-populated as the canonical active.

### D2. `forecast_payroll_summary` is empty on every active forecast
**Evidence:** 0 rows on all three clients despite Envisage having 6 `forecast_employees` rows.
**Impact:** Wages tab roll-up is unwired across the entire production set. Even fixing B1 (name matching) doesn't help if there's no budget side to compare against.
**Fix:** Backfill script that recomputes `forecast_payroll_summary` from `forecast_employees` for every business. Wire forecast wizard save flow to keep these in sync going forward.

### D3. `subscription_budgets.renewal_month` is NULL everywhere
**Evidence:** 44/44 Envisage, 47/47 JDS, 0 rows IICT.
**Impact:** Any renewal-month feature non-functional. `current_fy_spend` only partially backfilled on JDS.
**Fix:** If renewal-month is actually used downstream, backfill from vendor metadata + Xero billing cadence. If not, drop the column from queries (don't keep dead UI).

### D4. Snapshot `report_data.sections` uses numeric indexes, not named keys
**Evidence:** All Envisage + JDS snapshots have `sections: ["0","1","2","3"]`. PDF generator expects named keys like `wages_detail` and `subscription_detail`.
**Impact:** Every existing snapshot's PDF would render with empty wages and subscription sections. Users may not even know the report is incomplete.
**Fix:** Inspect the snapshot serializer; if it's outputting numeric keys, fix the writer. Backfill migration to remap existing rows.

### D5. All Xero tokens expired (Phase 53 regression suspect)
**Evidence:** Envisage 7d expired, JDS 4d expired (20d stale), IICT all 3 tenants 3d expired.
**Impact:** Reports cannot be regenerated until tokens are refreshed manually. Phase 53 added durability work — appears to be failing here.
**Fix:** Investigate whether the auto-refresh job is running for these tenants. If yes, why is it not catching pre-expiry? If no, fix the job. This may overlap with Phase 53's existing scope.

---

## P2 Calxa-Parity Scope Gaps

### S1. Variance commentary only triggers on expense lines ≥$500 over budget
**File:** [page.tsx:605](src/app/finances/monthly-report/page.tsx#L605)
**Gap:** Revenue shortfalls, large favourable variances, BS movements all silent. Coaches cannot add narrative to revenue misses.
**Fix:** Expand trigger set. Add Revenue (under-budget ≥$500 or ≥10%), Large favourable expense variances, BS movements ≥ threshold.

### S2. Subscription tab omits accounts/vendors with zero transactions
**File:** [subscription-detail/route.ts:406](src/app/api/monthly-report/subscription-detail/route.ts#L406)
**Gap:** Budget-only vendors (budgeted but didn't bill this month) are invisible. Coaches can't see "we expected Mailchimp $150 but they didn't bill".
**Fix:** Always render budgeted vendors. Show actual as $0 when no transactions. Flag the row visually.

### S3. Wages tab has per-payrun data mapped but no expand UI
**File:** [WagesAnalysisTab.tsx:144-169](src/app/finances/monthly-report/components/WagesAnalysisTab.tsx#L144)
**Gap:** Coach cannot drill into individual pay-run detail without CSV export.
**Fix:** Expandable row showing pay date + gross per pay-run for each employee.

### S4. PDF variance tinting uses string parsing for negative detection
**File:** [monthly-report-pdf-service.ts:423](src/app/finances/monthly-report/services/monthly-report-pdf-service.ts#L423)
**Gap:** Checks for `"()"` in formatted cell to detect negatives. If currency format changes (locale, parens vs minus sign), tinting silently fails.
**Fix:** Track variance polarity on the raw data side, not the formatted display side.

### S5. Balance Sheet has no Assets = Liabilities + Equity check
**File:** [BalanceSheetTab.tsx](src/app/finances/monthly-report/components/BalanceSheetTab.tsx)
**Gap:** Silently displays imbalanced BS. CFO work requires this to be flagged.
**Fix:** Compute equation residual on render; show banner if abs(residual) > $1.

### S6. Multi-tenant non-AUD redirect runs mid-session with no toast
**File:** [page.tsx:116-163](src/app/finances/monthly-report/page.tsx#L116)
**Gap:** Tab silently switches. IICT-HK relevant.
**Fix:** Toast on redirect or breadcrumb showing "switched to consolidated view".

---

## Per-Client Readiness

| Client | Identity | Xero | Forecasts | Subs | Snapshots | Verdict |
|---|---|---|---|---|---|---|
| **Envisage** | ✅ | ⚠️ token 7d expired | ❌ 2 active | ⚠️ 44 budgets, no codes | ⚠️ numeric sections | Closest to ready. Fix tokens + dedupe forecasts + backfill payroll_summary → usable. |
| **JDS** | ⚠️ profile incomplete | ❌ 20d stale, token expired | ❌ FY26 active has 0 lines | ⚠️ 47 budgets | ⚠️ 1 snapshot, numeric sections | Active FY26 forecast is empty → variance dashboard will be blank. Choose: backfill FY26 or deactivate in favour of FY27. |
| **IICT** | ❌ industry/revenue all null | ❌ 3 tenants all expired | ❌ duplicate forecast rows | ❌ 0 budgets | ❌ 0 snapshots ever | Essentially un-onboarded. Highest lift. `consolidation_budget_mode='single'` likely wrong for 3-entity consol. |

---

## Proposed Phase Sequencing

**Phase 71 — Code fixes (B1-B3 + S1-S5)**
- 71-01 Vendor normalization consolidation (B2)
- 71-02 Wages employee name matching with Sentry log (B1)
- 71-03 Proceed-as-Draft persistence + ReconciliationGate refactor (B3)
- 71-04 Commentary scope expansion (S1)
- 71-05 Subscription budget-only vendor visibility (S2)
- 71-06 Wages per-payrun expand row (S3)
- 71-07 PDF variance polarity refactor (S4)
- 71-08 BS equation check + multi-tenant toast (S5 + S6)

**Phase 72 — Data backfill + migration debt**
- 72-01 Unique-active-forecast remediation (D1)
- 72-02 forecast_payroll_summary backfill (D2)
- 72-03 Snapshot sections key remap (D4)
- 72-04 Subscription budgets cleanup (D3 — decide: keep + backfill or drop)
- 72-05 Per-client onboarding cleanup (Envisage / JDS / IICT specific)
- 72-06 Xero token auto-refresh diagnosis (D5 — may extend Phase 53)

**Phase 69 — Forecast wizard extended-period bug** (already drafted)

**Phase 73 — Calxa CSV bulk import** (final, once 71+72+69 ship)

---

## Notes for Phase 71/72 planning

- Re-use the dual-ID lookup pattern from Phase 68 scripts. All forecast/PL tables key by `business_profiles.id`; xero_connections and snapshots key by `businesses.id`.
- Audit script lives at [scripts/phase-70-data-audit.mjs](scripts/phase-70-data-audit.mjs) — reusable for future tenant onboarding health checks.
- Per memory, executors must run scoped tests; full vitest suite has known local timezone-shaped failures that are safe to ignore.
- Per memory, Sentry MCP is read-only. Use it for triage during 71-02 to confirm name-mismatch frequency in production logs after deploy.
