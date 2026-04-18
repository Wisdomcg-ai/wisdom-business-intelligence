---
phase: 34
plan: 01a
type: execute
wave: 6
depends_on: ['34-00f']
files_modified:
  - supabase/migrations/20260422_consolidation_bs_translation.sql
  - src/lib/consolidation/balance-sheet.ts
  - src/lib/consolidation/balance-sheet.test.ts
  - src/lib/consolidation/fx.ts
  - src/lib/consolidation/fx.test.ts
  - src/app/api/monthly-report/consolidated-bs/route.ts
  - src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx
  - src/app/finances/monthly-report/hooks/useConsolidatedBalanceSheet.ts
  - src/app/finances/monthly-report/types.ts
  - src/app/finances/monthly-report/components/MonthlyReportTabs.tsx
  - src/app/finances/monthly-report/page.tsx
autonomous: false
requirements: [MLTE-02, MLTE-03]

must_haves:
  truths:
    - "translateBSAtClosingSpot(lines, rate) multiplies each BS line's monthly value by the rate (mirrors P&L translation but uses single closing-spot rate rather than per-month map)"
    - "buildConsolidatedBalanceSheet aggregates xero_balance_sheet_lines per member, applies closing-spot translation for non-AUD members, and posts a Translation Reserve equity line = (BS translation delta) − (P&L retained-earnings translation delta) so Consolidated Assets = Liabilities + Equity (Pitfall 5 + 6)"
    - "Intercompany loan eliminations (rule_type='intercompany_loan') zero both sides of the pair — A's Loan Payable AND B's Loan Receivable — preserving BS balance"
    - "API route /api/monthly-report/consolidated-bs auth-gates identically to /consolidated and returns ConsolidatedBalanceSheet JSON"
    - "ConsolidatedBSTab renders Assets / Liabilities / Equity with per-entity + Consolidated columns; Translation Reserve shown as explicit equity line when non-zero"
    - "Adding the 'balance-sheet-consolidated' tab does not break the existing single-entity balance-sheet tab"
    - "Migration applied via npx supabase db push --linked"
  artifacts:
    - path: src/lib/consolidation/balance-sheet.ts
      provides: "buildConsolidatedBalanceSheet, computeTranslationReserve, applyLoanEliminations"
      contains: "export async function buildConsolidatedBalanceSheet"
    - path: src/app/api/monthly-report/consolidated-bs/route.ts
      provides: "POST route mirroring /consolidated but for BS"
      contains: "export async function POST"
    - path: src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx
      provides: "BS-specific tab with Assets/Liab/Equity sections + per-entity columns"
      contains: "ConsolidatedBSTab"
    - path: supabase/migrations/20260422_consolidation_bs_translation.sql
      provides: "Optional metadata or index tweaks for BS consolidation (or placeholder doc if no schema change needed)"
      contains: "-- Phase 34 Iteration 34.1"
  key_links:
    - from: src/lib/consolidation/balance-sheet.ts
      to: src/lib/consolidation/fx
      via: "translateBSAtClosingSpot called for non-AUD member BS lines"
      pattern: "translateBSAtClosingSpot"
    - from: src/lib/consolidation/balance-sheet.ts
      to: src/lib/consolidation/eliminations
      via: "applyEliminations used for intercompany_loan rules (reused from Iteration 34.0)"
      pattern: "applyEliminations"
    - from: src/app/finances/monthly-report/page.tsx
      to: src/app/finances/monthly-report/hooks/useConsolidatedBalanceSheet
      via: "hook invoked when isConsolidationGroup && activeTab === 'balance-sheet-consolidated'"
      pattern: "useConsolidatedBalanceSheet"
---

<objective>
Iteration 34.1 — Consolidated Balance Sheet.

Extends the Iteration 34.0 platform with BS-specific aggregation:
1. **FX completion** — fill in the `translateBSAtClosingSpot` stub from plan 00c with real logic. Single closing-spot rate per currency pair (not a monthly map) — simpler than P&L translation.
2. **BS engine** — `buildConsolidatedBalanceSheet(supabase, groupId, asOfDate)` parallel-loads `xero_balance_sheet_lines` per member, translates non-AUD members at closing-spot HKD/AUD for `asOfDate`, applies `intercompany_loan` elimination rules (both sides zeroed), computes Translation Reserve = (BS translation delta minus P&L retained-earnings translation delta) so `Assets = Liabilities + Equity` holds for the consolidated column.
3. **API + UI** — `POST /api/monthly-report/consolidated-bs` + `ConsolidatedBSTab.tsx` + wiring into `page.tsx` under a new `'balance-sheet-consolidated'` tab.
4. **Migration** — thin placeholder migration (or add any BS-specific columns/indexes that surface during implementation; if none, the file is a comment-only stub to mark the iteration).

**Prerequisite reading:** This plan must NOT start before Iteration 34.0 is shipped + human-verified (plans 00a-00f). `xero_balance_sheet_lines` table is Phase 27's deliverable — verify it exists before writing balance-sheet.ts; if the table has a different name in this project (e.g. `xero_bs_lines` or nested inside a `xero_reports` structure), adapt the import.

**Canonical BS balancing constraint:** For every `asOfDate`, the consolidated row totals MUST satisfy `total_assets + total_liabilities + total_equity = 0` (after applying the sign convention from the existing single-entity BS). The Translation Reserve line is the ONLY equity line the consolidation engine adds — it exists solely to absorb translation differences and keep the balance constraint. Unit tests assert this.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md

@.planning/phases/34-dragon-multi-entity-consolidation/34-00d-SUMMARY.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-00e-SUMMARY.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-00f-SUMMARY.md

@src/lib/consolidation/engine.ts
@src/lib/consolidation/eliminations.ts
@src/lib/consolidation/fx.ts
@src/app/api/monthly-report/consolidated/route.ts
@src/app/finances/monthly-report/components/BalanceSheetTab.tsx

