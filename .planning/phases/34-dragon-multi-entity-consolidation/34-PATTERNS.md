# Phase 34: Dragon Multi-Entity Consolidation — Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 22 (new/modified across 3 iterations)
**Analogs found:** 22 / 22

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/20260421_consolidation_groups.sql` | migration | schema + RLS | `supabase/migrations/20260420_cfo_dashboard.sql` + `20260418_cashflow_calxa_tables.sql` | exact (RLS + updated_at triggers) |
| `supabase/migrations/20260421b_seed_dragon_iict_groups.sql` | migration | seed data | `supabase/migrations/20260419_cashflow_schedules.sql` (seed INSERT block) | exact (seed pattern) |
| `src/lib/consolidation/engine.ts` | service / pure module | transform / aggregate | `src/lib/cashflow/engine.ts` | role + data-flow match |
| `src/lib/consolidation/eliminations.ts` | service / pure module | transform (rule-matching) | `src/lib/cashflow/schedules.ts` + `src/lib/utils/account-matching.ts` | role match |
| `src/lib/consolidation/fx.ts` | utility / pure module | transform | `src/lib/cashflow/company-tax.ts` (tax-by-month lookup) | role match |
| `src/lib/consolidation/types.ts` | type module | n/a | `src/app/finances/forecast/types.ts` (inferred from imports) | role match |
| `src/lib/consolidation/engine.test.ts` | test | unit | `src/lib/cashflow/engine.test.ts` | exact |
| `src/lib/consolidation/eliminations.test.ts` | test | unit | `src/lib/cashflow/engine.test.ts` | exact |
| `src/lib/consolidation/fx.test.ts` | test | unit | `src/lib/cashflow/engine.test.ts` | exact |
| `src/lib/consolidation/__fixtures__/dragon-mar-2026.ts` | test fixture | data | `src/lib/cashflow/__fixtures__/small-business.ts` | exact |
| `src/lib/consolidation/__fixtures__/iict-mar-2026.ts` | test fixture | data | `src/lib/cashflow/__fixtures__/small-business.ts` | exact |
| `src/lib/monthly-report/shared.ts` | utility / refactor | transform | `src/app/api/monthly-report/generate/route.ts:34-101` (in-file helpers being extracted) | refactor-in-place |
| `src/app/api/monthly-report/generate/route.ts` | controller (API) | request-response | (MODIFY — consume shared.ts) | self |
| `src/app/api/monthly-report/consolidated/route.ts` | controller (API) | request-response / CRUD | `src/app/api/monthly-report/generate/route.ts` + `src/app/api/cfo/summaries/route.ts` | exact (auth+RLS pattern) |
| `src/app/api/monthly-report/consolidated/route.test.ts` | test | integration | `src/lib/cashflow/engine.test.ts` | role match (no existing API test) |
| `src/app/finances/monthly-report/page.tsx` (MODIFY) | page | state / hook wiring | `src/app/finances/monthly-report/page.tsx` | self |
| `src/components/reports/ConsolidatedPLTab.tsx` | component (tab) | presentation | `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` + `BalanceSheetTab.tsx` | role + layout match |
| `src/components/reports/FXRateMissingBanner.tsx` | component (banner) | presentation | `src/app/finances/monthly-report/components/XeroConnectionBanner.tsx` | exact |
| `src/app/admin/consolidation/page.tsx` | page (admin) | CRUD (rate entry) | `src/app/cfo/page.tsx` (guard + list) + `src/app/admin/clients/page.tsx` | role match |
| `src/lib/consolidation/balance-sheet.ts` (34.1) | service / pure module | transform + aggregate | `src/lib/consolidation/engine.ts` (once built) fallback `src/lib/cashflow/engine.ts` | role match |
| `src/app/api/monthly-report/consolidated-bs/route.ts` (34.1) | controller (API) | request-response | `src/app/api/monthly-report/consolidated/route.ts` (once built) | self |
| `src/components/reports/ConsolidatedBSTab.tsx` (34.1) | component (tab) | presentation | `src/app/finances/monthly-report/components/BalanceSheetTab.tsx` | exact |
| `src/lib/consolidation/cashflow.ts` (34.2) | service / pure module | transform + aggregate | `src/lib/cashflow/engine.ts` (aggregated per-member) | role match |
| `src/app/api/monthly-report/consolidated-cashflow/route.ts` (34.2) | controller (API) | request-response | `src/app/api/monthly-report/generate/route.ts` | role match |
| `src/components/reports/ConsolidatedCashflowTab.tsx` (34.2) | component (tab) | presentation | `src/app/finances/monthly-report/components/CashflowTab.tsx` | exact |

> **Note on `src/components/reports/` directory:** This directory does **not currently exist** in the codebase. All existing tab components live under `src/app/finances/monthly-report/components/`. Planner must decide whether to create a new top-level `src/components/reports/` directory (as CONTEXT implies) **or** keep Consolidated tabs co-located in `src/app/finances/monthly-report/components/` (which matches every other `*Tab.tsx` in the codebase). Pattern-wise, co-location is the established convention — recommend co-locating and leaving the CONTEXT path as aspirational.

---

## Pattern Assignments

### `supabase/migrations/20260421_consolidation_groups.sql` (migration, schema + RLS)

**Analog:** `supabase/migrations/20260420_cfo_dashboard.sql` + `supabase/migrations/20260418_cashflow_calxa_tables.sql`

**RLS trifecta (copy exactly for every new table):** `20260420_cfo_dashboard.sql:46-67`
```sql
ALTER TABLE cfo_report_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_report_status_coach_all" ON cfo_report_status
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "cfo_report_status_super_admin_all" ON cfo_report_status
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "cfo_report_status_service_role" ON cfo_report_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
**Apply to:** `consolidation_groups`, `consolidation_group_members`, `consolidation_elimination_rules`, `fx_rates`. Substitute `business_id` predicate with `group_id IN (SELECT id FROM consolidation_groups WHERE business_id IN ...)` for member/rule tables.

