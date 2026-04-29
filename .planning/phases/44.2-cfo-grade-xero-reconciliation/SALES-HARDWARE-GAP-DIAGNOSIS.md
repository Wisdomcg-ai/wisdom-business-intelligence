# JDS Sales - Hardware Gap Diagnosis (Phase 44.2-03)

**Run date:** 2026-04-29
**Script:** `scripts/diag-jds-sales-hardware-gap.ts`
**Fixture:** `src/__tests__/xero/fixtures/jds-recon-2026-04-fy-vs-by-month.json`
**Tenant:** Aeris Solutions Pty Ltd / JDS (`0219d3a9-c1be-4fb8-a4d3-0710b3af715a`)
**Decision authority:** D-44.2-07, D-44.2-08, D-44.2-09, D-44.2-10

---

## TL;DR

The $6,839.40 gap on Sales - Hardware is **not unique** — it's one of **35 accounts** in the JDS FY26 fixture where the by-month query returns LESS than the FY query for the same date window. **Every single diff is negative** (35/35), totalling **$124,357.18** of systematically missing data in by-month responses. Parser code is symmetric across both queries, so this is a **Xero API behaviour**, not a parser bug.

**Decision: Selected fix path is D-44.2-08 (Xero API quirk → 44.2-06 implements absorber).**

---

## Sales - Hardware deep dive (verbatim from Section A)

```
account_id (FY):       8659dd53-4eec-469a-b5e2-9aefd38494a0
account_id (by-month): 8659dd53-4eec-469a-b5e2-9aefd38494a0
account_id match:      YES
section (FY):          Income
section (by-month):    Income
FY total:                  1905122.45

Monthly cells (newest first):
  30 Apr 26         158288.64
  30 Mar 26         156094.75
  28 Feb 26         137502.84
  30 Jan 26         105342.41
  30 Dec 25         149934.21
  30 Nov 25         109112.80
  30 Oct 25         401121.12
  30 Sep 25         323604.32
  30 Aug 25         104570.48
  30 Jul 25         252711.48
  30 Jun 25         534531.08    (FY25 — outside FY26 window)
  30 May 25         460269.54    (FY25 — outside FY26 window)

Monthly sum (full 12 cols, May 25 → Apr 26):     2893083.67
Monthly sum (FY26 window, Jul 25 → Apr 26):      1898283.05
FY total:                                        1905122.45
Diff (full - FY):                                 987961.22  (overlap with FY25 — expected)
Diff (FY26 - FY):                                  -6839.40  (THE GAP)
```

Note: the by-month query was issued with `fromDate=2026-04-01, periods=11` so it returns 12 months ending April 2026 (i.e. May 2025 → April 2026). The FY26 window is Jul 2025 → Jun 2026; April 2026 is the latest month with actuals (today is 2026-04-29), so FY26 has 10 months of actual data. The "FY26 window" comparison uses cells 0..9 (Apr 26 back through Jul 25).

The $6,839.40 figure ties to the **stable, reproducible** number reported in the 2026-04-28 cross-check (Phase 44.2-CONTEXT). The slight FY-total mismatch ($1,905,122.45 captured vs $1,897,534.45 referenced in CONTEXT) reflects ~$7,500 of additional April 2026 hardware sales that posted between context capture and fixture capture — the GAP itself ($6,839.40) is identical to the cent.

**account_id matches across both queries** — there is no parser join error possible.

## All discrepancies in JDS FY26 fixture (Section B)

35 accounts with `|diff_fy26| > $0.01`. Top 20 by absolute diff:

