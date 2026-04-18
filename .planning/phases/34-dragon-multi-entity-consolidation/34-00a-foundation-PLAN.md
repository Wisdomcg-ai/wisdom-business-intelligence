---
phase: 34
plan: 00a
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/monthly-report/shared.ts
  - src/lib/monthly-report/shared.test.ts
  - src/app/api/monthly-report/generate/route.ts
  - src/lib/consolidation/types.ts
  - src/lib/consolidation/__fixtures__/dragon-mar-2026.ts
  - src/lib/consolidation/__fixtures__/iict-mar-2026.ts
  - supabase/migrations/20260421_consolidation_groups.sql
  - supabase/migrations/20260421b_fx_rates.sql
  - supabase/migrations/20260421c_cfo_snapshot_column.sql
autonomous: true
requirements: [MLTE-01]

must_haves:
  truths:
    - "Shared report helpers are importable from src/lib/monthly-report/shared.ts and generate/route.ts consumes them without behaviour drift"
    - "Dragon Mar 2026 fixture encodes the exact line-items + monthly_values transcribed from the reference PDF"
    - "IICT Mar 2026 fixture encodes HKD amounts pre-translation + the monthly-average HKD/AUD rate used in the PDF"
    - "consolidation_groups, consolidation_group_members, fx_rates tables exist with RLS trifecta"
    - "cfo_report_status.snapshot_data jsonb + snapshot_taken_at timestamptz columns exist (Phase 35 hook only — no behaviour change)"
  artifacts:
    - path: src/lib/monthly-report/shared.ts
      provides: "calcVariance, buildSubtotal, mapTypeToCategory, getMonthRange, getNextMonth, getPriorYearMonth, ReportLine"
      contains: "export function calcVariance"
    - path: src/lib/consolidation/types.ts
      provides: "ConsolidationGroup, ConsolidationMember, EliminationRule, EliminationEntry, FxRateRow, EntityColumn, ConsolidatedReport, XeroPLLineLike"
      contains: "export interface ConsolidatedReport"
    - path: src/lib/consolidation/__fixtures__/dragon-mar-2026.ts
      provides: "dragonRoofingPL, easyHailPL, FY_MONTHS, dragonExpectedConsolidated"
      contains: "Sales - Deposit"
    - path: src/lib/consolidation/__fixtures__/iict-mar-2026.ts
      provides: "iictAustPL, iictHKPL, iictAuPtyLtdPL, HKD_AUD_MONTHLY, iictExpectedConsolidated"
      contains: "HKD_AUD"
    - path: supabase/migrations/20260421_consolidation_groups.sql
      provides: "consolidation_groups, consolidation_group_members, consolidation_elimination_rules tables + RLS"
      contains: "consolidation_elimination_rules"
    - path: supabase/migrations/20260421b_fx_rates.sql
      provides: "fx_rates table with RLS trifecta (coach_all + super_admin_all + service_role)"
      contains: "CREATE TABLE IF NOT EXISTS fx_rates"
    - path: supabase/migrations/20260421c_cfo_snapshot_column.sql
      provides: "cfo_report_status.snapshot_data + snapshot_taken_at"
      contains: "snapshot_data jsonb"
  key_links:
    - from: src/app/api/monthly-report/generate/route.ts
      to: src/lib/monthly-report/shared.ts
      via: "named imports: calcVariance, buildSubtotal, mapTypeToCategory, getMonthRange, getNextMonth, getPriorYearMonth, ReportLine"
      pattern: "from '@/lib/monthly-report/shared'"
    - from: src/lib/consolidation/__fixtures__/dragon-mar-2026.ts
      to: downstream engine/eliminations tests (plans 00b, 00d)
      via: "named exports of PL fixtures + expected consolidated totals"
      pattern: "export const dragonExpectedConsolidated"
---

<objective>
Foundation wave for Phase 34 Iteration 34.0.

Three deliverables:
1. **Refactor extraction** — pull the report-math helpers out of `src/app/api/monthly-report/generate/route.ts` into `src/lib/monthly-report/shared.ts` so the new consolidated route can reuse them verbatim (no re-implementation, no sign-convention drift).
2. **Schema foundation** — create the three Iteration 34.0 tables (`consolidation_groups`, `consolidation_group_members`, `consolidation_elimination_rules`), the multi-currency reference table (`fx_rates`), and the Phase 35 hook columns on `cfo_report_status`.
3. **Reference fixtures** — transcribe the exact numbers from Matt's Dragon Mar 2026 and IICT Mar 2026 consolidation PDFs into TypeScript fixture files. These are the highest-value verification asset in the phase — every downstream engine test asserts against them to the dollar.