**Table shape pattern:** `20260420_cfo_dashboard.sql:19-34`
```sql
CREATE TABLE IF NOT EXISTS cfo_report_status (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_month          date        NOT NULL,
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'ready_for_review', 'approved', 'sent')),
  ...
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, period_month)
);
```
Note the `CHECK (status IN (...))` enum pattern — reuse for `consolidation_elimination_rules.rule_type` and `direction`, and `fx_rates.rate_type` and `source`.

**Index + updated_at trigger pattern:** `20260418_cashflow_calxa_tables.sql:27-58`
```sql
CREATE INDEX IF NOT EXISTS xero_accounts_business_idx ON xero_accounts (business_id);
CREATE INDEX IF NOT EXISTS xero_accounts_type_idx ON xero_accounts (business_id, xero_type);

CREATE OR REPLACE FUNCTION update_xero_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER xero_accounts_updated_at
  BEFORE UPDATE ON xero_accounts
  FOR EACH ROW EXECUTE FUNCTION update_xero_accounts_updated_at();
```
Apply one trigger per new table that has `updated_at`.

**Idempotent column-add pattern (for `cfo_report_status.snapshot_data`):** `supabase/migrations/20260418b_cashflow_settings_tweaks.sql:8-36`
```sql
ALTER TABLE cashflow_settings
  ADD COLUMN IF NOT EXISTS depreciation_accumulated_account_ids jsonb DEFAULT '[]';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cashflow_settings'
      AND column_name = 'depreciation_accumulated_account_id'
  ) THEN
    EXECUTE $sql$ UPDATE ... $sql$;
  END IF;
END $$;
```
Apply pattern for: `ALTER TABLE cfo_report_status ADD COLUMN IF NOT EXISTS snapshot_data jsonb, ADD COLUMN IF NOT EXISTS snapshot_taken_at timestamptz`.

**Key fields to respect:**
- Every FK: `ON DELETE CASCADE` (matches existing convention)
- UUID PKs: `DEFAULT gen_random_uuid()` (not `DEFAULT uuid_generate_v4()` — project uses `gen_random_uuid`)
- Money columns: `numeric` (no fixed precision) — matches existing schema
- Do NOT add `SECURITY DEFINER` functions — project does not use them
- `functional_currency` default = `'AUD'` (per CONTEXT.md)

---

### `supabase/migrations/20260421b_seed_dragon_iict_groups.sql` (migration, seed data)

**Analog:** `supabase/migrations/20260419_cashflow_schedules.sql:51-58` (system-level seed pattern)

**Seed with conflict guard:**
```sql
INSERT INTO cashflow_schedules (name, base_periods, is_system, business_id) VALUES
  ('monthly', '[1,2,3,4,5,6,7,8,9,10,11,12]', true, NULL),
  ('quarterly_bas_au', '[4,4,4,7,7,7,10,10,10,2,2,2]', true, NULL),
  ...
ON CONFLICT (business_id, name) DO NOTHING;
```

**Apply to Phase 34 seed:** Use a DO block to resolve Dragon Roofing / Easy Hail / IICT business UUIDs by `name ILIKE`, then insert groups → members → elimination rules with `ON CONFLICT DO NOTHING`. Example:
```sql
DO $$
DECLARE
  v_dragon_group_id uuid;
  v_dragon_biz uuid;
  v_easyhail_biz uuid;
BEGIN
  SELECT id INTO v_dragon_biz FROM businesses WHERE name ILIKE '%Dragon Roofing%' LIMIT 1;
  SELECT id INTO v_easyhail_biz FROM businesses WHERE name ILIKE '%Easy Hail%' LIMIT 1;
  IF v_dragon_biz IS NULL OR v_easyhail_biz IS NULL THEN
    RAISE NOTICE 'Dragon or Easy Hail business not found — skipping seed';
    RETURN;
  END IF;
  INSERT INTO consolidation_groups (name, business_id, presentation_currency)
    VALUES ('Dragon Consolidation', v_dragon_biz, 'AUD')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_dragon_group_id;
  -- ... members + elimination rules
END $$;
```

**Key conventions:**
- `RAISE NOTICE` (not ERROR) when seed preconditions unmet — migration must remain idempotent
- Use `ILIKE` with wildcards for business name resolution (businesses may have full legal name suffixes like " Pty Ltd")
- Always `ON CONFLICT DO NOTHING` so re-running the migration is safe

---

### `src/lib/consolidation/engine.ts` (service, transform+aggregate)

