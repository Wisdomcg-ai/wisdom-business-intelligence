---
status: diagnosed
trigger: "JDS Step 2 still not matching Xero after multiple fixes (#136, #138, #139, #141). Cache cleared. Server-side issue suspected."
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
---

## Current Focus

hypothesis: P0-10 reclassifier in historical-pl-summary.ts ('rental income' substring) is reclassifying JDS's "Sales - Rental Income" account ($70,633 in FY25) out of operating revenue into other_income, while Xero's P&L report keeps it in Revenue. This creates a $70,633 revenue mismatch on Step 2.
test: Direct sum of xero_pl_lines vs getHistoricalSummary() output, account-by-account
expecting: Identify exact accounts dropped/reclassified
next_action: Report findings (diagnose-only)

## Symptoms

expected: Step 2 prior-year revenue/COGS/OpEx in wizard equals Xero P&L report for prior fiscal year (FY25 for FY27 forecast, FY24 for FY26 forecast)
actual: Step 2 numbers don't match Xero P&L for JDS
errors: No errors reported - just numerical mismatch
reproduction: Open JDS forecast wizard (FY27 1a03be71-... or FY26 58f5a43c-...) → Step 2 → numbers don't match Xero
started: Persisting after #136, #138, #139, #141; user has cleared browser cache

## Eliminated

- hypothesis: dual-id resolver returns wrong tenant
  evidence: resolveBusinessIds correctly returns both [profileId=900aa935..., bizId=fea253dd...] and the service queries .in('business_id', ids.all). xero_pl_lines for JDS exclusively under 900aa935 (1496 rows, 0 under fea253dd) but the .in query finds them.
  timestamp: 2026-05-08

- hypothesis: wrong period boundary (FY25 vs CY25 vs FY27)
  evidence: Service returns start=2024-07 end=2025-06 months=12 for FY27 forecast (planning-season extended path → baseline = currentFY-1 = FY2025). Boundary correct.
  timestamp: 2026-05-08

- hypothesis: byMonth missing → falling back to seasonality
  evidence: revenue_by_month has all 12 keys 2024-07..2025-06 with real (non-synthetic) values. seasonality_pattern is computed from real byMonth.
  timestamp: 2026-05-08

- hypothesis: long→wide pagination dropping rows (the 44.1 hotfix bug)
  evidence: Service revenue total ($9.84M) + reclassified $70,633 = $9.91M = direct xero_pl_lines total. No data lost in aggregation. Pagination loop in fetchAllXeroRows is finding all 788 FY25 rows.
  timestamp: 2026-05-08

- hypothesis: stale forecast_pl_lines (D-18 freshness)
  evidence: D-18 IS violated (computed_at 2026-05-07 23:10 < updated_at 2026-05-08 02:12, delta -10905s). But STRICT_INVARIANTS=false so it logs and returns rows. AND historical-pl-summary uses composite.rows (xero data) not forecast_rows for prior_fy aggregation. The stale forecast_pl_lines DON'T affect Step 2's prior-year totals.
  timestamp: 2026-05-08

## Evidence

- timestamp: 2026-05-08
  checked: ID resolution for JDS
  found: businesses.id=fea253dd-3dfa-447b-8f9b-8dff68aeac0a, business_profiles.id=900aa935-ae8c-4913-baf7-169260fa19ef. xero_connections under fea253dd (active, tenant Aeris Solutions Pty Ltd, expires 2026-05-08T02:42 UTC). xero_pl_lines under 900aa935 (1496 rows). financial_forecasts.business_id=900aa935.
  implication: All routes need dual-id resolution. resolveBusinessIds caches both. Service queries .in('business_id', [profileId, bizId]) correctly.

- timestamp: 2026-05-08
  checked: Direct xero_pl_lines aggregate for FY25 (2024-07..2025-06)
  found: 788 rows. Revenue=$9,910,955 COGS=$6,097,303 OpEx=$3,814,303 Other Income=$651 (just "Interest Income"). Net=$0 by construction.
  implication: Ground truth for what wizard SHOULD show for FY25 prior year.

- timestamp: 2026-05-08
  checked: getHistoricalSummary(JDS_BUSINESSES_ID, 2027) — exact wizard call path
  found: has_xero_data=true. Revenue=$9,840,323 COGS=$6,097,303 OpEx=$3,814,303 Other Income=$71,284. start=2024-07 end=2025-06 months=12. revenue_by_month populated (all 12 keys). seasonality_pattern computed.
  implication: Service path works (fiscal year boundary correct, byMonth not missing) BUT revenue is short by $70,633 and other income is over by exactly $70,633.

- timestamp: 2026-05-08
  checked: Account-by-account diff DB-vs-service
  found: Only "Sales - Rental Income" ($70,633 in revenue table) is missing from service revenue_lines. "Interest Income" ($651, classified as other_income upstream) correctly excluded from revenue_lines.
  implication: Single reclassification: "Sales - Rental Income" being demoted to other_income.