Purpose: every downstream plan (00b engine, 00c FX, 00d eliminations, 00e API/UI) depends on these three artefacts. Without them, later plans have to invent interfaces and test data mid-flight, which is how sign-convention bugs ship.

Output: `shared.ts` + tests (green), new migrations (not pushed yet — push happens in plan 00d once the seed migration is also ready), two fixture files with complete PDF data, `types.ts` for the consolidation module.

**Co-location decision (documented per PATTERNS.md § `src/components/reports/`):** new tab components in later plans will live at `src/app/finances/monthly-report/components/Consolidated*Tab.tsx` alongside every other `*Tab.tsx` in the codebase. The CONTEXT.md reference to `src/components/reports/` is aspirational — the established convention is co-location and every other tab (BalanceSheetTab, CashflowTab, BudgetVsActualTable, etc.) already lives in the monthly-report/components directory.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-VALIDATION.md

# Analogs to copy from
@src/app/api/monthly-report/generate/route.ts
@supabase/migrations/20260420_cfo_dashboard.sql
@supabase/migrations/20260418_cashflow_calxa_tables.sql
@supabase/migrations/20260418b_cashflow_settings_tweaks.sql
@src/lib/cashflow/__fixtures__/small-business.ts

<interfaces>
<!-- Existing ReportLine shape — MUST be extracted to shared.ts unchanged -->
From src/app/api/monthly-report/generate/route.ts:15-31 and 34-101:

```typescript
interface ReportLine {
  account_name: string
  xero_account_name?: string | null
  is_budget_only: boolean
  actual: number
  budget: number
  variance_amount: number
  variance_percent: number
  ytd_actual: number
  ytd_budget: number
  ytd_variance_amount: number
  ytd_variance_percent: number
  unspent_budget: number
  budget_next_month: number
  budget_annual_total: number
  prior_year: number | null
}

function mapTypeToCategory(accountType: string): string { /* lines 34-43 */ }

function calcVariance(actual: number, budget: number, isRevenue: boolean): { amount: number; percent: number } {
  const amount = isRevenue ? actual - budget : budget - actual
  const percent = budget !== 0 ? (amount / Math.abs(budget)) * 100 : 0
  return { amount, percent }
}

function buildSubtotal(lines: ReportLine[], label: string): ReportLine { /* lines 55-73 */ }
function getMonthRange(start: string, end: string): string[] { /* lines 76-88 */ }
function getNextMonth(monthKey: string): string { /* lines 91-95 */ }
function getPriorYearMonth(monthKey: string): string { /* lines 98-101 */ }
```

<!-- Shape of xero_pl_lines rows as consumed by generate/route.ts:244-265 -->
```typescript
interface XeroPLLineLike {
  business_id: string
  account_name: string
  account_code?: string | null
  account_type: string   // 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'
  section: string
  monthly_values: Record<string, number>  // 'YYYY-MM' → amount
}
```

<!-- cashflow fixture pattern to mirror -->
From src/lib/cashflow/__fixtures__/small-business.ts:1-45:
- Exports `FY_MONTHS: string[]` (12 'YYYY-MM' keys, Jul→Jun)
- Exports `evenSpread(months, amount): Record<string, number>` helper
- Typed imports from `@/app/finances/forecast/types`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract shared report helpers (refactor-only, behaviour preserved)</name>
  <files>src/lib/monthly-report/shared.ts, src/lib/monthly-report/shared.test.ts, src/app/api/monthly-report/generate/route.ts</files>
  <read_first>
    - src/app/api/monthly-report/generate/route.ts (full file — understand how helpers are used end-to-end; the extraction must be byte-identical)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § `src/lib/monthly-report/shared.ts`
  </read_first>
  <behavior>
    - calcVariance(100, 80, true) returns { amount: 20, percent: 25 }  (revenue favourable when actual > budget)
    - calcVariance(100, 80, false) returns { amount: -20, percent: -25 }  (expense unfavourable when actual > budget)
    - calcVariance(10, 0, true) returns { amount: 10, percent: 0 }  (zero-budget guard)
    - mapTypeToCategory('revenue') returns 'Revenue', ('cogs') returns 'Cost of Sales', ('opex') returns 'Operating Expenses', ('other_income') returns 'Other Income', ('other_expense') returns 'Other Expenses', ('unknown') returns 'Other Expenses'
    - mapTypeToCategory('REVENUE') returns 'Revenue' (case-insensitive)
    - getMonthRange('2025-07', '2026-06') returns 12 keys in order ['2025-07',...,'2026-06']
    - getMonthRange('2026-03', '2026-03') returns single key ['2026-03']
    - getNextMonth('2025-12') returns '2026-01' (year rollover)
    - getNextMonth('2026-03') returns '2026-04'
    - getPriorYearMonth('2026-03') returns '2025-03'
    - buildSubtotal of [{actual:100,budget:80,...}, {actual:50,budget:40,...}] with label 'Total Revenue' returns a ReportLine whose account_name='Total Revenue', actual=150, budget=120, variance_percent=0 (percent is recalculated at the call site, pattern preserved from source)
  </behavior>
  <action>