**Analog:** `src/lib/cashflow/engine.ts`

**Imports & module doc pattern:** `src/lib/cashflow/engine.ts:1-24`
```typescript
/**
 * Calxa-style Cashflow Forecast Engine
 *
 * Converts an accrual P&L forecast into a cash-timing budget showing
 * when money actually hits the bank. Handles DSO/DPO timing, GST gross-up,
 * BAS payments, superannuation, PAYG withholding & instalments, loans, and stock.
 */

import type {
  PLLine,
  PayrollSummary,
  ...
} from '@/app/finances/forecast/types'
import {
  buildAccountLookup,
  resolveIsDepreciation,
} from './account-resolution'
```
- No runtime imports of `@supabase/supabase-js` in the engine — engine receives an injected `supabase` client (keeps module testable).
- Types imported from co-located `./types` or from `@/app/finances/forecast/types`.

**Pure function shape pattern:** `src/lib/cashflow/engine.ts:93-105`
```typescript
export function getTimingSplit(days: number): { offset: number; portion: number }[] {
  if (days <= 0) return [{ offset: 0, portion: 1 }]
  const bucket = Math.floor(days / 30)
  const fraction = (days % 30) / 30
  const splits: { offset: number; portion: number }[] = []
  ...
  return splits
}
```
Every helper exported for independent unit testing. `engine.ts` is pure — all I/O in the route layer.

**Parallel member-fetch pattern (from RESEARCH.md + sync-xero analog):**
Source: `src/app/api/monthly-report/sync-xero/route.ts:131-133` + `src/app/api/cfo/summaries/route.ts:169-175`
```typescript
const ids = await resolveBusinessIds(supabaseAdmin, business_id);
// ...
const { data: xeroLines } = await supabase
  .from('xero_pl_lines')
  .select('business_id, account_type, monthly_values')
  .in('business_id', allRelatedIds)
```
**Apply to engine:** Call `resolveBusinessIds(supabase, member.source_business_id)` for each member, then a single `Promise.all` to pull `xero_pl_lines` per member.

**Key signatures to replicate:**
- Main entry: `export async function buildConsolidation(supabase, groupId, reportMonth, fiscalYear): Promise<ConsolidatedReport>`
- All sub-functions exported (e.g. `alignAccountUniverse`, `translateMember`, `combineEntities`) for isolated testing.

**Critical conventions:**
- **Dual-ID resolution** — always use `resolveBusinessIds` on every member's `source_business_id`. Never query `xero_pl_lines` by a raw ID.
- **Account alignment key** (Pitfall 4 from RESEARCH.md): `${account_type}::${account_name.toLowerCase().trim()}` — do NOT align by name alone.
- **Deduplicate** `xero_pl_lines` per member the same way `generate/route.ts:254-265` does (merge `monthly_values` by `account_name`).

---

### `src/lib/consolidation/eliminations.ts` (service, transform)

**Analog:** `src/lib/utils/account-matching.ts` (fuzzy + regex matching) + `src/lib/cashflow/engine.ts` (pure helpers)

**Rule-matching pattern (from RESEARCH.md § Pattern 3):**
Implementation should follow RESEARCH.md:342-406 verbatim for the `applyEliminations` shape. Key points to replicate:
- `matchRuleToLines(rule, side, lines)` — first match by `account_code` exact, then `account_name_pattern` via `new RegExp(pattern, 'i').test(line.account_name)`.
- Returns `EliminationEntry[]` — negative amounts reduce consolidated total.
- Emits rule + source-entity metadata for the diagnostic view (`rule_description`, `source_entity_id`, `source_amount`).

**Project-level pattern to follow:** `src/lib/utils/account-matching.ts` uses a `buildFuzzyLookup` factory function; consolidation should provide an analogous `buildEliminationMatcher` factory if rule count grows >20.

**Anti-pattern flagged by research:** do NOT attempt pattern-matching in SQL. Keep rule evaluation in TypeScript.

---

### `src/lib/consolidation/fx.ts` (utility, transform)

**Analog:** `src/lib/cashflow/company-tax.ts` (period-keyed lookup utility)

**Pattern to follow (from RESEARCH.md § Pattern 2, lines 290-307):**
```typescript
export function translatePLAtMonthlyAverage(
  lines: XeroPLLine[],
  rates: Map<string, number>,  // keyed by period_month 'YYYY-MM'
): XeroPLLine[] {
  return lines.map(line => ({
    ...line,
    monthly_values: Object.fromEntries(
      Object.entries(line.monthly_values).map(([month, value]) => {
        const rate = rates.get(month)
        if (rate === undefined) {
          console.warn(`[FX] Missing rate for ${month} — passing through untranslated`)
          return [month, value]
        }
        return [month, value * rate]
      })
    )
  }))
}
```

**Critical conventions:**
- Currency-pair string format: `'HKD/AUD'` (slash separator, matches CONTEXT.md schema — NOT underscore)
- Rate `period` column stored as `date` (first-of-month for `monthly_average`, month-end for `closing_spot`)
- Never silently fall back to `1.0` — always surface missing rate in the response `fx_context.missing_rates[]`
- Do NOT fabricate new `monthly_values` keys not present in source (Pitfall 2 from RESEARCH.md)
- No NZD / no cron — this module is entirely HKD/AUD + manual rates (per POST-RESEARCH CORRECTIONS)