- timestamp: 2026-05-08
  checked: historical-pl-summary.ts:217-238 (P0-10 reclassifier)
  found: OTHER_INCOME_NAME_PATTERNS includes 'rental income' (line 228). looksLikeOtherIncome() does a case-insensitive substring match. "Sales - Rental Income".toLowerCase().includes('rental income') → TRUE. So even though Xero classifies it as revenue (account name starts with "Sales -"), the reclassifier moves it to other_income.
  implication: ROOT CAUSE for the $70,633 gap. Pattern was added with comment "unless rent is core revenue (rare for SMB clients)" — but JDS rents digital signage hardware to clients, so rental IS operating revenue for them.

- timestamp: 2026-05-08
  checked: D-18 freshness invariant for FY27 forecast
  found: forecast_pl_lines.computed_at = 2026-05-07T23:10:15Z. financial_forecasts.updated_at = 2026-05-08T02:12:00Z. delta = -10905s (negative = stale by ~3 hours). STRICT_INVARIANTS env var = unset (default false), so service logs to Sentry but still returns rows.
  implication: NOT the immediate cause of the Step 2 mismatch (Step 2 reads xero_pl_lines composite, not forecast_pl_lines), but is an INDEPENDENT issue: the FY27 forecast was edited at 02:12 today and the forecast_pl_lines have not been recomputed. Step 4-9 numbers (which DO read forecast_pl_lines) will be stale. Sentry should be tagging `invariant_violation_logged: forecast_freshness` for this forecast.

- timestamp: 2026-05-08
  checked: Tenant scope in xero_pl_lines
  found: Only one tenant_id (0219d3a9-c1be-4fb8-a4d3-0710b3af715a, "Aeris Solutions Pty Ltd"). No cross-tenant double-count.
  implication: Multi-tenant aggregation bugs not at play here.

- timestamp: 2026-05-08
  checked: FY26 active forecast lookup
  found: ID 58f5a43c not found by exact match. Service path for fiscal_year=2026 still returns same FY25 baseline (Revenue $9,840,323) — same reclassification gap.
  implication: Bug is fleet-applicable to ANY forecast that has Rental Income as core revenue, NOT JDS-specific to one forecast.

- timestamp: 2026-05-08
  checked: git log of historical-pl-summary.ts and recent fix PRs
  found: P0-10 reclassifier introduced in commit 23e1baab "fix(56): exclude other-income patterns from revenue baseline (P0-10)" (Phase 56). PRs #136 ("stop rebuilding lines on hard-refresh"), #138, #139, #141 (today's work) do NOT touch historical-pl-summary.ts. Bug pre-existed all of today's work — it's been latent since Phase 56.
  implication: Today's fixes did not regress this; they don't address it either. The bug surfaces only when a tenant has "Rental Income" / similar in their core operating Sales lines, or when the user reconciles Step 2 vs Xero closely enough to spot a $70K gap.

## Resolution

root_cause: |
  src/lib/services/historical-pl-summary.ts:228 — the OTHER_INCOME_NAME_PATTERNS list contains the substring 'rental income'. The looksLikeOtherIncome() function (lines 235-238) does a case-insensitive substring match on account_name. JDS has an account literally named "Sales - Rental Income" that Xero classifies as operating revenue (it's coded as a Sales account in their CoA — JDS rents digital signage hardware to clients, so this is core operating revenue, not non-operating "other income"). The reclassifier silently demotes this $70,633 from revenue to other_income, producing a $70,633 revenue gap vs Xero's P&L report.

  This is a cross-tenant blast radius — any business with "Rental Income" / "Rental Revenue" / similar in their core-operations Sales section will see the same underreporting. The original P0-10 comment ("unless rent is core revenue (rare for SMB clients)") explicitly acknowledged this trade-off but the heuristic has no opt-out.

fix: |
  Tighten the rental-income heuristic so it only fires on accounts that look like
  non-operating rental income, not on operating Sales lines. Three options ranked
  by safety:

  Option A (RECOMMENDED — minimal, surgical):
    Remove 'rental income' from OTHER_INCOME_NAME_PATTERNS. The upstream catalog
    classifier (xero_type / sync mapSectionToType) already places rental income
    correctly when Xero's CoA categorizes it as "Other Income" via report
    section. The defensive substring match is too aggressive for tenants like JDS
    where rental IS core revenue.

    Diff (1 line removed):
      -  'rental income',   // unless rent is core revenue (rare for SMB clients)

  Option B (safer for property-focused businesses): keep 'rental income' but
  guard with negative match — skip reclassification when account_name starts
  with 'sales' (case-insensitive) since that signals upstream is treating it as
  operating revenue:
      function looksLikeOtherIncome(accountName: string): boolean {
        const n = accountName.toLowerCase();
        if (n.startsWith('sales')) return false;  // operating revenue, trust upstream
        return OTHER_INCOME_NAME_PATTERNS.some(p => n.includes(p));
      }

  Option C (full fix, more work): make the heuristic per-business — store a
  business_profiles.core_revenue_keywords array and intersect against it.
  Beyond this PR.

verification: pending — apply fix in separate PR, re-run scripts/diag-jds-pl-summary-recon.ts, expect ΔRevenue ≈ $0 and ΔOther Income ≈ $0.

files_changed: []