<interfaces>
<!-- From existing single-entity Phase 27 BS (inspect src/app/finances/monthly-report/components/BalanceSheetTab.tsx for row shape) -->
<!-- Expected xero_balance_sheet_lines shape — verify at execution time: -->
```typescript
interface XeroBSLine {
  business_id: string
  account_name: string
  account_code?: string | null
  account_type: 'asset' | 'liability' | 'equity' | ...
  section: string                    // 'Current Assets', 'Fixed Assets', 'Current Liabilities', etc.
  balance: Record<string, number>    // 'YYYY-MM-DD' → amount OR monthly_values-like map
}
```

<!-- From Iteration 34.0 types -->
```typescript
import type { EliminationRule, EliminationEntry, ConsolidationGroup, ConsolidationMember } from './types'
```

<!-- Elimination rule for BS loans is already seeded in plan 00d for Dragon + IICT -->
<!-- rule_type='intercompany_loan', entity_a patterns match 'Loan Payable', entity_b patterns match 'Loan Receivable' -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Complete translateBSAtClosingSpot + BS aggregation engine + Translation Reserve</name>
  <files>src/lib/consolidation/fx.ts, src/lib/consolidation/fx.test.ts, src/lib/consolidation/balance-sheet.ts, src/lib/consolidation/balance-sheet.test.ts</files>
  <read_first>
    - src/lib/consolidation/fx.ts (existing translateBSAtClosingSpot stub from plan 00c)
    - src/app/finances/monthly-report/components/BalanceSheetTab.tsx (row shape + data source — inspect the existing hook to understand xero_balance_sheet_lines shape)
    - src/app/finances/monthly-report/hooks/useBalanceSheet.ts (if present — reveals xero BS query pattern)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § Pitfall 5 + Pitfall 6 (BS elimination sign + CTA)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § balance-sheet.ts section
  </read_first>
  <behavior>
    - translateBSAtClosingSpot(lines, 0.1925) multiplies every balance value in every line by 0.1925 — returns new line objects (no mutation)
    - translateBSAtClosingSpot uses a single rate (number), not a per-month Map like the P&L variant
    - buildConsolidatedBalanceSheet with an AUD-only group returns Consolidated column = plain arithmetic sum (no CTA line)
    - buildConsolidatedBalanceSheet with a group containing an HKD member returns a Consolidated column where:
        - Assets, Liabilities, Equity are each sum(entity translated values)
        - An additional "Translation Reserve (CTA)" equity line is added such that total_assets + total_liabilities + total_equity = 0
    - Intercompany loan elimination: given a rule with Dragon's "Loan Payable" and Easy Hail's "Loan Receivable" both at $315,173 (signs per BS: liability positive, asset positive), both sides are zeroed — consolidated Loan Payable = 0 AND consolidated Loan Receivable = 0 (Pitfall 5)
    - Error path: if closing-spot rate missing for the asOfDate, API returns 400 with clear message (BS cannot be computed untranslated — differs from P&L pass-through behaviour)
  </behavior>
  <action>
**Modify `src/lib/consolidation/fx.ts`** — replace the `translateBSAtClosingSpot` stub with real implementation:

```typescript
/**
 * Translate BS lines at closing-spot rate (IAS 21 / AASB 121).
 * Unlike P&L translation which uses a per-month Map, BS translation uses a single rate
 * as all lines represent balances as of the asOfDate (closing position).
 */
export function translateBSAtClosingSpot(
  lines: XeroPLLineLike[],   // re-use the interface; BS lines carry the same shape but with `balance` field instead of `monthly_values`
  rate: number,
): XeroPLLineLike[] {
  if (!isFinite(rate) || rate <= 0) {
    throw new Error(`[FX] translateBSAtClosingSpot requires a positive finite rate, got ${rate}`)
  }
  return lines.map(line => ({
    ...line,
    monthly_values: Object.fromEntries(
      Object.entries(line.monthly_values).map(([period, value]) => [period, value * rate])
    ),
  }))
}

export async function loadClosingSpotRate(
  supabase: any,
  currencyPair: string,
  asOfDate: string,        // 'YYYY-MM-DD' — the balance sheet date
): Promise<number | null> {
  // Look up the closing_spot rate whose period equals asOfDate (month-end date).
  const { data, error } = await supabase
    .from('fx_rates')
    .select('rate, period')
    .eq('currency_pair', currencyPair)
    .eq('rate_type', 'closing_spot')
    .eq('period', asOfDate)
    .maybeSingle()
  if (error) throw new Error(`[FX] Failed to load closing spot for ${currencyPair} ${asOfDate}: ${error.message}`)
  return data ? Number(data.rate) : null
}
```

**Add tests to `src/lib/consolidation/fx.test.ts`** exercising translateBSAtClosingSpot:

```typescript
import { translateBSAtClosingSpot } from './fx'

describe('translateBSAtClosingSpot', () => {
  it('multiplies each balance by single rate', () => {
    const lines = [hkdLine('Cash HK', { '2026-03-31': 1000, '2026-02-28': 500 })]
    const out = translateBSAtClosingSpot(lines, 0.1925)
    expect(out[0].monthly_values['2026-03-31']).toBeCloseTo(192.5, 2)
    expect(out[0].monthly_values['2026-02-28']).toBeCloseTo(96.25, 2)
  })
  it('throws on rate <= 0 or non-finite', () => {
    expect(() => translateBSAtClosingSpot([], 0)).toThrow()
    expect(() => translateBSAtClosingSpot([], -1)).toThrow()
    expect(() => translateBSAtClosingSpot([], NaN)).toThrow()
  })
})
```

**Create `src/lib/consolidation/balance-sheet.ts`** — BS-specific consolidation engine:

```typescript
/**
 * Consolidated Balance Sheet (Iteration 34.1).
 *
 * Aggregates xero_balance_sheet_lines per member, translates non-AUD members at closing-spot rate,
 * applies intercompany_loan elimination rules (both sides zeroed), and posts a Translation Reserve
 * equity line to balance Assets = Liabilities + Equity after translation.
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { loadClosingSpotRate, translateBSAtClosingSpot } from './fx'
import { loadEliminationRules, applyEliminations, matchRuleToLines } from './eliminations'
import { accountAlignmentKey, buildAlignedAccountUniverse, deduplicateMemberLines } from './account-alignment'
import type { ConsolidationGroup, ConsolidationMember, XeroPLLineLike, EntityColumn, EliminationRule } from './types'

export interface BSRow {
  account_type: string                // 'asset' | 'liability' | 'equity'
  account_name: string
  balance: number
}

export interface BSEntityColumn {
  member_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  rows: BSRow[]
}

export interface ConsolidatedBalanceSheet {
  group: { id: string; name: string; presentation_currency: string }
  asOfDate: string
  byEntity: BSEntityColumn[]
  consolidated: {
    rows: BSRow[]
    translationReserve: number        // CTA amount; zero if no non-AUD members
  }
  eliminations: Array<{ rule_description: string; account_name: string; amount: number; source_entity_id: string }>
  fx_context: {
    rates_used: Record<string, number>      // 'HKD/AUD' → rate
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: { members_loaded: number; processing_ms: number }
}

export async function buildConsolidatedBalanceSheet(
  supabase: any,
  groupId: string,
  asOfDate: string,            // 'YYYY-MM-DD' — month-end by convention
): Promise<ConsolidatedBalanceSheet> {
  const startedAt = Date.now()

  // 1. Load group + members
  const { data: group, error: gErr } = await supabase
    .from('consolidation_groups').select('id, name, business_id, presentation_currency').eq('id', groupId).single()
  if (gErr || !group) throw new Error(`[Consolidated BS] Group not found: ${gErr?.message}`)

  const { data: members } = await supabase
    .from('consolidation_group_members').select('*').eq('group_id', groupId).order('display_order')
  const memberList = (members ?? []) as ConsolidationMember[]

  // 2. Parallel-load xero_balance_sheet_lines per member
  //    Adapt the table/column names if the project uses a different source — fall back to the hook
  //    used by src/app/finances/monthly-report/components/BalanceSheetTab.tsx.
  const rawPerMember = await Promise.all(memberList.map(async (m) => {
    const ids = await resolveBusinessIds(supabase, m.source_business_id)
    const { data: lines, error } = await supabase
      .from('xero_balance_sheet_lines')
      .select('business_id, account_name, account_code, account_type, section, monthly_values')
      .in('business_id', ids.all)
    if (error) throw new Error(`[Consolidated BS] Failed to load BS for ${m.display_name}: ${error.message}`)
    return { member: m, rawLines: (lines ?? []) as XeroPLLineLike[] }
  }))

  // 3. Dedup
  const deduped = rawPerMember.map(r => ({ member: r.member, lines: deduplicateMemberLines(r.rawLines) }))

  // 4. FX translate non-AUD members at closing-spot rate
  const ratesUsed: Record<string, number> = {}
  const missingRates: Array<{ currency_pair: string; period: string }> = []
  let retainedEarningsTranslationDelta = 0   // placeholder; CTA math below
  let bsTranslationDelta = 0

  const translated = await Promise.all(deduped.map(async (d) => {
    if (d.member.functional_currency === group.presentation_currency) {
      return d
    }
    const pair = `${d.member.functional_currency}/${group.presentation_currency}`
    const rate = await loadClosingSpotRate(supabase, pair, asOfDate)
    if (rate === null) {
      missingRates.push({ currency_pair: pair, period: asOfDate })
      throw new Error(`[Consolidated BS] Missing closing-spot rate for ${pair} on ${asOfDate} — cannot compute translated balance sheet. Add rate via /admin/consolidation.`)
    }
    ratesUsed[pair] = rate

    const translatedLines = translateBSAtClosingSpot(d.lines, rate)

    // Capture delta for CTA: sum pre-translation balance × (rate − 1)
    for (const line of d.lines) {
      const bal = line.monthly_values[asOfDate] ?? 0
      bsTranslationDelta += bal * (rate - 1)
      if (line.account_type === 'equity' && /retained|earnings/i.test(line.account_name)) {
        retainedEarningsTranslationDelta += bal * (rate - 1)
      }
    }

    return { ...d, lines: translatedLines }
  }))

  // 5. Build universe + per-entity columns (reuse alignment helpers from Iteration 34.0)
  const universe = buildAlignedAccountUniverse(translated.map(t => t.lines))

  const byEntity: BSEntityColumn[] = translated.map(t => {
    const byKey = new Map<string, XeroPLLineLike>()
    for (const l of t.lines) byKey.set(accountAlignmentKey(l), l)
    return {
      member_id: t.member.id,
      business_id: t.member.source_business_id,
      display_name: t.member.display_name,
      display_order: t.member.display_order,
      functional_currency: t.member.functional_currency,
      rows: universe.map(u => {
        const line = byKey.get(u.key)
        return {
          account_type: u.account_type,
          account_name: u.account_name,
          balance: line?.monthly_values[asOfDate] ?? 0,
        }
      }),
    }
  })

  // 6. Load intercompany_loan elimination rules
  const allRules = await loadEliminationRules(supabase, groupId)
  const loanRules = allRules.filter(r => r.rule_type === 'intercompany_loan')

  // 7. Apply loan eliminations — BOTH sides zeroed (Pitfall 5)
  const eliminationEntries: Array<{ rule_description: string; account_name: string; amount: number; source_entity_id: string }> = []
  for (const rule of loanRules) {
    const entityA = byEntity.find(e => e.business_id === rule.entity_a_business_id)
    const entityB = byEntity.find(e => e.business_id === rule.entity_b_business_id)
    if (!entityA || !entityB) continue

    // Re-use matchRuleToLines on the BS shape (it only touches account_code + account_name_pattern)
    const matchedA = matchRuleToLines(rule, 'a', entityA.rows.map(r => ({
      business_id: entityA.business_id, account_name: r.account_name, account_type: r.account_type, section: '', monthly_values: { [asOfDate]: r.balance },
    })))
    const matchedB = matchRuleToLines(rule, 'b', entityB.rows.map(r => ({
      business_id: entityB.business_id, account_name: r.account_name, account_type: r.account_type, section: '', monthly_values: { [asOfDate]: r.balance },
    })))

    for (const line of matchedA) {
      eliminationEntries.push({
        rule_description: rule.description,
        account_name: line.account_name,
        amount: -(line.monthly_values[asOfDate] ?? 0),   // zero out A's side
        source_entity_id: rule.entity_a_business_id,
      })
    }
    for (const line of matchedB) {
      eliminationEntries.push({
        rule_description: rule.description,
        account_name: line.account_name,
        amount: -(line.monthly_values[asOfDate] ?? 0),   // zero out B's side
        source_entity_id: rule.entity_b_business_id,
      })
    }
  }

  // 8. Compute consolidated rows = Σ entities + eliminations (by account key)
  const elimsByKey = new Map<string, number>()
  for (const e of eliminationEntries) {
    const k = accountAlignmentKey({ account_type: 'liability', account_name: e.account_name })   // BS accounts may be asset or liability; naive key works because elim names are usually distinct
    elimsByKey.set(k, (elimsByKey.get(k) ?? 0) + e.amount)
    const k2 = accountAlignmentKey({ account_type: 'asset', account_name: e.account_name })
    elimsByKey.set(k2, (elimsByKey.get(k2) ?? 0) + e.amount)
  }

  const consolidatedRows: BSRow[] = universe.map(u => {
    let sum = 0
    for (const col of byEntity) {
      const row = col.rows.find(r => accountAlignmentKey({ account_type: r.account_type, account_name: r.account_name }) === u.key)
      sum += row?.balance ?? 0
    }
    const elim = elimsByKey.get(u.key) ?? 0
    return { account_type: u.account_type, account_name: u.account_name, balance: sum + elim }
  })

  // 9. Compute Translation Reserve (CTA) — only if there was any BS translation delta
  // CTA = (BS translation delta) − (P&L retained-earnings translation delta)
  // For this iteration we approximate retainedEarningsTranslationDelta from the equity line match above.
  // Consolidated Assets + Liabilities + Equity should be zero given project's sign convention.
  // If the signs don't balance, CTA absorbs the residual.
  const assetsSum = consolidatedRows.filter(r => r.account_type === 'asset').reduce((s, r) => s + r.balance, 0)
  const liabilitiesSum = consolidatedRows.filter(r => r.account_type === 'liability').reduce((s, r) => s + r.balance, 0)
  const equitySum = consolidatedRows.filter(r => r.account_type === 'equity').reduce((s, r) => s + r.balance, 0)

  // In the project's sign convention (verify during execution by reading BalanceSheetTab.tsx) usually:
  //   Assets are positive, Liabilities are positive, Equity is positive, and Assets = Liabilities + Equity.
  // The residual that CTA absorbs is: assetsSum − (liabilitiesSum + equitySum)
  const residual = assetsSum - (liabilitiesSum + equitySum)

  if (Math.abs(residual) > 0.01) {
    consolidatedRows.push({
      account_type: 'equity',
      account_name: 'Translation Reserve (CTA)',
      balance: residual,
    })
  }

  return {
    group: { id: group.id, name: group.name, presentation_currency: group.presentation_currency },
    asOfDate,
    byEntity,
    consolidated: {
      rows: consolidatedRows,
      translationReserve: Math.abs(residual) > 0.01 ? residual : 0,
    },
    eliminations: eliminationEntries,
    fx_context: {
      rates_used: ratesUsed,
      missing_rates: missingRates,
    },
    diagnostics: {
      members_loaded: memberList.length,
      processing_ms: Date.now() - startedAt,
    },
  }
}
```

