# Phase 71: Month-end reporting code fixes — Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Source:** PRD Express Path — derived from `docs/phase-70-month-end-audit.md` P1 bugs + P2 scope gaps + D4 deferred from Phase 70

<domain>
## Phase Boundary

This is a **CODE fixes phase**. Phase 70 cleaned the data layer; Phase 71 fixes the code that consumes it. Three sub-workstreams from the original month-end audit:

**Workstream B — P1 production bugs (3 items, every-client impact):**
- B1: Wages employee name matching is brittle (string compare → duplicate rows)
- B2: Subscription vendor-key normalization mismatch (2 different normalizers in 2 routes)
- B3: "Proceed as Draft" doesn't persist (close tab = lost report)

**Workstream S — P2 Calxa-parity scope gaps (6 items):**
- S1: Variance commentary triggers only on expense ≥$500 over budget; expand to revenue shortfalls + large favourable + BS movements
- S2: Subscription tab omits accounts/vendors with zero transactions (budget-only vendors invisible)
- S3: Wages per-payrun detail mapped but not expandable in UI
- S4: PDF variance tinting uses fragile `"()"` string parsing for negative detection
- S5: Balance Sheet has no `Assets = Liabilities + Equity` check
- S6: Multi-tenant non-AUD redirect runs mid-session with no toast (IICT-HK relevant)

**Workstream D — D4 deferred from Phase 70:**
- D4: Snapshot `report_data.sections` is using numeric keys (`["0","1","2"]`) instead of named keys (`wages_detail`, `subscription_detail`). PDF generator can't render wages/subs sections. Bundle the serializer fix with a data remap migration for existing rows.

**This phase covers:** 10 distinct items above. Bundled because they all touch the monthly-report code surface and several share files.

**This phase does NOT cover:**
- Calxa CSV bulk import (separate downstream phase)
- Forecast wizard extended-period bug (Phase 72)
- JDS / IICT onboarding (deferred to coach sessions, scripts ready)

</domain>

<decisions>
## Implementation Decisions

### Methodology (locked)
- **TDD where reasonable:** every code fix ships with regression tests that would have caught the bug.
- **Scoped vitest** per memory `feedback_executor_scoped_tests`: don't run full suite (timezone-shaped failures); run per-file vitest scoped to the changes.
- **Per-fix commit cadence:** one commit per bug/gap (10 commits + tests). No mega-commits.
- **No data writes outside D4:** B1-B3 and S1-S6 are code-only. D4 has both a code fix AND a backfill (small set of existing snapshot rows to remap from numeric→named keys).