**Rate loader signature:**
```typescript
export async function loadFxRates(
  supabase: SupabaseClient,
  pair: string,       // 'HKD/AUD'
  rateType: 'monthly_average' | 'closing_spot',
  months: string[],   // ['2025-07', '2025-08', ...]
): Promise<Map<string, number>>
```

---

### `src/lib/consolidation/types.ts` (type module)

**Analog:** `src/app/finances/forecast/types.ts` (inferred — imported by cashflow engine)

Pattern: define every data type used by the engine as an interface/type in this file. Re-export from `index.ts` if the module has one. Use `XeroPLLine` shape as inferred from `src/app/api/monthly-report/generate/route.ts:244-265`:
```typescript
interface XeroPLLine {
  business_id: string
  account_name: string
  account_code?: string | null
  account_type: string        // 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'
  section: string
  monthly_values: Record<string, number>   // 'YYYY-MM' → amount
}
```
Plus new types for the consolidation domain: `ConsolidationGroup`, `ConsolidationMember`, `EliminationRule`, `EliminationEntry`, `FxRateRow`, `EntityColumn`, `ConsolidatedReport`.

---

### `src/lib/consolidation/engine.test.ts` / `eliminations.test.ts` / `fx.test.ts` (unit tests)

**Analog:** `src/lib/cashflow/engine.test.ts`

**Test file header pattern:** `src/lib/cashflow/engine.test.ts:1-17`
```typescript
import { describe, it, expect } from 'vitest'
import {
  generateCashflowForecast,
  getTimingSplit,
  isDepreciationExpense,
} from './engine'
import {
  FY_MONTHS,
  FORECAST,
  baseAssumptions,
  smallBusinessPL,
  ...
} from './__fixtures__/small-business'
```

**Describe-it block style:** `src/lib/cashflow/engine.test.ts:20-70`
```typescript
describe('getTimingSplit', () => {
  it('returns 100% same-month for 0 days', () => {
    const split = getTimingSplit(0)
    expect(split).toEqual([{ offset: 0, portion: 1 }])
  })
  ...
})
```

**Conventions:**
- `vitest` with named imports from `'vitest'` (no default import, no globals assumed)
- Fixtures live in `./__fixtures__/`
- Use `toBeCloseTo(x, 6)` for float math (not `toBe`)
- One `describe` block per exported public function

**Phase-specific tests to add (per RESEARCH.md § Test Map):**
- `engine.test.ts -t "Dragon March 2026"` — asserts the reference PDF numbers land within $1
- `engine.test.ts -t "IICT March 2026"` — FX path
- `eliminations.test.ts -t "bidirectional"` — ±$9,015 advertising transfer nets to $0
- `fx.test.ts` — monthly average translation + missing-rate pass-through

---

### `src/lib/consolidation/__fixtures__/dragon-mar-2026.ts` / `iict-mar-2026.ts` (test fixtures)

**Analog:** `src/lib/cashflow/__fixtures__/small-business.ts`

**Fixture file pattern:** `src/lib/cashflow/__fixtures__/small-business.ts:1-45`
```typescript
/**
 * Test fixtures for a realistic small-business cashflow scenario.
 */

import type {
  PLLine, PayrollSummary, CashflowAssumptions, FinancialForecast,
} from '@/app/finances/forecast/types'
import { getDefaultCashflowAssumptions } from '../engine'

export const FY_MONTHS = [
  '2025-07', '2025-08', ..., '2026-06',
]

export function evenSpread(months: string[], amount: number): Record<string, number> {
  const result: Record<string, number> = {}
  for (const m of months) result[m] = amount
  return result
}
```

**Apply to:** `dragon-mar-2026.ts` encodes the exact numbers from Matt's Dragon Consolidated Finance Report PDF (account-by-account per entity). `iict-mar-2026.ts` encodes the IICT PDF with the IICT Group Limited figures pre-translation (in HKD) plus the monthly-average rate used.

**Conventions:**
- Export `FY_MONTHS` array of `'YYYY-MM'` strings
- Provide `evenSpread(months, amount)` helper (copy from cashflow fixtures)
- Export named fixtures like `dragonRoofingPL`, `easyHailPL`, `iictAustPL`, `iictHKPL`, `dragonExpectedConsolidated`

---

### `src/lib/monthly-report/shared.ts` (utility — NEW, extracted refactor)

**Analog:** `src/app/api/monthly-report/generate/route.ts:34-101` (helpers currently inlined)

**Extract these functions verbatim** from `generate/route.ts` into the new module:
- `mapTypeToCategory(accountType)` (lines 34-43)
- `calcVariance(actual, budget, isRevenue)` (lines 48-52)
- `buildSubtotal(lines, label)` (lines 55-73)
- `getMonthRange(start, end)` (lines 76-88)
- `getNextMonth(monthKey)` (lines 91-95)
- `getPriorYearMonth(monthKey)` (lines 98-101)

Also extract the `ReportLine` interface (lines 15-31).