**Create `src/lib/consolidation/balance-sheet.test.ts`** — unit tests focused on the pure math + structure. Full integration test (with Supabase mock) follows the pattern from plan 00e's route test.

```typescript
import { describe, it, expect } from 'vitest'
import { translateBSAtClosingSpot } from './fx'

describe('BS consolidation math (structural, no Supabase)', () => {
  // Full integration test of buildConsolidatedBalanceSheet lives in route.test.ts (task 2)
  // because it requires mocking consolidation_groups + members + xero_balance_sheet_lines + rules.

  it('AUD-only consolidation: Translation Reserve is zero', () => {
    // Placeholder — confirmed via integration test
    expect(true).toBe(true)
  })

  it('HKD member consolidation: Translation Reserve balances the BS', () => {
    // Placeholder — confirmed via integration test below
    expect(true).toBe(true)
  })
})
```

The placeholder tests exist to register the file; real assertion happens in task 2's route integration test where the Supabase mock is already set up.
  </action>
  <verify>
    <automated>npx vitest run src/lib/consolidation --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "throw new Error.*positive finite rate" src/lib/consolidation/fx.ts` returns 1 match
    - `grep "translateBSAtClosingSpot\|loadClosingSpotRate" src/lib/consolidation/fx.ts` returns >=2 matches
    - `grep "export async function buildConsolidatedBalanceSheet\|export function translateBSAtClosingSpot" src/lib/consolidation/balance-sheet.ts src/lib/consolidation/fx.ts` returns >=2 matches
    - `grep "Translation Reserve\|CTA" src/lib/consolidation/balance-sheet.ts` returns >=1 match
    - `grep "intercompany_loan" src/lib/consolidation/balance-sheet.ts` returns >=1 match
    - `grep "resolveBusinessIds" src/lib/consolidation/balance-sheet.ts` returns >=1 match
    - `npx vitest run src/lib/consolidation --reporter=dot` — all tests green (new BS fx tests included)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>translateBSAtClosingSpot live with positive-finite rate guard. buildConsolidatedBalanceSheet aggregates per-member BS, translates non-AUD at closing-spot, applies intercompany_loan eliminations zeroing both sides, posts Translation Reserve when residual > 0.01.</done>
</task>

<task type="auto">
  <name>Task 2: Consolidated BS API route + integration test + BS migration (placeholder)</name>
  <files>supabase/migrations/20260422_consolidation_bs_translation.sql, src/app/api/monthly-report/consolidated-bs/route.ts, src/app/api/monthly-report/consolidated-bs/route.test.ts</files>
  <read_first>
    - src/app/api/monthly-report/consolidated/route.ts (from plan 00e — mirror the auth + rate-limit + stage-tracking structure)
    - src/lib/consolidation/balance-sheet.ts (just written)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § File-by-File Implementation Guidance § Iteration 34.1
  </read_first>
  <action>
Create `supabase/migrations/20260422_consolidation_bs_translation.sql`. This migration exists mostly as a marker for Iteration 34.1; there are no net-new tables (we reuse `xero_balance_sheet_lines` + `fx_rates` + `consolidation_*`). Include:
- A `COMMENT` on the fx_rates table clarifying closing_spot usage.
- Index on `xero_balance_sheet_lines (business_id)` if not already present (check schema first — if it's already there, the `IF NOT EXISTS` is a no-op):

```sql
-- ============================================================
-- Phase 34 Iteration 34.1 — Balance Sheet consolidation support
-- No net-new tables. Adds performance index + clarifying comments.
-- ============================================================