Create `src/lib/monthly-report/shared.ts` containing byte-identical copies of the helpers from `src/app/api/monthly-report/generate/route.ts` lines 15-101. Exports:
- `export interface ReportLine { ... }` (from lines 15-31)
- `export function mapTypeToCategory(accountType: string): string` (lines 34-43)
- `export function calcVariance(actual: number, budget: number, isRevenue: boolean): { amount: number; percent: number }` (lines 48-52)
- `export function buildSubtotal(lines: ReportLine[], label: string): ReportLine` (lines 55-73)
- `export function getMonthRange(start: string, end: string): string[]` (lines 76-88)
- `export function getNextMonth(monthKey: string): string` (lines 91-95)
- `export function getPriorYearMonth(monthKey: string): string` (lines 98-101)

The 6 function bodies and the `ReportLine` interface MUST be copied verbatim — do not reformat, rename params, or change comments. The signatures and logic carry subtle sign-convention rules (`amount = isRevenue ? actual - budget : budget - actual`) that downstream reports depend on.

Create `src/lib/monthly-report/shared.test.ts` with a `describe` block per exported function covering the cases in `<behavior>`. Use vitest: `import { describe, it, expect } from 'vitest'`. Use `toBeCloseTo(x, 6)` for percent assertions where floats apply.

Modify `src/app/api/monthly-report/generate/route.ts`:
1. Delete lines 15-101 (the interface + 6 helper functions) — replace with a single import block:
   ```typescript
   import {
     calcVariance,
     buildSubtotal,
     mapTypeToCategory,
     getMonthRange,
     getNextMonth,
     getPriorYearMonth,
     type ReportLine,
   } from '@/lib/monthly-report/shared'
   ```
2. Do NOT modify anything below line 104 — the rest of the route consumes these symbols unchanged.

NO behaviour change. NO additional refactors (e.g. do not also refactor full-year/route.ts in this task — that is explicitly out of scope here per PATTERNS.md "note duplication" line 423. A follow-up plan may handle it).
  </action>
  <verify>
    <automated>npx vitest run src/lib/monthly-report/shared.test.ts --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^export function\|^export interface" src/lib/monthly-report/shared.ts` returns 7 (6 functions + 1 interface)
    - `grep "function mapTypeToCategory\|function calcVariance\|function buildSubtotal\|function getMonthRange\|function getNextMonth\|function getPriorYearMonth\|interface ReportLine" src/app/api/monthly-report/generate/route.ts` returns zero matches (all removed)
    - `grep "from '@/lib/monthly-report/shared'" src/app/api/monthly-report/generate/route.ts` returns one match
    - `npx vitest run src/lib/monthly-report/shared.test.ts` reports >=11 tests passing
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>All shared helpers live in shared.ts, generate/route.ts imports them, tests green, TypeScript clean, zero behaviour change.</done>
</task>

<task type="auto">
  <name>Task 2: Reference fixtures for Dragon Mar 2026 + IICT Mar 2026 (PDF transcription)</name>
  <files>src/lib/consolidation/types.ts, src/lib/consolidation/__fixtures__/dragon-mar-2026.ts, src/lib/consolidation/__fixtures__/iict-mar-2026.ts</files>
  <read_first>
    - src/lib/cashflow/__fixtures__/small-business.ts (exact shape to mirror — FY_MONTHS + evenSpread helper + named PL exports)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md § `## Specific Ideas` (Dragon + IICT elimination rule lines)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § `## Validation Architecture` → `### Phase Requirements → Test Map` (reference fixture requirement)
  </read_first>
  <action>
Create `src/lib/consolidation/types.ts` first — it is the type backbone every other module imports from.