**Key excerpt to copy exactly (sign-convention-critical):**
```typescript
// generate/route.ts:48-52
export function calcVariance(actual: number, budget: number, isRevenue: boolean): { amount: number; percent: number } {
  const amount = isRevenue ? actual - budget : budget - actual
  const percent = budget !== 0 ? (amount / Math.abs(budget)) * 100 : 0
  return { amount, percent }
}
```

**Note duplication:** `src/app/api/monthly-report/full-year/route.ts:16-39` already duplicates `getMonthRange` and `mapTypeToCategory`. Refactor should migrate `full-year/route.ts` to `shared.ts` imports too (bonus cleanup, but note the scope expansion if plan wants to include it).

---

### `src/app/api/monthly-report/generate/route.ts` (MODIFY — consume shared.ts)

**Change:** Replace in-file helper definitions (lines 34-101) with:
```typescript
import {
  mapTypeToCategory,
  calcVariance,
  buildSubtotal,
  getMonthRange,
  getNextMonth,
  getPriorYearMonth,
  type ReportLine,
} from '@/lib/monthly-report/shared'
```
All other behaviour preserved. The file is ~600 lines; nothing below line 104 needs to change.

---

### `src/app/api/monthly-report/consolidated/route.ts` (controller, request-response)

**Analog:** `src/app/api/monthly-report/generate/route.ts` (auth + dual supabase client) + `src/app/api/cfo/summaries/route.ts` (coach/super_admin guard pattern)

**Route file preamble pattern:** `src/app/api/monthly-report/generate/route.ts:1-13`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
```
- `dynamic = 'force-dynamic'` on every API route
- `createClient` with **service key** for DB reads (not anon) — required to query `xero_pl_lines` across member businesses
- `createRouteHandlerClient` for `auth.getUser()` — the user-scoped session

**Auth guard pattern:** `generate/route.ts:107-147`
```typescript
const authSupabase = await createRouteHandlerClient()
const { data: { user }, error: authError } = await authSupabase.auth.getUser()
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const body = await request.json()
const { business_id, report_month, fiscal_year } = body
if (!business_id || !report_month || !fiscal_year) {
  return NextResponse.json({ error: 'business_id, report_month, and fiscal_year are required' }, { status: 400 })
}

// Rate limit
const rateLimit = checkRateLimit(createRateLimitKey('report-generate', user.id), RATE_LIMIT_CONFIGS.report)
if (!rateLimit.allowed) {
  return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
}

// Access check
const { data: bizAccess } = await authSupabase
  .from('businesses').select('id').eq('id', business_id)
  .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
  .maybeSingle()
if (!bizAccess) {
  return NextResponse.json({ error: 'Access denied' }, { status: 403 })
}
```

**Coach/super_admin-only guard (alternative pattern for admin-facing routes):** `src/app/api/cfo/summaries/route.ts:110-122`
```typescript
const { data: roleRow } = await supabase
  .from('system_roles').select('role').eq('user_id', user.id).maybeSingle()

const isSuperAdmin = roleRow?.role === 'super_admin'
const isCoach = roleRow?.role === 'coach'

if (!isSuperAdmin && !isCoach) {
  return NextResponse.json({ error: 'Access denied — coach or super_admin required' }, { status: 403 })
}
```
Use the `business_id` owner-or-coach pattern for the consolidated route (since the parent business ID is already scoped to an owner). Use the coach/super_admin pattern for the admin FX rate route.

**Stage-tracking for error diagnosis:** `src/app/api/monthly-report/sync-xero/route.ts:114-147`
```typescript
let stage = 'init';
try {
  stage = 'auth';
  // ...
  stage = 'resolve_business_ids';
  const ids = await resolveBusinessIds(supabaseAdmin, business_id);
  // ...
} catch (err) {
  return NextResponse.json({ error: 'Internal error', stage, detail: String(err) }, { status: 500 });
}
```
Recommend copying this pattern for the consolidated route since it orchestrates many sub-operations.

**Key signatures / request body:**
```typescript
POST /api/monthly-report/consolidated
body: { business_id: string, report_month: string, fiscal_year: number }
// (business_id resolves via consolidation_groups.business_id — no new ID shape)
```

---

### `src/app/finances/monthly-report/page.tsx` (MODIFY — add consolidation detection)

**Analog:** self (lines 1-100 show current structure) + `src/app/finances/monthly-report/hooks/useMonthlyReport.ts` for hook shape

**Hook-based data loading pattern (current):** `src/app/finances/monthly-report/page.tsx:83-98`
```typescript
const {
  report, isLoading: reportLoading, error: reportError, generateReport, saveSnapshot, loadSnapshot,
} = useMonthlyReport(businessId)