### B1 — Wages employee name matching (locked)
**File:** [src/app/api/monthly-report/wages-detail/route.ts:481](src/app/api/monthly-report/wages-detail/route.ts#L481)
**Bug:** `normEmployeeName` is basic trim/lowercase. "John Smith" vs "Smith, John" never match.
**Fix:** Token-based matching:
1. Split into tokens, lowercase, strip punctuation
2. Sort tokens alphabetically
3. Join → compare
4. If still no exact match, fallback to Levenshtein distance ≤0.15 of total length (tolerates typos)
5. On fallback match, log to Sentry with `xero_payroll_name_fuzzy_match` invariant containing both names so we can see real-world divergence patterns
**Acceptance:**
- Regression test: "John Smith" matches "Smith, John" matches "smith john"
- Regression test: "Jonh Smith" (typo) matches "John Smith" via Levenshtein
- Regression test: "John Smith" does NOT match "Jane Doe"
- Sentry invariant fires when fallback match wins

### B2 — Vendor-key normalization consolidation (locked)
**Files:** [subscription-detail/route.ts:184](src/app/api/monthly-report/subscription-detail/route.ts#L184) (`createVendorKey`) and [commentary/route.ts:293](src/app/api/monthly-report/commentary/route.ts#L293) (`extractVendorInfo`)
**Bug:** Two different normalization functions. Vendors entered in `subscription_budgets` never key-match against extracted Xero vendors in commentary.
**Fix:**
- Note: `src/lib/utils/vendor-normalization.ts` already exists (Phase 70 70-04 imported from it). Confirm it has the canonical `createVendorKey`.
- Delete the duplicate in `subscription-detail/route.ts` and `commentary/route.ts`; import from the shared util.
- Add lint rule (eslint custom or just a regression test) that fails if anyone re-implements vendor normalization in a route.
- Add a round-trip test: vendor_name → vendor_key → display_name → vendor_key (idempotent).
**Acceptance:**
- Grep confirms only ONE definition of `createVendorKey` lives in `src/lib/utils/vendor-normalization.ts`.
- Both routes import + use the shared util.
- Round-trip test passes.

### B3 — Proceed-as-Draft persistence (locked)
**Files:** [src/app/finances/monthly-report/page.tsx:1123](src/app/finances/monthly-report/page.tsx#L1123), [ReconciliationGate.tsx](src/app/finances/monthly-report/components/ReconciliationGate.tsx), `useAutoSaveReport` hook
**Bug:** Clicking "Proceed as Draft" generates report in memory. Auto-save watches commentary (empty on fresh draft). Closing tab loses the report.
**Fix:** 
1. On "Proceed as Draft" click → immediately POST to `/api/monthly-report-snapshots` with `status='draft'`, `is_draft=true`, current report data.
2. Auto-save then updates that row instead of creating it lazily.
3. UI: show a "Saved as draft" toast on initial save success so coach has confidence.
**Acceptance:**
- E2E or unit test simulates: generate draft → close tab → reopen → snapshot exists at status='draft'
- Toast appears on initial draft save
- No regression to existing happy-path (reconciled + finalize works as before)

### S1 — Commentary scope expansion (locked)
**File:** [src/app/finances/monthly-report/page.tsx:605](src/app/finances/monthly-report/page.tsx#L605) (trigger), [/api/monthly-report/commentary/route.ts](src/app/api/monthly-report/commentary/route.ts) (handler)
**Bug:** Commentary fires only on `expense_lines` where `variance_amount ≤ -500` (expenses ≥$500 over budget).
**Fix:** Expand trigger set:
- Expense over-budget: ≥$500 (current)
- Revenue under-budget: ≥$500 OR ≥10% (whichever is greater)
- Large favourable expense variance: ≥$500 under-budget AND ≥20% of budget (catches "spend dropped significantly")
- BS movements: any line where MoM change ≥ $5,000 OR ≥10% of opening balance
Each trigger should produce a commentary row with a `trigger_reason` field so coach knows WHY it appeared.
**Acceptance:**
- Regression test for each trigger type
- Existing expense-over-$500 trigger still fires unchanged

### S2 — Subscription budget-only vendors visible (locked)
**File:** [subscription-detail/route.ts:406](src/app/api/monthly-report/subscription-detail/route.ts#L406)
**Bug:** Response filters out accounts with zero transactions. Budget-only vendors (budgeted but didn't bill this month) are invisible.
**Fix:**
- Always render budgeted vendors in the response.
- For vendors with no actual transactions in the month: show `actual=$0`, `prior_actual=null`, `transaction_count=0`.
- Flag visually with a "not billed this month" badge in the UI.
**Acceptance:**
- Regression test: budgeted vendor with no transactions appears in response with $0 actual.
- UI test: badge renders for $0-actual budget-only vendors.

### S3 — Wages per-payrun expand UI (locked)
**Files:** [WagesAnalysisTab.tsx:144-169](src/app/finances/monthly-report/components/WagesAnalysisTab.tsx#L144) (already maps payByDate per employee, no expand UI)
**Bug:** Per-employee detail visible, per-payrun within employee is not.
**Fix:**
- Add expandable row per employee. Click expand → shows pay date + gross per pay-run for that employee.
- Visual: chevron indicator, soft background for expanded section.
- Mobile-friendly: collapses to bottom sheet on small screens.
**Acceptance:**
- UI test: expand chevron toggles per-payrun detail rendering.
- No regression to existing employee-total display.

### S4 — PDF variance polarity refactor (locked)
**File:** [monthly-report-pdf-service.ts:423](src/app/finances/monthly-report/services/monthly-report-pdf-service.ts#L423) (`applyVarianceTint`)
**Bug:** Checks `cell.raw` text for `"()"` to detect negatives. Brittle if locale formatting changes.
**Fix:** Track variance polarity on the raw data side, not the formatted display side. Pass `is_negative: boolean` as cell metadata; tint reads metadata, not formatted text.
**Acceptance:**
- Regression test: applyVarianceTint correctly tints negative variance even if formatted with minus sign instead of parens.
- No regression to existing paren-formatted variance.

### S5 — Balance Sheet equation check (locked)
**File:** [BalanceSheetTab.tsx](src/app/finances/monthly-report/components/BalanceSheetTab.tsx)
**Bug:** Silently displays imbalanced BS (Assets ≠ Liabilities + Equity).
**Fix:**
- Compute equation residual on render: `assets - (liabilities + equity)`.
- If `abs(residual) > $1`: show red banner at top of tab with the residual amount.
- Banner includes "report imbalance to support" CTA (mailto link).
**Acceptance:**
- UI test: imbalanced BS data triggers banner.
- Balanced BS shows no banner.

### S6 — Multi-tenant non-AUD redirect toast (locked)
**File:** [page.tsx:116-163](src/app/finances/monthly-report/page.tsx#L116) (Phase 67 deferred-redirect logic)
**Bug:** Tab silently switches when isMultiCurrency redirects to consolidated. Confusing for IICT-HK.
**Fix:** When the redirect fires, show a toast: `"Switched to consolidated view — this client has multiple currencies (HKD + AUD)"`. Persist across page reloads via localStorage flag (don't re-fire on every load, only on session entry).
**Acceptance:**
- UI test: simulating IICT-HK first-load shows toast once.
- Subsequent loads within same session do NOT re-fire toast.

### D4 — Snapshot serializer + data remap (locked, deferred from Phase 70)
**Two parts:**

**D4-code:** Find the snapshot serializer that writes `report_data.sections`. Currently outputting numeric indexes (`["0","1","2"]`). Fix to use named keys: `wages_detail`, `subscription_detail`, `commentary`, `balance_sheet`, etc.

**D4-data:** One-off migration script under `scripts/71-D4-snapshot-sections-remap.mjs` that:
1. Reads every `monthly_report_snapshots` row
2. Detects numeric-keyed `sections` field
3. Remaps to named keys based on the section order convention in the new serializer
4. Updates row in-place
5. Dry-run first per Phase 70 methodology
**Acceptance:**
- Grep confirms named keys in newly-generated snapshots
- Migration script idempotent
- All existing snapshots have named keys after run

### Claude's Discretion
- Whether to bundle plans (e.g. B1+B2 share monthly-report API surface — could be one plan)
- Test file organization
- Exact Levenshtein library choice (use existing dependency if present, else inline implementation)

</decisions>

<canonical_refs>
## Canonical References

### Source audit
- `docs/phase-70-month-end-audit.md` — P1 bugs (B1-B3) + P2 gaps (S1-S6) + D4

### Files being modified
- `src/app/api/monthly-report/wages-detail/route.ts` (B1)
- `src/lib/utils/vendor-normalization.ts` + `src/app/api/monthly-report/subscription-detail/route.ts` + `src/app/api/monthly-report/commentary/route.ts` (B2)
- `src/app/finances/monthly-report/page.tsx` + `components/ReconciliationGate.tsx` + `hooks/useAutoSaveReport.ts` (B3)
- `src/app/finances/monthly-report/page.tsx` (S1 trigger) + `src/app/api/monthly-report/commentary/route.ts` (S1 handler)
- `src/app/api/monthly-report/subscription-detail/route.ts` (S2)
- `src/app/finances/monthly-report/components/WagesAnalysisTab.tsx` (S3)
- `src/app/finances/monthly-report/services/monthly-report-pdf-service.ts` (S4)
- `src/app/finances/monthly-report/components/BalanceSheetTab.tsx` (S5)
- `src/app/finances/monthly-report/page.tsx` Phase 67 redirect (S6)
- Snapshot serializer (find via grep — likely in `services/monthly-report-pdf-service.ts` or `lib/monthly-report-snapshot.ts`) (D4)
- `scripts/71-D4-snapshot-sections-remap.mjs` (new)

### Tests
- `src/__tests__/api/wages-detail-employee-matching.test.ts` (new, B1)
- `src/__tests__/lib/vendor-normalization-roundtrip.test.ts` (new, B2)
- `src/__tests__/app/proceed-as-draft-persistence.test.ts` (new, B3)
- `src/__tests__/api/commentary-trigger-expansion.test.ts` (new, S1)
- `src/__tests__/api/subscription-detail-budget-only.test.ts` (new, S2)

### Memory constraints
- Memory `project_dual_id`: dual-ID drift; snapshot tables key by `businesses.id`
- Memory `feedback_executor_scoped_tests`: scoped vitest, not full suite
- Memory `project_super_rate`: not applicable here but noted
- Memory `feedback_git_remote`: push only to wisdom-business-intelligence
- Memory `project_xero_bs_vs_pl_classification`: relevant for any BS/P&L logic touches

</canonical_refs>

<specifics>
## Specific Ideas

### Suggested plan breakdown (10 plans)
Wave assignment driven by file overlap to avoid merge conflicts:

- **71-01 (B2)** — Vendor-normalization consolidation (delete dup, import shared, round-trip test)
- **71-02 (B1)** — Wages employee fuzzy name match + Sentry log + regression test
- **71-03 (B3)** — Proceed-as-Draft persistence (snapshot immediate write + toast + auto-save update path)
- **71-04 (S1)** — Commentary trigger expansion (revenue shortfalls, BS movements, large favourable)
- **71-05 (S2)** — Subscription budget-only vendor visibility
- **71-06 (S3)** — Wages per-payrun expand UI
- **71-07 (S4)** — PDF variance polarity refactor
- **71-08 (S5)** — BS equation check + banner
- **71-09 (S6)** — Multi-tenant redirect toast
- **71-10 (D4)** — Snapshot serializer fix + remap migration script + dry-run/apply

Wave grouping (by file overlap):
- Wave 1: 71-01 (B2 vendor-normalization), 71-02 (B1 wages), 71-07 (S4 PDF), 71-08 (S5 BS banner), 71-09 (S6 toast) — independent files, parallel-safe
- Wave 2: 71-03 (B3 Proceed-as-Draft) + 71-04 (S1 commentary) — both touch page.tsx, depend on Wave 1's vendor-normalization for any commentary-related changes
- Wave 3: 71-05 (S2 budget-only) + 71-06 (S3 expand UI) — independent subscription/wages tab work
- Wave 4: 71-10 (D4 serializer + remap) — could run anytime but cleanest at end so all upstream code is settled

### Acceptance for "phase complete"
- 5+ new regression test files (B1, B2, B3, S1, S2 minimum; S3/S5/S6 may be UI tests)
- All new tests pass via scoped vitest
- Typecheck clean
- Manual smoke test by Matt on at least one client's month-end report PDF + dashboard
- Snapshot remap migration ran successfully (D4-data); all existing snapshots use named keys

</specifics>

<deferred>
## Deferred Ideas

- **Email scheduling automation** (per Phase 70 audit "biggest gaps for Calxa migration") — separate phase
- **Custom Google Sheets / CSV merge into PDF** (bespoke reports) — separate phase
- **Coach-level recon dashboard** (Step 1 of Matt's process — "who's behind on recs across all clients") — separate phase
- **Xero budget import** (vs WisdomBI's CSV import) — separate phase
- **Coach/admin-configurable super rate UI** (carried over from Phase 70) — separate phase
- **Audit-script framing fixes** (4 items from Phase 70 70-08 audit comparison) — 30-min ops touch-up, separate small task

</deferred>

---

*Phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap*
*Context gathered: 2026-05-31 — PRD Express Path from Phase 70 audit + D4 deferred + locked decisions per item*