Exports (interfaces — do NOT add implementation):
```typescript
// Copy xero_pl_lines row shape — source: src/app/api/monthly-report/generate/route.ts:244-265
export interface XeroPLLineLike {
  business_id: string
  account_name: string
  account_code?: string | null
  account_type: string              // 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'
  section: string
  monthly_values: Record<string, number>   // 'YYYY-MM' → amount
}

export interface ConsolidationGroup {
  id: string
  name: string
  business_id: string
  presentation_currency: string     // 'AUD' for both Dragon + IICT
}

export interface ConsolidationMember {
  id: string
  group_id: string
  source_business_id: string
  display_name: string
  display_order: number
  functional_currency: string       // 'AUD' or 'HKD' for IICT Group Limited
}

export interface EliminationRule {
  id: string
  group_id: string
  rule_type: 'account_pair' | 'account_category' | 'intercompany_loan'
  entity_a_business_id: string
  entity_a_account_code: string | null
  entity_a_account_name_pattern: string | null
  entity_b_business_id: string
  entity_b_account_code: string | null
  entity_b_account_name_pattern: string | null
  direction: 'bidirectional' | 'entity_a_eliminates' | 'entity_b_eliminates'
  description: string
  active: boolean
}

export interface EliminationEntry {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number                    // negative — reduces consolidated total
  source_entity_id: string
  source_amount: number
}

export interface FxRateRow {
  currency_pair: string             // 'HKD/AUD'  (slash, NOT underscore — per PATTERNS.md)
  rate_type: 'monthly_average' | 'closing_spot'
  period: string                    // 'YYYY-MM-01' for monthly_average, 'YYYY-MM-<last>' for closing_spot
  rate: number                      // e.g. 0.1925 for HKD/AUD
  source: 'manual' | 'rba'
}

export interface EntityColumn {
  member_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  lines: XeroPLLineLike[]           // post-translation (in presentation_currency)
}

export interface ConsolidatedReport {
  group: ConsolidationGroup
  byEntity: EntityColumn[]
  eliminations: EliminationEntry[]
  consolidated: {
    lines: { account_type: string; account_name: string; monthly_values: Record<string, number> }[]
  }
  fx_context: {
    rates_used: Record<string, number>           // e.g. { 'HKD/AUD::2026-03': 0.1925 }
    missing_rates: { currency_pair: string; period: string }[]
  }
  diagnostics: {
    members_loaded: number
    total_lines_processed: number
    eliminations_applied_count: number
    eliminations_total_amount: number
    processing_ms: number
  }
}
```

Then create `src/lib/consolidation/__fixtures__/dragon-mar-2026.ts`. Structure (mirror cashflow fixture pattern):

```typescript
import type { XeroPLLineLike } from '../types'

export const FY_MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
] as const

export function evenSpread(months: readonly string[], amount: number): Record<string, number> {
  const result: Record<string, number> = {}
  for (const m of months) result[m] = amount
  return result
}

// Hardcoded business IDs for fixture purposes — do NOT rely on these in production;
// production uses resolveBusinessIds() to fetch real UUIDs from the businesses table.
export const DRAGON_ROOFING_BIZ = '00000000-0000-0000-0000-dragon00dragn'
export const EASY_HAIL_BIZ     = '00000000-0000-0000-0000-easyhail0hail'

// Dragon Roofing Pty Ltd — key P&L rows for Mar 2026
// Transcribe from Matt's Dragon Consolidated Finance Report Mar 2026 PDF
// Line coverage: at minimum the accounts touched by elimination rules + 3 top revenue
// + 3 top OpEx + the "Sales - Deposit" row required by VALIDATION.md manual check
// (must read 11,652 on Easy Hail column and Consolidated).
export const dragonRoofingPL: XeroPLLineLike[] = [
  // Revenue
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Sales - Roofing', account_code: '200', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': /* Mar-26 from PDG */ 0 /* FILL FROM PDF */ } },
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Referral Fee - Easy Hail', account_code: '210', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': 818 } },
  // OpEx rows — advertising elimination pivot
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Advertising & Marketing', account_code: '420', account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-03': -9015 } },
  // ...continue until all rows required by Dragon elimination rules are present
]

// Easy Hail Claim Pty Ltd — mirror of the intercompany transactions
export const easyHailPL: XeroPLLineLike[] = [
  // Revenue
  { business_id: EASY_HAIL_BIZ, account_name: 'Sales - Deposit', account_code: '220', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': 11652 } },  // VALIDATION.md spot-check value
  { business_id: EASY_HAIL_BIZ, account_name: 'Sales - Referral Fee', account_code: '221', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': 818 } },
  // OpEx — advertising transfer (opposite sign)
  { business_id: EASY_HAIL_BIZ, account_name: 'Advertising & Marketing', account_code: '420', account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-03': 9015 } },
]

// Expected consolidated totals for Mar 2026 (what engine must reproduce)
// Derivation:
//   Advertising: Dragon -9015 + EasyHail +9015 = 0 (but elimination rule zeros both → consolidated = 0)
//   Referral fees: Dragon revenue 818 + EasyHail revenue 818 = 1636 pre-elim; eliminations: -818 (Dragon) + -818 (EasyHail) = -1636; consolidated = 0
//   Sales - Deposit: Dragon 0 + EasyHail 11652 = 11652 (no elimination)
export const dragonExpectedConsolidated = {
  '2026-03': {
    'revenue::sales - deposit':                11652,
    'revenue::referral fee - easy hail':       0,       // eliminated
    'revenue::sales - referral fee':           0,       // eliminated
    'opex::advertising & marketing':           0,       // bidirectional elimination nets to zero
    // ...remaining accounts
  },
} as const
```