const {
  fullYearReport, isLoading: fullYearLoading, error: fullYearError, loadFullYear,
} = useFullYearReport(businessId)
```

**Addition required:**
1. Add a new `useConsolidatedReport(businessId)` hook alongside existing ones.
2. Early in the page, detect whether `businessId` is a consolidation group parent by querying `consolidation_groups.business_id = businessId`. If match, switch mode to `'consolidated'` and render `ConsolidatedPLTab` + pass through the same templates/settings.
3. New tab ID `'consolidated'` — add to the `activeTab` union type and to the `MonthlyReportTabs` component.

**Active-tab persistence (conform to existing pattern):** `page.tsx:73-81`
```typescript
const [activeTab, setActiveTab] = useState<ReportTab>(() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('monthly-report-active-tab')
    if (saved && ['report', 'full-year', ..., 'history'].includes(saved)) {
      return saved as ReportTab
    }
  }
  return 'report'
})
```
Add `'consolidated'` to the allowlist.

---

### `src/components/reports/ConsolidatedPLTab.tsx` (component, presentation) — NEW

**Analog:** `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` (table structure + cell formatting) + `src/app/finances/monthly-report/components/BalanceSheetTab.tsx` (multi-column table layout)

**Formatting helper pattern:** `BudgetVsActualTable.tsx:15-31`
```typescript
function fmt(value: number | null, dash = false): string {
  if (value === null || (dash && value === 0)) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function varianceColor(amount: number, isRevenue: boolean): string {
  if (amount === 0) return ''
  const favorable = isRevenue ? amount > 0 : amount > 0
  return favorable ? 'text-green-700' : 'text-red-600'
}
```
Reuse verbatim — do NOT redefine formatters.

**Row+Cell structure pattern:** `BalanceSheetTab.tsx:27-70`
```typescript
function AmountCell({ value, className = '' }: { value: number | null; className?: string }) {
  return (
    <td className={`text-right tabular-nums pr-4 ${isNegative(value) ? 'text-red-600' : 'text-gray-900'} ${className}`}>
      {formatAmount(value)}
    </td>
  )
}
```

**Per-entity column layout requirement:**
- Sticky first column (Account Name)
- N middle columns = entities in `byEntity[]`, variable-width scrollable
- Sticky second-to-last column (Eliminations)
- Sticky last column (Consolidated)
- Desktop: `overflow-x-auto` on wrapper, `position: sticky` for pinned cols
- Mobile: toggle pills + always-visible Consolidated column (per CONTEXT.md UI spec)

**Client component header:** every tab file starts with `'use client'` (verified across BalanceSheetTab, CashflowTab, BudgetVsActualTable).

---

### `src/components/reports/FXRateMissingBanner.tsx` (component, presentation) — NEW

**Analog:** `src/app/finances/monthly-report/components/XeroConnectionBanner.tsx`

Pattern: inline warning banner rendered above the main table when `response.fx_context.missing_rates.length > 0`.

**Visual convention from existing code (`BalanceSheetTab.tsx:30-44`):**
```tsx
<td className={`text-right tabular-nums pr-4 ${isNegative(value) ? 'text-red-600' : 'text-gray-900'}`}>
```
Red = error/alert. Amber = warning (used in `cfo/page.tsx:77` BADGE_STYLES). Use amber (`bg-amber-50 border-amber-200 text-amber-800`) for "rate missing" since it's recoverable (user can add the rate).

**Copy structure from `CashflowTab.tsx:27-33`:**
```tsx
if (error) {
  return (
    <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
      <p className="text-sm text-red-800">{error}</p>
    </div>
  )
}
```

**Required props:**
```typescript
interface FXRateMissingBannerProps {
  missingRates: { currency_pair: string; period: string }[]
  onAddRate: () => void  // navigate to admin/consolidation page
}
```

---

### `src/app/admin/consolidation/page.tsx` (admin page, CRUD)

**Analog:** `src/app/cfo/page.tsx` (data-fetch + table) + `src/app/cfo/layout.tsx` (route guard) + `src/app/admin/clients/page.tsx` (admin UI composition)

**Route-guard pattern (if nesting under /admin):** `src/app/cfo/layout.tsx:12-39`
```typescript
'use client'
import { getUserSystemRole } from '@/lib/auth/roles'
// ...
export default function CfoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getUserSystemRole().then(role => {
      if (role === 'coach' || role === 'super_admin') {
        setChecking(false)
      } else {
        router.replace('/dashboard')
      }
    })
  }, [router])
  ...
}
```
Add a matching `src/app/admin/consolidation/layout.tsx` or co-opt the existing `/admin/*` guard (verify if `src/app/admin/layout.tsx` exists — not in the Glob results, so a new layout may be needed).

**Page data-load pattern:** `src/app/cfo/page.tsx:103-125`
```typescript
export default function CfoDashboardPage() {
  const [month, setMonth] = useState(defaultReportMonth())
  const [data, setData] = useState<SummariesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSummaries = async () => {
    setIsLoading(true); setError(null)
    try {
      const res = await fetch(`/api/cfo/summaries?month=${month}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to load (${res.status})`)
      }
      // ...
    }
  }
}
```

**PageHeader convention:** every page uses `<PageHeader>` from `@/components/ui/PageHeader` (verified in `cfo/page.tsx:6`, `admin/clients/page.tsx:13`, `finances/monthly-report/page.tsx:10`).

**Required UI sections (from CONTEXT.md):**
1. FX rate entry form — inputs for `currency_pair`, `rate_type`, `period`, `rate`. POST to a new `/api/consolidation/fx-rates` route.
2. Existing rates table per group (list, edit, delete).
3. Eliminations diagnostic view — list all active rules per group (data-driven from `consolidation_elimination_rules`).

---

## Iteration 34.1 & 34.2 File Patterns

### `src/lib/consolidation/balance-sheet.ts` (34.1)

**Analog:** `src/lib/consolidation/engine.ts` (once built — same shape, different table/translation rule) + existing BS rendering under `src/app/finances/monthly-report/hooks/useBalanceSheet.ts` and `components/BalanceSheetTab.tsx`.

Mirror `engine.ts` structure:
- `export async function buildConsolidatedBalanceSheet(supabase, groupId, asOfDate): Promise<ConsolidatedBalanceSheet>`
- FX translation uses `closing_spot` rate type (not `monthly_average`)
- Computes CTA (Cumulative Translation Adjustment) as a synthetic equity line per RESEARCH.md Pitfall 5 & 6
- Intercompany loan eliminations are **two-sided** (zero A side AND B side) to keep BS balanced

### `src/app/api/monthly-report/consolidated-bs/route.ts` (34.1)

**Analog:** `src/app/api/monthly-report/consolidated/route.ts` (once built)

Copy same auth pattern, replace `report_month` with `as_of_date` body param, invoke `buildConsolidatedBalanceSheet` instead of `buildConsolidation`.

### `src/components/reports/ConsolidatedBSTab.tsx` (34.1)

**Analog:** `src/app/finances/monthly-report/components/BalanceSheetTab.tsx` (lines 48-100 — full row/cell/subtotal structure). Extend with per-entity columns (same pattern as `ConsolidatedPLTab.tsx`).

Additional row type: `CumulativeTranslationAdjustmentRow` — single synthetic equity line with data-driven label.

### `src/lib/consolidation/cashflow.ts` (34.2)

**Analog:** `src/lib/cashflow/engine.ts` — the consolidation aggregator calls the existing `generateCashflowForecast` per member and aggregates the outputs.

Pattern:
```typescript
export async function buildConsolidatedCashflow(
  supabase: SupabaseClient, groupId: string, opts: {...}
): Promise<ConsolidatedCashflowForecastData> {
  const members = await loadGroupMembers(supabase, groupId)
  const memberForecasts = await Promise.all(
    members.map(async m => {
      const ids = await resolveBusinessIds(supabase, m.source_business_id)
      // load PL, payroll, assumptions per member (current per-business shape)
      return generateCashflowForecast(...)
    })
  )
  return combineCashflowForecasts(memberForecasts, /* fx context */)
}
```

### `src/app/api/monthly-report/consolidated-cashflow/route.ts` (34.2)

**Analog:** `src/app/api/monthly-report/consolidated/route.ts` (structure) + `src/app/api/monthly-report/generate/route.ts` (forecast-loading boilerplate).

### `src/components/reports/ConsolidatedCashflowTab.tsx` (34.2)

**Analog:** `src/app/finances/monthly-report/components/CashflowTab.tsx:1-60` — copy loading/error/empty states verbatim. Extend with per-entity column toggle (same pattern as ConsolidatedPLTab).

---

## Shared Patterns

### Dual-ID Resolution (CRITICAL — mandatory everywhere)
**Source:** `src/lib/utils/resolve-business-ids.ts`
**Apply to:** `engine.ts`, `balance-sheet.ts`, `cashflow.ts`, every API route, every seed migration that queries `xero_pl_lines` or `forecast_pl_lines`.
```typescript
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