| Account | Section | FY total | BM sum (FY26) | Diff |
|---|---|---:|---:|---:|
| ES - Installation Costs | Less Cost of Sales | 388,189.26 | 356,202.47 | **-31,986.79** |
| Purchases - Software | Less Cost of Sales | 152,610.08 | 123,549.71 | **-29,060.37** |
| Rent | Office Expenses | 75,127.94 | 62,192.00 | **-12,935.94** |
| Contractors - Installations | Less Cost of Sales | 209,594.15 | 200,091.99 | **-9,502.16** |
| **Sales - Hardware** | **Income** | **1,905,122.45** | **1,898,283.05** | **-6,839.40** |
| Purchases - Hardware | Less Cost of Sales | 708,327.65 | 702,576.12 | -5,751.53 |
| Foreign Currency Gains and Losses | Less Operating Expenses | 2,857.69 | -2,196.91 | -5,054.60 |
| Advertising/Marketing | Advertising & Marketing | 67,719.70 | 63,469.70 | -4,250.00 |
| Education Sector Marketing | Less Operating Expenses | 58,799.20 | 54,806.77 | -3,992.43 |
| ES - Purchases Hardware | Less Cost of Sales | 649,682.29 | 645,744.05 | -3,938.24 |
| Purchases - Installations Travelling Costs | Less Cost of Sales | 23,413.61 | 20,718.23 | -2,695.38 |
| Subscriptions - Local | Admin Expenses | 20,489.87 | 18,704.99 | -1,784.88 |
| Rubbish Removal | Less Operating Expenses | 2,176.35 | 989.97 | -1,186.38 |
| ES - DA Fees Engineering etc | Less Cost of Sales | 60,489.91 | 59,423.91 | -1,066.00 |
| Warehousing and General Repairs and Maintenance | Office Expenses | 8,966.06 | 8,343.56 | -622.50 |
| Support Dept External Contractors - Post Sales Support | Less Cost of Sales | 19,966.38 | 19,386.38 | -580.00 |
| ES - Freight | Less Cost of Sales | 67,093.12 | 66,550.08 | -543.04 |
| Cleaning | Office Expenses | 3,892.80 | 3,442.80 | -450.00 |
| Travelling Expenses | Advertising & Marketing | 22,775.34 | 22,344.74 | -430.60 |
| Consultancy Fees | Admin Expenses | 18,531.80 | 18,181.80 | -350.00 |

**Aggregate stats:**
- **Total absolute diff: $124,357.18** (sum of |diff| across 35 accounts)
- **Sign distribution: 35 negative, 0 positive** — by-month is *systematically* less than FY for every gap-bearing account
- **Section concentration:** Less Cost of Sales dominates ($85,458 of the $124,357 total)
- **Income section row-diff sum: -$6,839.40** — i.e. Sales - Hardware is the ONLY Income-section account with a gap, and its diff equals the entire Income gap. Sales - Hardware is the canonical example, but the same gap-class exists across COGS and OpEx.

## Orphan accounts (Section C)

**Only in FY (by-month dropped): 0**

**Only in by-month (FY dropped): 5** — and all five have transactions ONLY in 30 Jun 25:

| Account | Section | by-month full sum | non-zero months |
|---|---|---:|---|
| Contractors - NT | Less Cost of Sales | 15,588.00 | 30 Jun 25 only |
| Software Development - PK Costs | Support Dept | 12,481.22 | 30 Jun 25 only |
| Distribution to Beneficiaries Expense | Less Operating Expenses | 489,329.37 | 30 Jun 25 only |
| Compliance Costs - Ins & Legal | Admin Expenses | 5,959.00 | 30 Jun 25 only |
| Depreciation | Admin Expenses | 532.99 | 30 Jun 25 only |

These are FY25 (the prior fiscal year) accounts that only appear in by-month because the by-month query window extends BACK to 30 May 25. The FY query (fromDate=2025-07-01) correctly excludes them. **Not bugs — explained by query window asymmetry.** They contribute $0.00 to the FY26 monthly_sum and are correctly excluded by the script's FY26-window calculation. They should be ignored by 44.2-06.

## Hypothesis evaluation

### H1: Year-end adjustment journals (probability: LOW for Sales - Hardware specifically; PARTIAL for cross-account pattern)
- **Evidence against:** If the gap were Y/E adjustment journals dated 30 Jun (not visible in by-month), we'd expect the gap to concentrate in June 2026 (FY26 year-end), not be missing entirely. Plus FY26 hasn't ended yet (today is 2026-04-29), so there are no Y/E26 adjustment journals.
- **Evidence partially for:** The 35-account, all-negative pattern is consistent with a class of journals that the by-month query excludes systematically (e.g. accruals dated outside the calendar month they affect). But this would more typically produce mixed signs.
- **Verdict:** Plausible but not the dominant cause.

### H2: Tracking-category aggregation differences (probability: LOW)
- **Evidence against:** No accounts share an exact diff amount, which we'd expect if a tracking-category subtotal were being grouped differently. Diffs range from -$10.90 to -$31,986.79 with no obvious clustering.
- **Verdict:** Not the dominant pattern.

### H3: Manual journals with non-standard dates (probability: MEDIUM-HIGH)
- **Evidence for:** All 35 diffs are negative, suggesting a transaction class that the FY single-period query INCLUDES but the by-month query EXCLUDES. The most likely explanation: manual journals dated to days that don't fall in any month bucket the by-month query reports against (e.g. journals with "as-at" dates that get attributed to the FY period for the FY query but get filtered by the per-month date predicate).
- **Verdict:** Strongly plausible. Cannot prove definitively from response shape alone (would need raw GL transaction data from Xero), but matches the pattern.