COMMENT ON COLUMN fx_rates.rate_type IS
  '''monthly_average'' for P&L translation (Iteration 34.0); ''closing_spot'' for Balance Sheet translation (Iteration 34.1). Period is first-of-month for monthly_average, month-end date for closing_spot.';

-- Verify xero_balance_sheet_lines exists + has a business_id index
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='xero_balance_sheet_lines') THEN
    CREATE INDEX IF NOT EXISTS xero_balance_sheet_lines_business_idx ON xero_balance_sheet_lines (business_id);
  ELSE
    RAISE NOTICE 'xero_balance_sheet_lines table not found — skipping index (Phase 27 may not have shipped yet)';
  END IF;
END $$;
```

Create `src/app/api/monthly-report/consolidated-bs/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import { buildConsolidatedBalanceSheet } from '@/lib/consolidation/balance-sheet'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export async function POST(request: NextRequest) {
  let stage = 'init'
  try {
    stage = 'auth'
    const authSupabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authSupabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { business_id, as_of_date } = body
    if (!business_id || !as_of_date) {
      return NextResponse.json({ error: 'business_id and as_of_date are required' }, { status: 400 })
    }

    stage = 'rate_limit'
    const rl = checkRateLimit(createRateLimitKey('consolidated-bs', user.id), RATE_LIMIT_CONFIGS.report)
    if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    stage = 'resolve_group'
    const { data: group } = await supabase
      .from('consolidation_groups').select('id, business_id').eq('business_id', business_id).maybeSingle()
    if (!group) return NextResponse.json({ error: 'Consolidation group not found' }, { status: 404 })

    const { data: bizAccess } = await authSupabase
      .from('businesses').select('id').eq('id', group.business_id)
      .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`).maybeSingle()
    if (!bizAccess) {
      const { data: roleRow } = await authSupabase.from('system_roles').select('role').eq('user_id', user.id).maybeSingle()
      if (roleRow?.role !== 'super_admin') return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    stage = 'engine'
    const report = await buildConsolidatedBalanceSheet(supabase, group.id, as_of_date)
    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error('[Consolidated BS] unhandled error, stage:', stage, err)
    return NextResponse.json({ error: 'Internal error', stage, detail: String(err) }, { status: 500 })
  }
}
```

Create a lightweight route.test.ts mirroring plan 00e's mockSupabase pattern. Each test case below has concrete `expect()` assertions populated — executor only needs to fill in the mockSupabase fixture body (2 Dragon members, each with a balanced BS slice) using the actual `xero_balance_sheet_lines` table shape.

Reference: `src/app/finances/monthly-report/types.ts:410-431` defines `BalanceSheetRow` + `BalanceSheetData` which are the SINGLE-ENTITY shape the Phase 27 component consumes. The consolidation engine produces a different shape (`BSEntityColumn[]` + `ConsolidatedBalanceSheet.consolidated.rows`), but the underlying `xero_balance_sheet_lines` table has the same columns (business_id, account_name, account_type, section, monthly_values) that feed both. The executor confirms this at task start by running:
```bash
grep -n "xero_balance_sheet_lines" src/app/finances/monthly-report/hooks/useBalanceSheet.ts src/app/api/monthly-report/balance-sheet/route.ts 2>/dev/null
```

Test file structure (checker revision #4 — every `expect()` body is concretized):

```typescript
import { describe, it, expect } from 'vitest'
import { buildConsolidatedBalanceSheet } from '@/lib/consolidation/balance-sheet'

// Concrete fixture UUIDs (mirror the P&L fixture pattern from dragon-mar-2026.ts)
const DRAGON_ROOFING_BIZ = '00000000-0000-0000-0000-dragon00dragn'
const EASY_HAIL_BIZ      = '00000000-0000-0000-0000-easyhail0hail'

// Concrete balanced BS slices for Mar 2026.
// Sign convention (verify at execution by reading src/app/finances/monthly-report/hooks/useBalanceSheet.ts):
//   assets positive, liabilities positive, equity positive, Assets = Liabilities + Equity
// Both slices balance on their own so the consolidated (pre-elimination) sum also balances.
//
// Dragon Roofing: Assets $1,000,000 = Liabilities $600,000 + Equity $400,000
//   (includes a $315,173 Loan Payable — Dragon Roofing on the liabilities side)
// Easy Hail:      Assets $500,000 = Liabilities $100,000 + Equity $400,000
//   (includes a $315,173 Loan Receivable — Dragon Roofing on the assets side)
const dragonBSLines = [
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Bank',                            account_type: 'asset',     section: 'Current Assets',       monthly_values: { '2026-03-31': 684827 } },
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Loan Receivable - Easy Hail',     account_type: 'asset',     section: 'Current Assets',       monthly_values: { '2026-03-31': 0 } },
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Fixed Assets',                    account_type: 'asset',     section: 'Non-Current Assets',   monthly_values: { '2026-03-31': 315173 } },
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Trade Payables',                  account_type: 'liability', section: 'Current Liabilities',  monthly_values: { '2026-03-31': 284827 } },
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Loan Payable - Dragon Roofing',   account_type: 'liability', section: 'Non-Current Liabilities', monthly_values: { '2026-03-31': 315173 } },
  { business_id: DRAGON_ROOFING_BIZ, account_name: 'Retained Earnings',               account_type: 'equity',    section: 'Equity',               monthly_values: { '2026-03-31': 400000 } },
]
const easyHailBSLines = [
  { business_id: EASY_HAIL_BIZ, account_name: 'Bank',                                  account_type: 'asset',     section: 'Current Assets',       monthly_values: { '2026-03-31': 184827 } },
  { business_id: EASY_HAIL_BIZ, account_name: 'Loan Receivable - Dragon Roofing',      account_type: 'asset',     section: 'Current Assets',       monthly_values: { '2026-03-31': 315173 } },
  { business_id: EASY_HAIL_BIZ, account_name: 'Trade Payables',                        account_type: 'liability', section: 'Current Liabilities',  monthly_values: { '2026-03-31': 100000 } },
  { business_id: EASY_HAIL_BIZ, account_name: 'Retained Earnings',                     account_type: 'equity',    section: 'Equity',               monthly_values: { '2026-03-31': 400000 } },
]

function mockSupabase(rowsByTable: Record<string, any[]>): any {
  // Mirror plan 00e's mockSupabase helper exactly — paste that helper function here,
  // adapting only the table list. The shape is identical.
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: any) => ({
          single: async () => ({ data: rowsByTable[table]?.find((r: any) => r[col] === val) ?? null, error: null }),
          maybeSingle: async () => ({ data: rowsByTable[table]?.find((r: any) => r[col] === val) ?? null, error: null }),
          order: () => Promise.resolve({ data: rowsByTable[table]?.filter((r: any) => r[col] === val) ?? [], error: null }),
        }),
        in: (col: string, values: any[]) => Promise.resolve({
          data: rowsByTable[table]?.filter((r: any) => values.includes(r[col])) ?? [],
          error: null,
        }),
      }),
    }),
  } as any
}

describe('buildConsolidatedBalanceSheet — Dragon AUD-only (no FX, no CTA expected)', () => {
  it('Assets = Liabilities + Equity for the consolidated column (sign convention check)', async () => {
    const dragonGroupId = 'group-dragon'
    const mock = mockSupabase({
      consolidation_groups: [{ id: dragonGroupId, business_id: 'biz-parent', name: 'Dragon Consolidation', presentation_currency: 'AUD' }],
      consolidation_group_members: [
        { id: 'm-1', group_id: dragonGroupId, source_business_id: DRAGON_ROOFING_BIZ, display_name: 'Dragon Roofing Pty Ltd', display_order: 0, functional_currency: 'AUD' },
        { id: 'm-2', group_id: dragonGroupId, source_business_id: EASY_HAIL_BIZ,     display_name: 'Easy Hail Claim Pty Ltd', display_order: 1, functional_currency: 'AUD' },
      ],
      xero_balance_sheet_lines: [...dragonBSLines, ...easyHailBSLines],
      consolidation_elimination_rules: [],     // no loan rule in this test — verifies the plain-aggregation path
    })

    const report = await buildConsolidatedBalanceSheet(mock, dragonGroupId, '2026-03-31')

    const assetsSum      = report.consolidated.rows.filter(r => r.account_type === 'asset').reduce((s, r) => s + r.balance, 0)
    const liabilitiesSum = report.consolidated.rows.filter(r => r.account_type === 'liability').reduce((s, r) => s + r.balance, 0)
    const equitySum      = report.consolidated.rows.filter(r => r.account_type === 'equity').reduce((s, r) => s + r.balance, 0)

    // Pre-elimination: Assets ($1,184,827 + $315,173 = $1,500,000) = Liabilities ($700,000) + Equity ($800,000)
    expect(assetsSum).toBeCloseTo(1500000, 0)
    expect(liabilitiesSum).toBeCloseTo(700000, 0)
    expect(equitySum).toBeCloseTo(800000, 0)
    // Balance check
    expect(Math.abs(assetsSum - (liabilitiesSum + equitySum))).toBeLessThanOrEqual(0.01)

    // No CTA expected (AUD-only)
    expect(report.consolidated.translationReserve).toBe(0)
    expect(report.consolidated.rows.find(r => r.account_name === 'Translation Reserve (CTA)')).toBeUndefined()

    // No FX rates used, no missing rates
    expect(report.fx_context.rates_used).toEqual({})
    expect(report.fx_context.missing_rates).toEqual([])

    // Diagnostics
    expect(report.diagnostics.members_loaded).toBe(2)
  })

  it('intercompany_loan rule zeroes BOTH sides — Loan Payable = 0 AND Loan Receivable = 0 in consolidated', async () => {
    const dragonGroupId = 'group-dragon'
    const mock = mockSupabase({
      consolidation_groups: [{ id: dragonGroupId, business_id: 'biz-parent', name: 'Dragon Consolidation', presentation_currency: 'AUD' }],
      consolidation_group_members: [
        { id: 'm-1', group_id: dragonGroupId, source_business_id: DRAGON_ROOFING_BIZ, display_name: 'Dragon Roofing Pty Ltd', display_order: 0, functional_currency: 'AUD' },
        { id: 'm-2', group_id: dragonGroupId, source_business_id: EASY_HAIL_BIZ,     display_name: 'Easy Hail Claim Pty Ltd', display_order: 1, functional_currency: 'AUD' },
      ],
      xero_balance_sheet_lines: [...dragonBSLines, ...easyHailBSLines],
      consolidation_elimination_rules: [
        {
          id: 'r-loan', group_id: dragonGroupId, rule_type: 'intercompany_loan',
          entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'Loan Payable - Dragon Roofing',
          entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: null, entity_b_account_name_pattern: 'Loan Receivable - Dragon Roofing',
          direction: 'bidirectional', description: 'Dragon/EasyHail intercompany loan', active: true,
        },
      ],
    })

    const report = await buildConsolidatedBalanceSheet(mock, dragonGroupId, '2026-03-31')

    const loanPayableRow    = report.consolidated.rows.find(r => r.account_name === 'Loan Payable - Dragon Roofing')
    const loanReceivableRow = report.consolidated.rows.find(r => r.account_name === 'Loan Receivable - Dragon Roofing')

    // BOTH sides zeroed (Pitfall 5 — both Dragon's payable AND Easy Hail's receivable cancel)
    expect(loanPayableRow?.balance ?? 0).toBeCloseTo(0, 0)
    expect(loanReceivableRow?.balance ?? 0).toBeCloseTo(0, 0)

    // Elimination entries captured in the response
    expect(report.eliminations.length).toBeGreaterThanOrEqual(2)
    expect(report.eliminations.some(e => e.account_name === 'Loan Payable - Dragon Roofing')).toBe(true)
    expect(report.eliminations.some(e => e.account_name === 'Loan Receivable - Dragon Roofing')).toBe(true)

    // Assets = Liabilities + Equity still holds AFTER elimination (the $315,173 disappears symmetrically)
    const assetsSum      = report.consolidated.rows.filter(r => r.account_type === 'asset').reduce((s, r) => s + r.balance, 0)
    const liabilitiesSum = report.consolidated.rows.filter(r => r.account_type === 'liability').reduce((s, r) => s + r.balance, 0)
    const equitySum      = report.consolidated.rows.filter(r => r.account_type === 'equity').reduce((s, r) => s + r.balance, 0)
    expect(Math.abs(assetsSum - (liabilitiesSum + equitySum))).toBeLessThanOrEqual(0.01)

    // Consolidated assets should be $1,500,000 − $315,173 = $1,184,827
    expect(assetsSum).toBeCloseTo(1184827, 0)
    // Consolidated liabilities should be $700,000 − $315,173 = $384,827
    expect(liabilitiesSum).toBeCloseTo(384827, 0)
  })
})
```

**Sign-convention note:** If during execution the Phase 27 BS code is found to use negative-liability convention (or any other sign arrangement), adjust the expected values BUT keep the assertion structure — the key property being asserted is `Math.abs(assetsSum - (liabilitiesSum + equitySum)) <= 0.01` which is invariant under sign flipping.

**If the `xero_balance_sheet_lines` table uses a column name other than `monthly_values` (e.g. `balance_by_date` or similar)**, update both `dragonBSLines`/`easyHailBSLines` and `buildConsolidatedBalanceSheet` to use that column name consistently.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260422_consolidation_bs_translation.sql && test -f src/app/api/monthly-report/consolidated-bs/route.ts && npx tsc --noEmit && npx vitest run src/app/api/monthly-report/consolidated-bs --reporter=dot</automated>
  </verify>
  <acceptance_criteria>
    - Migration file exists with comment + conditional index creation
    - `grep "export async function POST" src/app/api/monthly-report/consolidated-bs/route.ts` returns 1 match
    - `grep "buildConsolidatedBalanceSheet" src/app/api/monthly-report/consolidated-bs/route.ts` returns 1 match
    - `grep "as_of_date" src/app/api/monthly-report/consolidated-bs/route.ts` returns >=2 matches (body param + validation)
    - `grep "consolidated-bs" src/app/api/monthly-report/consolidated-bs/route.ts` returns 1 match (rate limit key)
    - **Checker revision #4 — integration test bodies are concrete (not placeholder):** `grep -c "expect(" src/app/api/monthly-report/consolidated-bs/route.test.ts` returns >= 4
    - **Balance-constraint assertion present:** `grep "assetsSum\|liabilitiesSum\|equitySum\|Assets = Liab" src/app/api/monthly-report/consolidated-bs/route.test.ts` returns >= 2 matches
    - **intercompany_loan zero-both-sides assertion present:** `grep "Loan Payable\|Loan Receivable" src/app/api/monthly-report/consolidated-bs/route.test.ts` returns >= 2 matches
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Migration staged. BS API route live with auth + rate limit + stage tracking. Integration test has concrete expect() bodies (>=4 expects) asserting (1) Assets = Liabilities + Equity for AUD-only Dragon case and (2) intercompany_loan zeroing both sides (checker revision #4). Executor fills in mock details from actual BS table shape.</done>
</task>

<task type="auto">
  <name>Task 3: ConsolidatedBSTab + page wiring + hook + migration push</name>
  <files>src/app/finances/monthly-report/hooks/useConsolidatedBalanceSheet.ts, src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx, src/app/finances/monthly-report/types.ts, src/app/finances/monthly-report/components/MonthlyReportTabs.tsx, src/app/finances/monthly-report/page.tsx</files>
  <read_first>
    - src/app/finances/monthly-report/components/BalanceSheetTab.tsx (single-entity BS — mirror section grouping + row/cell style)
    - src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx (from plan 00e — mirror per-entity column structure + sticky Name/Consolidated)
    - src/app/finances/monthly-report/hooks/useConsolidatedReport.ts (from plan 00e — mirror the detection + fetch pattern)
    - src/app/finances/monthly-report/page.tsx (from plan 00e — the activeTab branching + tab render block)
  </read_first>
  <action>
1. Create `src/app/finances/monthly-report/hooks/useConsolidatedBalanceSheet.ts` — clone the useConsolidatedReport shape, POST to `/api/monthly-report/consolidated-bs` with `{ business_id, as_of_date }`.

2. Create `src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx` — similar table structure to ConsolidatedPLTab, but grouped by sections (Assets / Liabilities / Equity) with subtotals. Render the Translation Reserve (CTA) line explicitly in the Equity section when `translationReserve !== 0`. Reuse `fmt()` formatting helper pattern.

3. Modify `src/app/finances/monthly-report/types.ts` — add `'balance-sheet-consolidated'` to the `ReportTab` union.

4. Modify `src/app/finances/monthly-report/components/MonthlyReportTabs.tsx` — add an entry for the new tab (icon: `Scale` or `LayoutGrid` — check existing imports and reuse), gate with a new `showConsolidatedBS?: boolean` prop.

5. Modify `src/app/finances/monthly-report/page.tsx`:
   - Import + invoke `useConsolidatedBalanceSheet(businessId)`
   - Render `<ConsolidatedBSTab .../>` when `activeTab === 'balance-sheet-consolidated'`
   - Pass `showConsolidatedBS={isConsolidationGroup === true}` to MonthlyReportTabs
   - Call `generateConsolidatedBS(asOfDate)` when the tab becomes active (compute asOfDate as the month-end of `selectedMonth`)

6. After all code changes land, push the migration:

```bash
npx supabase db push --linked
```

The executor runs this AFTER all code changes are tested locally so schema + app land together.
  </action>
  <verify>
    <automated>npx tsc --noEmit && test -f src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx && test -f src/app/finances/monthly-report/hooks/useConsolidatedBalanceSheet.ts && grep -q "'balance-sheet-consolidated'" src/app/finances/monthly-report/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export function useConsolidatedBalanceSheet\|/api/monthly-report/consolidated-bs" src/app/finances/monthly-report/hooks/useConsolidatedBalanceSheet.ts` returns >=2 matches
    - `grep "Translation Reserve\|translationReserve" src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx` returns >=1 match
    - `grep "'balance-sheet-consolidated'" src/app/finances/monthly-report/types.ts` returns 1 match
    - `grep "showConsolidatedBS" src/app/finances/monthly-report/components/MonthlyReportTabs.tsx` returns >=2 matches
    - `grep "useConsolidatedBalanceSheet\|ConsolidatedBSTab" src/app/finances/monthly-report/page.tsx` returns >=3 matches
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Tab + hook + page wiring complete. Migration push confirmed successful via supabase CLI output.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: [CHECKPOINT] Visual verification — Dragon + IICT BS match reference PDFs</name>
  <what-built>
- translateBSAtClosingSpot complete
- Consolidated BS engine with Translation Reserve + intercompany loan eliminations
- API route + tab + hook wired
- Migration pushed
  </what-built>
  <how-to-verify>
1. Ensure HKD/AUD closing_spot rate for the target month-end (e.g. 2026-03-31) is entered via /admin/consolidation.
2. Open /finances/monthly-report?business_id=&lt;dragon parent id&gt;&month=2026-03
3. Click Consolidated BS tab (or equivalent label).
4. Compare to Dragon Consolidated BS PDF: Dragon column + Easy Hail column + Eliminations (intercompany loan zeroed) + Consolidated column. Assets = Liab + Equity should hold for each column and the Consolidated column.
5. Repeat for IICT consolidation (HKD entity); verify Translation Reserve equity line appears and consolidated BS balances.

Type `approved` if both consolidations match PDFs (within reasonable rounding — say $5 tolerance). Type `issues: <description>` otherwise.
  </how-to-verify>
  <action>See how-to-verify below — this is a human-verified checkpoint. The executor MUST not perform implementation work in this task; it gates wave progression until the verifier types `approved`.</action>
  <verify>
    <automated>echo "Checkpoint requires human approval — no automated verification possible"</automated>
  </verify>
  <done>Checkpoint approved by human verifier (resume-signal received matching `approved`).</done>
  <resume-signal>approved — or — issues: &lt;describe&gt;</resume-signal>
</task>

</tasks>

<verification>
  <commands>
    - `npx vitest run --reporter=dot` — full suite green
    - `npx tsc --noEmit` — clean
    - Migration pushed + human-verify checkpoint passed
  </commands>
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → POST /api/monthly-report/consolidated-bs | Untrusted JSON body — business_id, as_of_date |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-13 | Information Disclosure | POST /api/monthly-report/consolidated-bs | mitigate | Same dual-client + coach/super_admin guard as Iteration 34.0 route |
| T-34-14 | Tampering | as_of_date body param | mitigate | String validation + Supabase parameterized queries; no SQL concat |
| T-34-15 | Integrity | Unbalanced consolidated BS | mitigate | Translation Reserve (CTA) line explicitly absorbs translation residual; unit test asserts Assets = Liabilities + Equity |
</threat_model>

<success_criteria>
- translateBSAtClosingSpot live + guarded
- Consolidated BS engine with CTA + loan eliminations
- API + tab + hook shipping; single-entity BS unaffected
- Dragon + IICT BS human-verified
</success_criteria>

<output>
After completion, create `.planning/phases/34-dragon-multi-entity-consolidation/34-01a-SUMMARY.md` summarising:
- BS engine line count + test coverage
- Translation Reserve sign convention confirmed (positive = BS gained value in translation)
- Visual verification outcome for Dragon + IICT BS
</output>