**CRITICAL:** Where the comment says "FILL FROM PDF", the executor MUST enter the exact dollar amounts from Matt's Dragon Mar 2026 PDF. Do not invent numbers — this fixture is the contract the engine is validated against. If a number cannot be read from the PDF, leave a `// TODO_MATT_CONFIRM: <line name>` comment rather than guessing. **Before the plan 00e checkpoint gate executor-must ensure `grep -c "TODO_MATT_CONFIRM" src/lib/consolidation/__fixtures__/*.ts` returns 0** — every TODO must be resolved by Matt before the fixture is frozen (this check is enforced in plan 00e-T4 below).

Then create `src/lib/consolidation/__fixtures__/iict-mar-2026.ts` with same shape, three members: `iictAustPL`, `iictGroupPtyLtdPL`, `iictHKPL`. The HK member uses `functional_currency: 'HKD'`. Numbers in `iictHKPL.monthly_values` are the raw HKD amounts from the PDF (pre-translation).

Add a translation rate fixture:
```typescript
export const HKD_AUD_MONTHLY: Record<string, number> = {
  '2026-03': 0.1925,   // TODO_MATT_CONFIRM — this is the monthly_average rate used in the Mar 2026 PDF
  '2026-02': 0.1928,   // TODO_MATT_CONFIRM
}

// Expected after HKD→AUD translation at 0.1925 + aggregation
export const iictExpectedConsolidated = {
  '2026-03': {
    // ...per-account consolidated values in AUD
  },
} as const
```

Do NOT import from external files other than `../types`. Fixtures must be self-contained.
  </action>
  <verify>
    <automated>npx tsc --noEmit src/lib/consolidation/types.ts src/lib/consolidation/__fixtures__/dragon-mar-2026.ts src/lib/consolidation/__fixtures__/iict-mar-2026.ts 2>&1 | tee /tmp/phase34-00a-task2.log; grep -c "error TS" /tmp/phase34-00a-task2.log || true; npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^export" src/lib/consolidation/types.ts` returns >= 8 (8 exported interfaces minimum)
    - `grep "XeroPLLineLike\|ConsolidationGroup\|ConsolidationMember\|EliminationRule\|EliminationEntry\|FxRateRow\|EntityColumn\|ConsolidatedReport" src/lib/consolidation/types.ts` returns 8 distinct match lines
    - `grep "export const FY_MONTHS\|export const dragonRoofingPL\|export const easyHailPL\|export const dragonExpectedConsolidated" src/lib/consolidation/__fixtures__/dragon-mar-2026.ts` returns 4 matches
    - `grep "account_name: 'Sales - Deposit'" src/lib/consolidation/__fixtures__/dragon-mar-2026.ts` returns 1 match with `'2026-03': 11652` on the same line or within 3 lines (VALIDATION.md spot-check)
    - `grep "account_name: 'Advertising & Marketing'" src/lib/consolidation/__fixtures__/dragon-mar-2026.ts` returns >= 2 matches (Dragon -9015 + EasyHail +9015)
    - `grep "export const iictHKPL\|functional_currency: 'HKD'\|HKD_AUD_MONTHLY\|iictExpectedConsolidated" src/lib/consolidation/__fixtures__/iict-mar-2026.ts` returns >= 3 matches
    - Slash format verified: `grep "currency_pair: 'HKD/AUD'\|'HKD/AUD'" src/lib/consolidation/__fixtures__/iict-mar-2026.ts` returns matches (slash, NOT underscore)
    - `npx tsc --noEmit` exits 0 (types + fixtures compile together)
  </acceptance_criteria>
  <done>types.ts exports 8 interfaces, both fixture files transcribe PDF numbers with PDF-derived spot-check values verified (Sales - Deposit = 11,652; Advertising ± $9,015), TODO_MATT_CONFIRM comments document any gaps, TypeScript compiles clean.</done>