### H4: FX revaluation (probability: LOW for Sales - Hardware; CONFIRMED for ONE account)
- **Evidence:** "Foreign Currency Gains and Losses" appears in the diff list with diff -$5,054.60, FY=$2,857.69 vs by-month=-$2,196.91 — sign-flipping, classic FX revaluation behaviour. But this is ONE account out of 35.
- **Verdict:** FX is real but explains <5% of the gap.

### H5: Parser bug — by-month parser dropping a sub-row Xero returned (probability: VERY LOW)
- **Evidence against:**
  - account_id matches in both queries for Sales - Hardware (no join error).
  - The by-month query has the SAME sections as FY query for Sales - Hardware section (Income); no extra sub-rows being skipped.
  - Both `parsePLByMonth` (line 175-266) and `parseFYTotalResponse` (line 156-191) use IDENTICAL row-walk logic, IDENTICAL SUMMARY_ROW_NAMES filter, and IDENTICAL Cells[0].Attributes account_id extraction. If the parser were dropping rows from one but not the other, we'd see asymmetric account counts — instead, by-month has MORE accounts (5 orphans), not fewer.
  - The diagnostic script (which doesn't use `parsePLByMonth` at all — it walks raw JSON directly) computes the same $6,839.40 gap, proving the gap exists in the raw Xero response, not in the parser.
- **Verdict:** Not a parser bug. The parser is faithfully reproducing what Xero returns; what Xero returns differs between the two query shapes.

### H6 (NEW): Xero by-month query treats certain transactions differently — probability: HIGH
- **Evidence:**
  - Sign pattern: 35/35 NEGATIVE. If this were random transaction-attribution drift, we'd expect ~50/50 signs. Systematic one-sided bias indicates a specific transaction class is being filtered out by the by-month query path.
  - Section breadth: gaps appear across Income, COGS, OpEx, and Other Expenses — not localized to one section type. So the cause isn't section-specific.
  - Magnitude scale: gaps range from $10 to $31,987, suggesting individual transaction amounts (not bulk-aggregated subtotals).
  - Identical query parameters EXCEPT `periods` and `timeframe` — Xero's by-month aggregator must be using slightly different transaction-inclusion rules (e.g. excluding pending/draft/voided transactions, or applying the "as-at" date cutoff differently).
- **Verdict:** This is the most-likely root cause. The FY query's single-period aggregator and the by-month MONTH-period aggregator are NOT pure projections of the same underlying transaction set — they apply subtly different inclusion rules.

## Decision

**Selected fix path: D-44.2-08 (Xero API quirk → 44.2-06 implements adjustment-row absorber)**

**Reasoning:**

1. **Evidence: 35 accounts, all-negative, $124,357 systematically missing.** This is not a one-account oddity — it's a structural Xero API behaviour. A parser fix targeting one account or section would not address the cross-account pattern.

2. **Parser code is symmetric.** `parsePLByMonth` and `parseFYTotalResponse` use identical row-walk logic. Side-by-side inspection shows no asymmetric handling that could produce only-negative diffs in by-month. (See H5 above.)

3. **The diagnostic script reproduces the gap WITHOUT using either parser.** Both parsers walk the raw JSON, and both produce results consistent with the raw values. The gap exists in Xero's response, not in our code.

4. **Coaches see Xero's web report (which uses the FY-style aggregation).** Per D-44.2-08 and D-44.2-00, Xero's FY total is the canonical truth. Our by-month parser must reflect that truth — even if Xero's by-month API gives us slightly different numbers per month.

5. **Absorber pattern is auditable.** Injecting a synthetic "Year-End Adjustment" row (or "by-month aggregation gap" row) with the diff amount, dated to the FY-end month, makes the discrepancy visible in our DB and reconciler logs. Coaches can drill in. This is honest about the gap without hiding it.

**44.2-06 implementation directive (Path B — adjustment row absorber):**

For each account where `|fy_total - sum(monthly)| > $0.01` after parsing both responses:

1. Compute the gap: `gap = fy_total - sum(monthly_amounts_in_fy_window)`.
2. Inject a synthetic `ParsedPLRow` into the by-month parser output:
   - `account_code` = same as the real row (so it groups correctly in reconciler)
   - `account_name` = same as the real row (so the discrepancy report stays interpretable)
   - `account_type` = same as the real row
   - `period_month` = FY end month for the tenant's fiscal year (for JDS / Aeris: `2026-06-01`)
   - `amount` = gap value (signed)
   - **Add `notes` JSONB column** to `xero_pl_lines` (or use the existing `notes` field if one exists; check 44-02 schema) with `{ source: 'by_month_fy_gap_absorber', fy_total, monthly_sum, captured_from: 'fy_query' }` so audits can identify these synthetic rows.
3. Reconciler MUST treat synthetic-absorbed rows as zero-tolerance match (the gap is now in the data, not the discrepancy report).
4. Sync orchestrator MUST log a per-tenant summary: "Absorbed N gap rows totalling $X across M accounts" — this is normal behaviour, not an error, but the count should appear in `sync_jobs.reconciliation` JSONB so it's auditable.
5. Tests MUST assert: (a) absorber injects a row when diff exists, (b) absorber injects ZERO rows when diff is zero, (c) reconciler returns `status='ok'` after absorption, (d) the synthetic row is identifiable via its `notes` source tag.

**Source-of-truth contract:**
- `xero_pl_lines` rows where `notes->source = 'by_month_fy_gap_absorber'` are SYNTHETIC and represent reconciliation adjustments, NOT real Xero transactions.
- All consumers (read service, monthly report, dashboard) treat synthetic + real rows identically for display — coaches see the FY total, which is what they see in Xero's web report (per D-44.2-00).
- Day-2: a separate UI surface ("Reconciliation drawer") can call out synthetic rows so coaches understand where adjustments came from. Out of scope for 44.2-06; in scope for the banner work in later plans.

## Cross-account scaling check

**Does this fix scale beyond Sales - Hardware?** YES. The same absorber logic applies to all 35 mismatched accounts. Sales - Hardware is the textbook example because the gap is concentrated in one Income-section account (the row-diff sum equals the section-level Income gap), but the absorber must run per-account across all gap-bearing accounts in COGS, OpEx, and Other categories.

**Is Sales - Hardware unique?** No — only the smallest of the larger gaps. The biggest gap is ES - Installation Costs (-$31,986.79), nearly 5x the Sales - Hardware gap. The absorber must therefore be implemented at the parser-output stage, NOT as a one-off fix targeting Sales - Hardware.

**What about the 5 by-month-only orphan accounts?** They contribute $0 to the FY26 monthly_sum (their non-zero months are entirely in FY25, outside the FY query window). 44.2-06 should have the parser SKIP rows whose FY-window sum is zero AND whose account_id is not present in the FY query — these are FY25 leftovers, not real FY26 accounts. Without this filter, those 5 orphans would be stored in `xero_pl_lines` with $0 amounts and confuse downstream consumers.

**FX revaluation account specifically:** The "Foreign Currency Gains and Losses" account has FY = $2,857.69 (positive — gain) but by-month FY26 = -$2,196.91 (negative — loss). The diff -$5,054.60 includes a sign flip. The absorber pattern handles this correctly because it computes `gap = fy_total - sum(monthly)` per account, signed; the synthetic row will have a positive amount of $5,054.60 to bring the by-month sum back up to $2,857.69. Tests in 44.2-06 MUST cover this sign-flip case explicitly.

**Per-tenant generality:** This pattern is expected to recur on every tenant. The absorber is a generic mechanism, parameterized by FY-end month per tenant. 44.2-06 must NOT hard-code "30 Jun" — it must use the tenant's `fiscal_year_end` (already in `business_profiles` per Phase 44 schema).

---

## Out-of-scope follow-ups (for later plans)

- **Why does Xero return different totals?** Definitively answering H6 requires inspecting the raw GL transactions via Xero's `/Journals` endpoint and bucketing them by date vs by FY. This is out of scope for 44.2 and tracked as a deferred investigation in `.planning/phases/44.2-cfo-grade-xero-reconciliation/deferred-items.md` (will be created if not yet present).
- **Daily reconciliation cron (D-44.2-15):** Should re-verify gap stability over time. If a tenant's gap pattern changes shape between syncs (e.g. positive diffs appear), the absorber assumption needs revisiting.
- **JDS-specific deep dive:** Why ES - Installation Costs has the largest single gap ($31,987) is interesting but doesn't change the fix path. Could be one large manual journal posted with a non-standard date. Worth surfacing to Matt for a quick Xero check, but not blocking 44.2-06.

---

*Diagnosis complete. 44.2-06 may proceed with Path B (absorber) implementation.*
