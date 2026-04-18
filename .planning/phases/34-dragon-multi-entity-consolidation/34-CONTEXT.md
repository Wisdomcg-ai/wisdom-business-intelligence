# Phase 34: Dragon Multi-Entity Consolidation — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** User discussion + reference PDFs (Dragon + IICT Mar 2026 consolidated reports)

<domain>
## Phase Boundary

Phase 34 delivers multi-entity consolidation — the ability to report across multiple Xero organisations as if they were a single entity. Two real-world consolidations must be supported on day one:

1. **Dragon Consolidation** — Dragon Roofing Pty Ltd + Easy Hail Claim Pty Ltd (2 entities, all AUD, active intercompany transactions)
2. **IICT Consolidation** — IICT (Aust) Pty Ltd + IICT Group Limited (NZ) + IICT Group Pty Ltd (3 entities, includes multi-currency NZD)

Scope is split into three iterations:

- **34.0** — Consolidated P&L with per-entity columns + Combined, FX translation (NZD→AUD), intercompany elimination engine, group/member data model, report selector integration
- **34.1** — Consolidated Balance Sheet (includes intercompany loan eliminations and translation reserve for FX-translated entities)
- **34.2** — Consolidated Cashflow Forecast (per-entity actuals + forecast, combined opening/closing bank balances)

Each iteration ships as a working slice. The user has two consolidations they produce monthly today (as PDF reports) and wants to replace that manual process.

## What is NOT in this phase