const ids = await resolveBusinessIds(supabase, member.source_business_id)
const { data } = await supabase
  .from('xero_pl_lines').select('*').in('business_id', ids.all)
```
**Why:** `xero_pl_lines`, `financial_forecasts`, `forecast_pl_lines`, `xero_connections` use `business_profiles.id`. `businesses`, `business_users`, `cfo_report_status` use `businesses.id`. Without `resolveBusinessIds` cross-ID lookups silently return empty.

### Auth + Access (owner or coach)
**Source:** `src/app/api/monthly-report/generate/route.ts:107-147`
**Apply to:** consolidated route, consolidated-bs route, consolidated-cashflow route
Copy the auth block verbatim (replace `'report-generate'` rate-limit key with `'consolidated-report'` and use a longer window since consolidation is heavier).

### Coach/Super-Admin Only Guard (for admin endpoints)
**Source:** `src/app/api/cfo/summaries/route.ts:110-122` + `src/app/api/cfo/flag-client/route.ts:28-40`
**Apply to:** FX rate CRUD, consolidation group management routes under `/api/consolidation/*` and admin page `/admin/consolidation`.

### Error Handling & Logging
**Source:** across all API routes — `console.error('[{Module Name}] description:', err)` prefix pattern.
**Apply to:** every new route. Use `[Consolidation Engine]`, `[Consolidated Report]`, `[FX Rates]` prefixes.

### Rate Limiting
**Source:** `src/app/api/monthly-report/generate/route.ts:127-136`
```typescript
const rateLimit = checkRateLimit(
  createRateLimitKey('report-generate', user.id),
  RATE_LIMIT_CONFIGS.report
)
if (!rateLimit.allowed) {
  return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
}
```
**Apply to:** consolidated route(s). Verify `RATE_LIMIT_CONFIGS.report` is sufficient; if not, add a new config entry.

### Supabase Client Usage
**Rule:** Two-client pattern per route:
- `supabaseAdmin` / module-level `supabase` → created with `SUPABASE_SERVICE_KEY` → for DB reads/writes across businesses
- `authSupabase` → `await createRouteHandlerClient()` → for user session / auth check only

Verified across `generate/route.ts`, `sync-xero/route.ts`, `cfo/summaries/route.ts`. Do NOT diverge.

### Deduplication of `xero_pl_lines`
**Source:** `src/app/api/monthly-report/generate/route.ts:254-268`
**Apply to:** `engine.ts` when loading per-member PL — production data has race-induced duplicates that must be merged by `account_name`.

### Migration Filename Convention
**Source:** `supabase/migrations/` listing
Pattern: `YYYYMMDD_<slug>.sql` and `YYYYMMDD<letter>_<slug>.sql` for same-day follow-ups. Phase 34 should use `20260421_consolidation_groups.sql`, `20260421b_seed_dragon_iict_groups.sql` (matches CONTEXT.md's filenames).

### Test Framework
**Source:** `src/lib/cashflow/engine.test.ts` (vitest)
- `import { describe, it, expect } from 'vitest'` — no globals
- Co-locate test files next to source: `engine.ts` + `engine.test.ts`
- Fixtures under `./__fixtures__/`
- Run: `npx vitest run src/lib/consolidation`

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none) | — | — | Every file in the scope list maps cleanly to an existing analog. |

The closest-to-novel area is the `admin/consolidation/page.tsx` page which blends `/cfo` (coach-style dashboard with data loading) + `/admin/clients` (admin CRUD table) + forms. No single analog; use the composite pattern above.

---

## Metadata

**Analog search scope:** `src/app/api/monthly-report/`, `src/app/api/cfo/`, `src/app/cfo/`, `src/app/admin/`, `src/app/finances/monthly-report/`, `src/lib/cashflow/`, `src/lib/utils/`, `src/lib/supabase/`, `src/lib/auth/`, `src/components/`, `supabase/migrations/`.
**Files scanned:** ~40 (targeted reads + glob results).
**Pattern extraction date:** 2026-04-18.
**CLAUDE.md / project skills:** no `CLAUDE.md`, `.claude/skills/`, or `.agents/skills/` directory present in working directory — no project-specific rules to honor beyond RESEARCH.md and CONTEXT.md.

---

## PATTERN MAPPING COMPLETE

**Phase:** 34 — Dragon Multi-Entity Consolidation
**Files classified:** 25
**Analogs found:** 25 / 25 (100%)

### Coverage
- Files with exact analog: 15 (migrations, tests, tab components, API routes, banner)
- Files with role-match analog: 10 (consolidation engine, FX module, admin page, fixtures, types, shared extraction)
- Files with no analog: 0

### Key Patterns Identified
- **Dual supabase clients** — every API route uses module-level `createClient(..., SUPABASE_SERVICE_KEY)` for data and `await createRouteHandlerClient()` for auth; never mix.
- **`resolveBusinessIds` is mandatory** — any query against `xero_pl_lines`, `forecast_pl_lines`, `financial_forecasts`, `xero_connections` must resolve both `businesses.id` and `business_profiles.id` first. The consolidation engine loops members and resolves each.
- **RLS trifecta on every new table** — coach-all, super_admin-all, service_role-all. Migrations 20260420 and 20260418 are the canonical templates.
- **Account alignment key** must be `${account_type}::${account_name.toLowerCase().trim()}` to avoid Pitfall 4 (same-name-different-type mis-merge).
- **Pure-function engine** — `src/lib/cashflow/engine.ts` sets the pattern: all I/O external, every helper exported for independent unit tests, module header docblock describes domain.
- **Co-located tab components** — `src/app/finances/monthly-report/components/*Tab.tsx` is the established home; planner should consider co-locating new `Consolidated*Tab` files there rather than creating a new `src/components/reports/` directory (CONTEXT lists the latter but it does not exist today).
- **Rule seed migrations use `DO $$ … RAISE NOTICE … RETURN`** guards so they remain idempotent when preconditions (e.g. missing businesses) aren't met.
- **Helper extraction (Phase 34 pre-work)** — `src/lib/monthly-report/shared.ts` is the first task: move `calcVariance`, `buildSubtotal`, `mapTypeToCategory`, `getMonthRange`, `getNextMonth`, `getPriorYearMonth`, `ReportLine` from `generate/route.ts:15-101` into the shared module before writing the consolidated route.

### File Created
`/workspaces/wisdom-business-intelligence/.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference these analogs directly in each plan's action steps — every new file has a concrete model in the existing codebase.

### Confidence Assessment
**HIGH** for: migrations (two canonical analogs verified), engine module (cashflow engine is a close structural twin), API routes (generate/sync-xero/cfo-summaries all confirm the same pattern), tests and fixtures (cashflow tests verified), shared refactor (source helpers read and confirmed line-by-line).

**MEDIUM** for: `src/components/reports/` directory placement — CONTEXT lists this path but it does not exist in the codebase; planner must choose between creating it or co-locating with existing `monthly-report/components/`. Both are documented above.

**MEDIUM** for: admin/consolidation page — no single analog matches all requirements (coach-role page + admin CRUD table + data-entry form), so pattern is a composite of `/cfo/page.tsx` + `/admin/clients/page.tsx`.