</task>

<task type="auto">
  <name>Task 3: Three Iteration 34.0 migration files (consolidation_groups / fx_rates / snapshot columns)</name>
  <files>supabase/migrations/20260421_consolidation_groups.sql, supabase/migrations/20260421b_fx_rates.sql, supabase/migrations/20260421c_cfo_snapshot_column.sql</files>
  <read_first>
    - supabase/migrations/20260420_cfo_dashboard.sql (RLS trifecta template — lines 19-34 for table shape, 46-67 for RLS — use this as the canonical trifecta pattern for fx_rates too)
    - supabase/migrations/20260418_cashflow_calxa_tables.sql (lines 27-58 — index + updated_at trigger pattern)
    - supabase/migrations/20260418b_cashflow_settings_tweaks.sql (lines 8-36 — idempotent ALTER TABLE pattern)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § `## Schema Proposal (exact)` (lines 864-1052) for the exact SQL
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § migration section for pattern references
  </read_first>
  <action>
Create THREE migration files.

**File 1: `supabase/migrations/20260421_consolidation_groups.sql`**

Copy verbatim from RESEARCH.md § Schema Proposal lines 866-1000 — contains:
- `CREATE TABLE IF NOT EXISTS consolidation_groups (...)` with UNIQUE(business_id)
- `CREATE TABLE IF NOT EXISTS consolidation_group_members (...)` with UNIQUE(group_id, source_business_id) and `functional_currency text NOT NULL DEFAULT 'AUD'`
- `CREATE TABLE IF NOT EXISTS consolidation_elimination_rules (...)` with the three-value `rule_type` CHECK, `direction` CHECK, `entity_a_*` / `entity_b_*` nullable matchers with CHECK requiring at least one matcher per side, and the `length(...) < 256` DoS guard
- Indexes: `consolidation_groups_business_idx`, `consolidation_group_members_group_idx`, `consolidation_elimination_rules_group_idx`
- RLS trifecta (coach_all, super_admin_all, service_role) on all three tables — substitute the `group_id IN (SELECT id FROM consolidation_groups WHERE business_id IN ...)` predicate for members + rules
- `update_consolidation_groups_updated_at()` function + triggers on all three tables

Deviations from RESEARCH.md (to match POST-RESEARCH CORRECTIONS):
- `consolidation_elimination_rules.rule_type` CHECK MUST include `'intercompany_loan'` value on day one (RESEARCH.md had it but mentioned extending later — we ship it from day one since BS is only one iteration away and extending a CHECK constraint is a breaking migration).

**File 2: `supabase/migrations/20260421b_fx_rates.sql`**

Schema + **RLS trifecta** (coach_all + super_admin_all + service_role). This migration MUST match the RLS pattern of the other three Phase 34 tables — exactly 3 policies, no `authenticated_read`. Rationale: every query path in Phase 34 that reads fx_rates (the consolidated P&L route in plan 00e, the consolidated-bs route in plan 01a, the consolidated-cashflow route in plan 02a, and the admin FX CRUD route in plan 00f) uses the **service-role client** which bypasses RLS. Shipping `authenticated_read` would widen the attack surface without adding functionality.

```sql
CREATE TABLE IF NOT EXISTS fx_rates (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_pair   text            NOT NULL,       -- 'HKD/AUD' (slash separator, per CONTEXT.md + PATTERNS.md)
  rate_type       text            NOT NULL CHECK (rate_type IN ('monthly_average', 'closing_spot')),
  period          date            NOT NULL,       -- first-of-month for monthly_average; month-end for closing_spot
  rate            numeric         NOT NULL,       -- e.g. 0.192500; use numeric (project convention — no fixed precision per PATTERNS.md)
  source          text            NOT NULL DEFAULT 'manual'
                                  CHECK (source IN ('manual', 'rba')),
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (currency_pair, rate_type, period)
);

CREATE INDEX IF NOT EXISTS fx_rates_pair_period_idx ON fx_rates (currency_pair, period);

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS trifecta (coach / super_admin / service_role) — matches the
-- three consolidation tables. Coaches and super_admins have FULL
-- write access so the /admin/consolidation FX entry UI (plan 00f)
-- can operate via the normal route handler client without needing
-- service_role. Current plan 00f implementation uses service_role
-- for writes; the trifecta is the safer, consistent default and
-- future-proofs a migration to route-handler-client writes.
--
-- We intentionally do NOT ship an fx_rates_authenticated_read
-- policy. Every Phase 34 read path (consolidated P&L route, BS
-- route, cashflow route, admin CRUD) uses the service-role client
-- which bypasses RLS. Adding authenticated_read would widen the
-- attack surface for no functional gain and would diverge from the
-- other three Phase 34 tables which each have exactly 3 policies.
-- ============================================================

CREATE POLICY "fx_rates_coach_all" ON fx_rates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "fx_rates_super_admin_all" ON fx_rates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "fx_rates_service_role" ON fx_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_fx_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fx_rates_updated_at
  BEFORE UPDATE ON fx_rates
  FOR EACH ROW EXECUTE FUNCTION update_fx_rates_updated_at();
```