- Inter-segment reporting / business segment analysis (not a consolidation)
- Goodwill / purchase price allocation / minority interest (not applicable to user's entities)
- AASB 10 compliance documentation (Phase 35 approval workflow covers audit trail needs)
- Consolidation across different fiscal year-ends (all member entities use same fiscal year)

</domain>

<decisions>
## Implementation Decisions

### Data Model (locked)

**`consolidation_groups` table:**
- `id` (uuid, pk)
- `name` (text, e.g. "Dragon Consolidation", "IICT Consolidation")
- `business_id` (uuid → businesses) — the "parent" business that represents the consolidation in the UI
- `presentation_currency` (text, default 'AUD') — currency for consolidated output
- `created_at`, `updated_at`

**`consolidation_group_members` table:**
- `id` (uuid, pk)
- `group_id` (uuid → consolidation_groups)
- `source_business_id` (uuid → businesses) — the member Xero org
- `display_name` (text, e.g. "IICT (Aust) Pty Ltd")
- `display_order` (int)
- `functional_currency` (text, default 'AUD') — the entity's home currency (e.g. 'NZD' for IICT Group Limited)

**`consolidation_elimination_rules` table (Iteration 34.0):**
- `id` (uuid, pk)
- `group_id` (uuid → consolidation_groups)
- `rule_type` (text: 'account_pair' | 'account_category')
- `entity_a_business_id` (uuid)
- `entity_a_account_code` (text, nullable)
- `entity_a_account_name_pattern` (text, nullable)
- `entity_b_business_id` (uuid)
- `entity_b_account_code` (text, nullable)
- `entity_b_account_name_pattern` (text, nullable)
- `direction` ('bidirectional' | 'entity_a_eliminates' | 'entity_b_eliminates')
- `description` (text)
- `active` (bool, default true)

### Architecture (locked)

- **View-based / computed on read** — no pre-computed consolidation rows stored. Every request to `/api/monthly-report/consolidated` queries `xero_pl_lines` + `forecast_pl_lines` for all member businesses and aggregates live.
- **Re-running after Xero changes works automatically** — next report load reflects latest synced data.
- **Approval snapshot for historical integrity** — when a report is marked `approved` (Phase 35 `cfo_report_status`), a JSONB snapshot of the consolidated output is stored. This solves "we had a meeting, then Xero changed" without blocking live re-runs.

### FX Translation (locked, Iteration 34.0)

- Each member business declares `functional_currency` (default 'AUD')
- When `functional_currency != presentation_currency`, translate P&L lines at the **monthly average rate** (standard IAS 21 / AASB 121 for P&L)
- Balance Sheet lines (Iteration 34.1) translate at **closing spot rate**; translation differences go to a Translation Reserve equity line
- FX rates sourced from `xero_currency_rates` table if present, else from a new `fx_rates` table seeded by a scheduled job pulling RBA/ECB rates
- Applies to IICT Group Limited (NZ) — other entities are AUD so translation is a no-op

### Intercompany Elimination (locked, Iteration 34.0)

- Rules are stored per consolidation group (not hardcoded)
- Two rule types supported on day one:
  - **Account pair** — explicit mapping (e.g. "Dragon Roofing / Referral Fee - Easy Hail" eliminates against "Easy Hail / Sales - Referral Fee")
  - **Account category** — named pattern across entities (e.g. "Dragon / Advertising & Marketing transfers" paired against "Easy Hail / Advertising & Marketing transfers")
- Eliminations apply to P&L in 34.0 and Balance Sheet in 34.1 (intercompany loans)
- A "trial consolidation" diagnostic view lists all intercompany transactions the engine eliminated — so the coach can verify correctness
- V1 rules Dragon needs: Referral fees, Advertising transfers, Intercompany loans (BS)
- V1 rules IICT needs: TBD after member account analysis (commentary suggests mostly none at P&L level; BS has intercompany receivable/payable pairs)

### Report Layout (locked, matches user's PDFs)

**P&L Comparison (per-entity columns):**
```
Account Name | Entity A Actual | Entity B Actual | [Entity C Actual] | Eliminations | Consolidated Actual
```

**Actual vs Budget (consolidated):**
```
Account Name | Budget | Consolidated Actual | Variance | YTD Budget | YTD Actual | YTD Variance | Unspent | Next Month | Annual
```
(Mirrors the single-entity layout the Phase 23 templates already produce)

### UI Integration (locked)

- Report selector shows consolidation groups as selectable entries (alongside single businesses)
- Selecting a consolidation group loads the consolidated view automatically (driven by existing `business_id` query param resolving to a `consolidation_groups.business_id`)
- Monthly report page detects `group_id` context and renders the consolidated P&L Comparison tab in addition to the standard Actual vs Budget tabs
- Template system (Phase 23) applies identically — section toggles, column settings work on consolidated view without modification

### Requirements coverage

- MLTE-01: `consolidation_groups` + `consolidation_group_members` tables ✓
- MLTE-02: three-column layout (Entity A | Entity B | Combined) ✓ — extends to N entities for IICT
- MLTE-03: account alignment by `account_type` with $0 for absent accounts ✓
- MLTE-04: group selection auto-loads consolidated view ✓
- MLTE-05: templates apply identically ✓

### Scope Extensions Beyond Original Roadmap

Original roadmap marked these out of scope for V1; user PDFs reveal they are mandatory for real-world use:

- **Intercompany eliminations** — Dragon report shows active intercompany advertising transfer (±$9,015), referral fees ($818), intercompany loans ($280k–$315k). Without eliminations, Dragon's consolidated numbers double-count.
- **FX translation** — IICT Group Limited is NZ-based. Without NZD→AUD translation, IICT's consolidated numbers are wrong.
- **Balance Sheet consolidation** — User's PDFs include consolidated BS with intercompany loan eliminations visible.
- **Cashflow consolidation** — User's PDFs include consolidated 12-month cashflow forecast per-entity actuals + forecast.

Balance Sheet and Cashflow are split into Iterations 34.1 and 34.2 (delivered incrementally, not deferred indefinitely).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing consolidation scope and requirements
- `.planning/ROADMAP.md` — Phase 34 section (note: scope in roadmap is narrower than CONTEXT.md — CONTEXT supersedes)
- `.planning/REQUIREMENTS.md` — MLTE-01 through MLTE-05 (line 166+, line 274+)

### Phase 23 templates (consolidated reports must apply templates identically)
- `.planning/phases/19-monthly-reporting/` — monthly report template system
- `src/app/api/monthly-report/` — existing report API patterns (extend with `/consolidated` route)

### Phase 27 Balance Sheet (Iteration 34.1 extends this)
- Balance sheet rendering in monthly report — reuse component, add entity column groupings

### Phase 28 Cashflow (Iteration 34.2 extends this)
- `src/lib/cashflow/engine.ts` — cashflow engine; consolidation aggregates per-entity engine outputs
- `src/app/finances/forecast/` — forecast UI (read-only reuse for consolidated view)

### Phase 33 CFO Dashboard (Phase 35 approval hook)
- `supabase/migrations/20260420_cfo_dashboard.sql` — `cfo_report_status` table (approval snapshot target)
- `src/app/cfo/page.tsx` — dashboard that will list consolidated businesses alongside single businesses
- Flag Dragon Consolidation + IICT Consolidation as `is_cfo_client = true` on their parent business rows

### User's reference PDFs (exact layout targets)
- Dragon Consolidated Finance Report Mar 2026 (provided in conversation)
- IICT Consolidated Finance Report Mar 2026 (provided in conversation)

### Xero data sources
- `xero_pl_lines` table — per-business P&L line items (FK to `businesses.id`)
- `xero_balance_sheet_lines` table (Phase 27)
- `xero_accounts` table — account metadata per business
- Business ID resolution: `src/lib/xero/business-id-resolver.ts` (`resolveBusinessIds`)

### FX data (to be implemented in 34.0)
- Xero provides currency rate fields on journal lines where applicable
- If insufficient, add `fx_rates` table keyed by (currency_pair, rate_type, period_start)

</canonical_refs>

<specifics>
## Specific Ideas

### Dragon intercompany elimination rules to seed

From the Dragon Mar 2026 PDF:
1. **Advertising transfer** — Dragon Roofing `Advertising & Marketing -$9,015` ↔ Easy Hail Claim `Advertising & Marketing +$9,015` (bidirectional)
2. **Referral fees** — Dragon Roofing `Referral Fee - Easy Hail $818` ↔ Easy Hail Claim `Sales - Referral Fee $818` (bidirectional)
3. **Intercompany loan (BS, Iteration 34.1)** — Dragon `Loan Payable - Dragon Roofing Pty Ltd ($315,173)` ↔ Easy Hail `Loan Receivable - Dragon Roofing Pty Ltd`

### IICT intercompany elimination rules to seed (34.1 BS primarily)

From the IICT Mar 2026 PDF:
- `Loan - IICT (Aust) Pty Ltd $51,385` on IICT Group Limited BS ↔ matching intercompany receivable on IICT (Aust) Pty Ltd (exact mapping TBD during implementation when account lists are pulled)
- P&L eliminations at March 2026 appear minimal — inter-entity transactions all go through the loan accounts

### IICT FX translation specifics

- IICT Group Limited is the NZ entity (confirmed by user report showing `Bank Revaluations` and `Realised Currency Gains` in IICT Aust columns)
- Wait — actually from careful re-read: the NZD entity is likely **IICT Group Limited**. Researcher must confirm by checking member business `base_currency` from Xero connection during research phase.
- P&L translation: monthly average NZD/AUD rate
- BS translation (34.1): closing spot rate; CTA (cumulative translation adjustment) goes to equity

### UI — per-entity columns for N=3 entities

- Mobile: stack entity columns; show active entity via toggle pills; always show Consolidated column
- Desktop: horizontal scroll if >3 entities; sticky first column (Account Name) + sticky last column (Consolidated)

### Eliminations diagnostic view

After consolidation computed, show a `<details>` section: "View eliminations applied (N rules, $X total)" — lists each rule hit, the amount eliminated, and which entities contributed.

</specifics>

<deferred>
## Deferred Ideas

- **Goodwill and purchase price allocation** — N/A for user's groups (common ownership, not acquisition accounting)
- **Minority interest / non-controlling interests** — N/A
- **Cross-fiscal-year consolidation** — all member entities use same AU fiscal year
- **Elimination rule UI editor** — Iteration 34.0 can seed rules via migration; dedicated UI deferred to 34.3 if needed after user feedback
- **Cumulative translation adjustment equity presentation** — Iteration 34.1 initially shows CTA as a single line; segmentation (by reporting period, by entity) deferred
- **Consolidation across different chart of accounts** — current approach aligns by `account_type` (5 categories) which user confirmed is sufficient; finer-grained mapping deferred
- **Audit trail of which Xero sync populated which consolidation output** — approval snapshot covers the point-in-time need; per-line lineage deferred

</deferred>

---

*Phase: 34-dragon-multi-entity-consolidation*
*Context gathered: 2026-04-18 via user discussion + PDF review*