Key deviations from RESEARCH.md (intentional — POST-RESEARCH CORRECTIONS):
- `currency_pair` uses slash (`'HKD/AUD'`), not underscore (`'NZD_AUD'`). Slash format is enforced by application code (`PAIR_RE = /^[A-Z]{3}\/[A-Z]{3}$/` in plan 00f's POST /api/consolidation/fx-rates). A CHECK constraint at the DB level would be stricter but is **deliberately deferred** (checker revision #9 waiver).
  - Rationale: The only writers to `fx_rates` in Phase 34 are the service-role admin CRUD route (plan 00f) and the optional future RBA import job. Both enforce the slash regex in TypeScript before writing. Adding a DB CHECK constraint like `currency_pair ~ '^[A-Z]{3}/[A-Z]{3}$'` is a safe defense-in-depth and could be added in a follow-up migration without breaking any rows (existing rows would all already match). We keep the Phase 34.0 migration minimal to reduce schema-change surface for the initial push.
  - Waiver documented: if you prefer the CHECK constraint, add `CHECK (currency_pair ~ '^[A-Z]{3}/[A-Z]{3}$')` to the CREATE TABLE; no downstream code changes required.
- `source` default is `'manual'` (user locked Option 1 — manual rate entry only in 34.0). `'rba'` is in the CHECK enum as a future option but no rows inserted yet.
- `period` stored as `date` (not text) — enables date arithmetic and consistent formatting. Matches PATTERNS.md § fx.ts guidance.
- **RLS trifecta (checker revision #1 fix)** — three policies exactly: `fx_rates_coach_all`, `fx_rates_super_admin_all`, `fx_rates_service_role`. No `fx_rates_authenticated_read`.

**File 3: `supabase/migrations/20260421c_cfo_snapshot_column.sql`**

Idempotent column add per PATTERNS.md § `## Idempotent column-add pattern`:

```sql
ALTER TABLE cfo_report_status
  ADD COLUMN IF NOT EXISTS snapshot_data      jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_taken_at  timestamptz;

-- Comment column purpose for future readers
COMMENT ON COLUMN cfo_report_status.snapshot_data IS
  'Phase 35 approval hook: full consolidated report payload frozen at approval time. Written by POST /api/cfo/report-status when status transitions to approved.';
COMMENT ON COLUMN cfo_report_status.snapshot_taken_at IS
  'Timestamp the snapshot_data column was populated. NULL when no snapshot exists.';
```

No RLS changes — this is adding columns to an existing RLS-enabled table; the existing policies carry over.

**Do NOT** create the seed migration (Dragon + IICT groups, elimination rules) in this task. That is plan 00d — it requires the elimination engine to be ready first so the seeded rules can be exercised by an integration test before schema push.

**Do NOT** run `supabase db push` in this task. Schema push is the [BLOCKING] task in plan 00d after all 34.0 migrations are staged.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260421_consolidation_groups.sql && test -f supabase/migrations/20260421b_fx_rates.sql && test -f supabase/migrations/20260421c_cfo_snapshot_column.sql && npx supabase db lint --linked 2>&1 | tee /tmp/phase34-00a-task3.log; grep -E "error|Error" /tmp/phase34-00a-task3.log && exit 1 || true</automated>
  </verify>
  <acceptance_criteria>
    - All three migration files exist
    - `grep -c "CREATE TABLE IF NOT EXISTS" supabase/migrations/20260421_consolidation_groups.sql` returns 3
    - `grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/20260421_consolidation_groups.sql` returns 3
    - `grep -c "CREATE POLICY" supabase/migrations/20260421_consolidation_groups.sql` returns 9 (3 tables × 3 policies each)
    - `grep "rule_type IN ('account_pair', 'account_category', 'intercompany_loan')" supabase/migrations/20260421_consolidation_groups.sql` returns 1 match
    - `grep "functional_currency text NOT NULL DEFAULT 'AUD'" supabase/migrations/20260421_consolidation_groups.sql` returns 1 match
    - `grep "length(coalesce(entity_a_account_name_pattern, '')) < 256" supabase/migrations/20260421_consolidation_groups.sql` returns 1 match (DoS guard)
    - `grep "currency_pair" supabase/migrations/20260421b_fx_rates.sql | grep "NOT NULL"` returns 1 match
    - **RLS trifecta enforced (checker revision #1):** `grep -c "CREATE POLICY" supabase/migrations/20260421b_fx_rates.sql` returns exactly `3` (coach_all + super_admin_all + service_role)
    - **No authenticated_read policy:** `grep "fx_rates_authenticated_read\|authenticated_read.*fx_rates" supabase/migrations/20260421b_fx_rates.sql` returns 0 matches
    - **Trifecta policy names present:** `grep "fx_rates_coach_all\|fx_rates_super_admin_all\|fx_rates_service_role" supabase/migrations/20260421b_fx_rates.sql` returns exactly 3 match lines
    - **Coach + super_admin use system_roles lookup:** `grep -c "FROM system_roles" supabase/migrations/20260421b_fx_rates.sql` returns 2 (one per role policy)
    - `grep "'HKD/AUD'" supabase/migrations/20260421b_fx_rates.sql` is NOT required (slash format enforced by app code, not DB CHECK)
    - Slash format guarded: `grep "'NZD_AUD'\|'NZD/AUD'\|currency_pair_check" supabase/migrations/20260421b_fx_rates.sql` returns 0 matches (no stale NZD references, no DB CHECK that would conflict with future app-layer regex)
    - `grep "source IN ('manual', 'rba')" supabase/migrations/20260421b_fx_rates.sql` returns 1 match
    - `grep "ADD COLUMN IF NOT EXISTS snapshot_data" supabase/migrations/20260421c_cfo_snapshot_column.sql` returns 1 match
    - `npx supabase db lint --linked` exits 0 (no SQL errors)
  </acceptance_criteria>
  <done>Three migration files staged locally. Not yet pushed. Schema shape matches CONTEXT + RESEARCH + PATTERNS with slash currency format, manual-default FX source, intercompany_loan rule_type from day one. fx_rates has the full RLS trifecta (3 policies exactly) matching the other Phase 34 tables.</done>
</task>

</tasks>

<verification>
  <commands>
    - `npx vitest run src/lib/monthly-report/shared.test.ts --reporter=dot` — 11+ passing
    - `npx tsc --noEmit` — clean (includes new consolidation/types.ts + fixtures)
    - `ls supabase/migrations/20260421*.sql` — 3 files
    - `grep -r "from '@/lib/monthly-report/shared'" src/` — ≥1 match
    - `grep -c "CREATE POLICY" supabase/migrations/20260421b_fx_rates.sql` — returns 3 (RLS trifecta)
  </commands>
</verification>

<success_criteria>
- `src/lib/monthly-report/shared.ts` exists and `generate/route.ts` imports from it (refactor-only, no behaviour drift verified by TypeScript)
- `src/lib/consolidation/types.ts` exports 8+ domain interfaces downstream plans depend on
- Dragon + IICT fixtures encode PDF numbers with at least the VALIDATION.md spot-check values correctly (Sales - Deposit Mar 2026 = 11,652; Advertising transfer ±9,015)
- Three migration files ready for push (push happens in plan 00d after seed migration is also staged)
- fx_rates RLS trifecta enforced: 3 policies exactly (coach_all, super_admin_all, service_role) — no authenticated_read
- All tests green, TypeScript clean, SQL lints clean
</success_criteria>

<output>
After completion, create `.planning/phases/34-dragon-multi-entity-consolidation/34-00a-SUMMARY.md` summarising:
- Lines extracted to shared.ts and line-count saved in generate/route.ts
- Fixture coverage (how many accounts, which elimination-pivot accounts captured, any TODO_MATT_CONFIRM values)
- Migration file count + key CHECK constraints
- fx_rates RLS policy count (MUST be 3: coach_all, super_admin_all, service_role)
- Any deviations from RESEARCH.md with rationale (expected: slash currency format, manual default, intercompany_loan from day one, fx_rates trifecta without authenticated_read per checker revision #1)
</output>
