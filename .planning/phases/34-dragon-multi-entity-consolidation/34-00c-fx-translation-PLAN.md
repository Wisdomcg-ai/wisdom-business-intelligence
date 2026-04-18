---
phase: 34
plan: 00c
type: execute
wave: 2
depends_on: ['34-00a']
files_modified:
  - src/lib/consolidation/fx.ts
  - src/lib/consolidation/fx.test.ts
autonomous: true
requirements: [MLTE-02]

must_haves:
  truths:
    - "translatePLAtMonthlyAverage(lines, rates) multiplies each line's monthly_values[m] by rates.get(m)"
    - "Missing rate for a month does NOT silently fall back to 1.0 — it surfaces in the fx_context.missing_rates[] array and the value passes through untranslated"
    - "loadFxRates(supabase, 'HKD/AUD', 'monthly_average', ['2026-03','2026-04']) returns a Map keyed by 'YYYY-MM' with numeric rates"
    - "IICT fixture (HKD pre-translation values) × 0.1925 rate = expected AUD values within 0.01"
    - "Slash currency-pair format 'HKD/AUD' used consistently — never underscore"
  artifacts:
    - path: src/lib/consolidation/fx.ts
      provides: "loadFxRates, translatePLAtMonthlyAverage, translateBSAtClosingSpot (stub for 34.1), translationDiagnostics"
      contains: "export async function loadFxRates"
    - path: src/lib/consolidation/fx.test.ts
      provides: "FX translation unit tests (monthly-average, missing-rate, zero-value), IICT fixture round-trip"
      contains: "HKD/AUD"
  key_links:
    - from: src/lib/consolidation/fx.ts
      to: src/lib/consolidation/types
      via: "XeroPLLineLike, FxRateRow imports"
      pattern: "from './types'"
    - from: src/lib/consolidation/fx.test.ts
      to: src/lib/consolidation/__fixtures__/iict-mar-2026
      via: "HKD_AUD_MONTHLY + iictHKPL import for round-trip test"
      pattern: "from './__fixtures__/iict-mar-2026'"
---

<objective>
Implement the FX translation module for Iteration 34.0 multi-currency consolidation.

Scope:
1. **`loadFxRates`** — reads rates from `fx_rates` table (created in plan 00a migration 20260421b) by `(currency_pair, rate_type)` and a list of months, returns a `Map<string, number>` keyed by 'YYYY-MM'. Uses the `period` date column converted to month key at read time.
2. **`translatePLAtMonthlyAverage`** — pure function that multiplies each P&L line's `monthly_values[m]` by `rates.get(m)`. Missing rate → value passes through untranslated, month is added to a `missing_rates` output so the caller can surface it in `fx_context`. No silent 1:1 fallback.
3. **`translateBSAtClosingSpot`** — stub + signature only (full implementation lands in plan 34-01a). Provides the contract so engine.ts can import it today.
4. **Fixture-backed tests** — exercise the IICT HKD→AUD path using `iictHKPL` + `HKD_AUD_MONTHLY` fixture exports from plan 00a. Assert translated values match `iictExpectedConsolidated` to within 0.01.

This plan runs in parallel with plan 00b (both depend only on 00a). It does NOT wire FX into the engine yet — that integration happens in plan 00e (API route + engine wiring), because that's where the supabase client is available to call `loadFxRates`.

**Explicitly out of scope (per POST-RESEARCH CORRECTIONS):** No Vercel cron, no RBA F11.1 scraper, no `/api/cron/fx-sync` route. Rates are manual-entry only via the admin UI shipped in plan 00f.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md

@src/lib/cashflow/company-tax.ts
@.planning/phases/34-dragon-multi-entity-consolidation/34-00a-SUMMARY.md

<interfaces>
<!-- Types from plan 00a -->
```typescript
import type { XeroPLLineLike, FxRateRow } from './types'

// FxRateRow shape (reminder):
// {
//   currency_pair: 'HKD/AUD'  // slash separator
//   rate_type: 'monthly_average' | 'closing_spot'
//   period: 'YYYY-MM-DD'      // date column — first-of-month or month-end
//   rate: number
//   source: 'manual' | 'rba'
// }
```

<!-- IICT fixture exports available from plan 00a -->
```typescript
// src/lib/consolidation/__fixtures__/iict-mar-2026.ts
export const iictHKPL: XeroPLLineLike[]                // raw HKD values
export const HKD_AUD_MONTHLY: Record<string, number>    // { '2026-03': 0.1925, ... }
export const iictExpectedConsolidated: Record<string, Record<string, number>>
```

<!-- RESEARCH.md FX signature spec (lines 287-307) — follow exactly -->
```typescript
export function translatePLAtMonthlyAverage(
  lines: XeroPLLineLike[],
  rates: Map<string, number>,  // keyed by period_month 'YYYY-MM'
): { translated: XeroPLLineLike[]; missing: string[] }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FX translation module + tests</name>
  <files>src/lib/consolidation/fx.ts, src/lib/consolidation/fx.test.ts</files>
  <read_first>
    - src/lib/consolidation/types.ts (XeroPLLineLike + FxRateRow)
    - src/lib/consolidation/__fixtures__/iict-mar-2026.ts (iictHKPL + HKD_AUD_MONTHLY + iictExpectedConsolidated)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § `### Pattern 2: FX Translation at Monthly Average` (lines 276-310)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § `src/lib/consolidation/fx.ts` (critical conventions — slash format, date column shape, no silent 1.0 fallback, HKD/AUD scope)
    - src/lib/cashflow/company-tax.ts (period-keyed lookup utility analog — imports + shape)
  </read_first>
  <behavior>
    - translatePLAtMonthlyAverage([{monthly_values:{'2026-03':100}}], new Map([['2026-03', 0.1925]])) returns { translated: [{monthly_values:{'2026-03':19.25}}], missing: [] }
    - Line with 3 months, rate only for 2 → translated values for 2 months, third month passes through untranslated, `missing` contains the third month exactly once
    - Multiple lines with the same missing month → `missing` array has that month ONCE (deduped)
    - Input line with monthly_values={} returns translated line with monthly_values={} — does NOT fabricate new month keys (Pitfall 2 from RESEARCH.md)
    - translatePLAtMonthlyAverage preserves all non-monthly_values fields unchanged (account_name, account_type, account_code, section, business_id)
    - translatePLAtMonthlyAverage NEVER uses rate=1.0 silently — if rate.get(m) returns undefined, the original value is preserved and the month is logged to `missing`
    - loadFxRates(supabase, 'HKD/AUD', 'monthly_average', ['2026-03']) issues ONE query: .from('fx_rates').select(...).eq('currency_pair', 'HKD/AUD').eq('rate_type', 'monthly_average').in('period', [...])
    - Rates from DB rows where period='2026-03-01' map to map key '2026-03' (first 7 chars of the period date string)
    - IICT round-trip: translate iictHKPL with { '2026-03': 0.1925 } → each line's 2026-03 monthly_value === HK * 0.1925 (within 0.01)
  </behavior>
  <action>
Create `src/lib/consolidation/fx.ts`:

```typescript
/**
 * Foreign Exchange Translation — HKD/AUD for IICT Group Limited.
 *
 * Per POST-RESEARCH CORRECTIONS (2026-04-18): manual-entry rates only.
 * No cron, no external API, no RBA scraper. User enters monthly rates
 * via the admin UI (plan 34-00f). Missing rate = surfaced to user, NOT
 * silently defaulted to 1.0.
 *
 * Standard: AASB 121 / IAS 21 — monthly average for P&L, closing spot for BS.
 */

import type { XeroPLLineLike } from './types'

export type RateType = 'monthly_average' | 'closing_spot'

/**
 * Load rates from fx_rates table for a specific pair + rate_type + list of months.
 * Returns Map keyed by 'YYYY-MM' month key (derived from period date column).
 * Missing-in-DB months simply don't appear in the Map — caller detects via .get() returning undefined.
 */
export async function loadFxRates(
  supabase: any,
  currencyPair: string,       // 'HKD/AUD' (slash separator enforced at call site)
  rateType: RateType,
  months: string[],           // ['2026-03', '2026-04', ...]
): Promise<Map<string, number>> {
  if (months.length === 0) return new Map()

  // Period is stored as `date`; for monthly_average it's first-of-month (YYYY-MM-01),
  // for closing_spot it's month-end. We look up by month prefix via .in() on the
  // expanded set of candidate dates. Easier: pull by rate_type+pair and filter in TS.
  const { data, error } = await supabase
    .from('fx_rates')
    .select('currency_pair, rate_type, period, rate, source')
    .eq('currency_pair', currencyPair)
    .eq('rate_type', rateType)

  if (error) {
    throw new Error(`[FX] Failed to load rates for ${currencyPair} ${rateType}: ${error.message}`)
  }

  const out = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ period: string; rate: number }>) {
    // period is ISO date 'YYYY-MM-DD' — take first 7 chars as month key
    const monthKey = row.period.slice(0, 7)
    if (months.includes(monthKey)) {
      out.set(monthKey, Number(row.rate))
    }
  }
  return out
}

/**
 * Translate P&L lines at monthly-average rate (IAS 21 / AASB 121).
 *
 * @returns translated lines + list of months that had NO rate (caller surfaces these to user).
 * Missing rate → value preserved untranslated (NOT silently 1.0).
 */
export function translatePLAtMonthlyAverage(
  lines: XeroPLLineLike[],
  rates: Map<string, number>,
): { translated: XeroPLLineLike[]; missing: string[] } {
  const missingSet = new Set<string>()

  const translated = lines.map(line => {
    const newMonthly: Record<string, number> = {}
    for (const [month, value] of Object.entries(line.monthly_values)) {
      const rate = rates.get(month)
      if (rate === undefined) {
        // Pitfall 3: never fabricate rate=1; preserve raw value, flag the month.
        newMonthly[month] = value
        missingSet.add(month)
        console.warn(`[FX] Missing rate for ${month} — value preserved untranslated`)
      } else {
        newMonthly[month] = value * rate
      }
    }
    return { ...line, monthly_values: newMonthly }
  })

  return {
    translated,
    missing: Array.from(missingSet).sort(),
  }
}

/**
 * STUB — implemented fully in plan 34-01a (Iteration 34.1 Balance Sheet).
 * Signature exported today so engine.ts can import the symbol.
 */
export function translateBSAtClosingSpot(
  _lines: XeroPLLineLike[],
  _rate: number,
): XeroPLLineLike[] {
  throw new Error('[FX] translateBSAtClosingSpot not yet implemented — see plan 34-01a')
}

/**
 * Produce a diagnostics object for the consolidated response's fx_context field.
 */
export function translationDiagnostics(
  translations: Array<{ currencyPair: string; rates: Map<string, number>; missing: string[] }>
): { rates_used: Record<string, number>; missing_rates: { currency_pair: string; period: string }[] } {
  const rates_used: Record<string, number> = {}
  const missing_rates: { currency_pair: string; period: string }[] = []
  for (const t of translations) {
    for (const [month, rate] of t.rates.entries()) {
      rates_used[`${t.currencyPair}::${month}`] = rate
    }
    for (const m of t.missing) {
      missing_rates.push({ currency_pair: t.currencyPair, period: m })
    }
  }
  return { rates_used, missing_rates }
}
```

Create `src/lib/consolidation/fx.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  translatePLAtMonthlyAverage,
  translationDiagnostics,
} from './fx'
import type { XeroPLLineLike } from './types'
import { iictHKPL, HKD_AUD_MONTHLY } from './__fixtures__/iict-mar-2026'

function hkdLine(name: string, values: Record<string, number>): XeroPLLineLike {
  return {
    business_id: 'hk-biz', account_name: name, account_code: null,
    account_type: 'revenue', section: 'Revenue', monthly_values: values,
  }
}

describe('translatePLAtMonthlyAverage', () => {
  it('multiplies value by rate for each month', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100, '2026-04': 200 })]
    const rates = new Map([['2026-03', 0.1925], ['2026-04', 0.1930]])
    const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(missing).toEqual([])
    expect(translated[0].monthly_values['2026-03']).toBeCloseTo(19.25, 2)
    expect(translated[0].monthly_values['2026-04']).toBeCloseTo(38.60, 2)
  })

  it('does NOT silently default to 1.0 when rate is missing — value preserved + month flagged', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100, '2026-04': 200 })]
    const rates = new Map([['2026-03', 0.1925]])   // 2026-04 missing
    const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(missing).toEqual(['2026-04'])
    expect(translated[0].monthly_values['2026-04']).toBe(200)  // preserved, NOT 200 * 1.0 silently
  })

  it('deduplicates missing months across multiple lines', () => {
    const lines = [
      hkdLine('Sales HK', { '2026-04': 100 }),
      hkdLine('COGS HK', { '2026-04': 50 }),
    ]
    const rates = new Map<string, number>()
    const { missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(missing).toEqual(['2026-04'])
  })

  it('does NOT fabricate keys not present in source (Pitfall 2)', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100 })]
    const rates = new Map([['2026-03', 0.1925], ['2026-04', 0.1930]])   // extra rate
    const { translated } = translatePLAtMonthlyAverage(lines, rates)
    expect(Object.keys(translated[0].monthly_values)).toEqual(['2026-03'])
  })

  it('preserves non-monthly fields unchanged', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100 })]
    lines[0].account_code = 'HK-200'
    const rates = new Map([['2026-03', 0.1925]])
    const { translated } = translatePLAtMonthlyAverage(lines, rates)
    expect(translated[0].account_name).toBe('Sales HK')
    expect(translated[0].account_code).toBe('HK-200')
    expect(translated[0].account_type).toBe('revenue')
    expect(translated[0].section).toBe('Revenue')
  })
})

describe('IICT fixture round-trip — HKD × 0.1925 → AUD', () => {
  it('translates iictHKPL at 2026-03 rate from HKD_AUD_MONTHLY', () => {
    const rates = new Map(Object.entries(HKD_AUD_MONTHLY))
    const { translated, missing } = translatePLAtMonthlyAverage(iictHKPL, rates)
    expect(missing.length).toBe(0)
    // Spot check: every HK line's 2026-03 value × 0.1925 should match translated
    for (let i = 0; i < iictHKPL.length; i++) {
      const hkVal = iictHKPL[i].monthly_values['2026-03'] ?? 0
      const audVal = translated[i].monthly_values['2026-03'] ?? 0
      expect(audVal).toBeCloseTo(hkVal * HKD_AUD_MONTHLY['2026-03'], 2)
    }
  })
})

describe('translationDiagnostics', () => {
  it('packages rates_used and missing_rates by currency pair', () => {
    const d = translationDiagnostics([
      { currencyPair: 'HKD/AUD', rates: new Map([['2026-03', 0.1925]]), missing: ['2026-04'] },
    ])
    expect(d.rates_used['HKD/AUD::2026-03']).toBe(0.1925)
    expect(d.missing_rates).toEqual([{ currency_pair: 'HKD/AUD', period: '2026-04' }])
  })
})

describe('loadFxRates (smoke — Supabase mock not exercised here; real integration in plan 00e route test)', () => {
  // Left as manual / integration-level verification.
})
```

Note: `loadFxRates` is a thin Supabase wrapper — its real test lives in the API route integration (plan 00e), where a live/mocked Supabase is set up. We do NOT mock the Supabase client in this unit test file; the slice tested here is the pure math (`translatePLAtMonthlyAverage` + `translationDiagnostics`).
  </action>
  <verify>
    <automated>npx vitest run src/lib/consolidation/fx.test.ts --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export async function loadFxRates\|export function translatePLAtMonthlyAverage\|export function translateBSAtClosingSpot\|export function translationDiagnostics" src/lib/consolidation/fx.ts` returns 4 matches
    - `grep "'HKD/AUD'\|HKD/AUD" src/lib/consolidation/fx.ts` returns matches (if any currency literal is present — documentation or examples); `grep "NZD_AUD\|'NZD/AUD'" src/lib/consolidation/fx.ts` returns 0 matches (no stale NZD)
    - `grep "=== undefined\|rate === undefined\|rates.get" src/lib/consolidation/fx.ts` returns matches (explicit missing-rate handling, not `?? 0` or `?? 1`)
    - `grep "rate === undefined\|?? 1\.0\|?? 1 " src/lib/consolidation/fx.ts` — second pattern must return 0 matches (no silent 1.0 fallback)
    - `grep "throw new Error" src/lib/consolidation/fx.ts` returns >=1 match (translateBSAtClosingSpot stub throws)
    - `npx vitest run src/lib/consolidation/fx.test.ts` reports >=7 passing tests
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>FX module exports loadFxRates + translatePLAtMonthlyAverage + translationDiagnostics + translateBSAtClosingSpot stub. Unit tests verify arithmetic, missing-rate flagging (no 1.0 fallback), key non-fabrication (Pitfall 2), and IICT fixture round-trip. Module is pure (except loadFxRates which is a DB read).</done>
</task>

</tasks>

<verification>
  <commands>
    - `npx vitest run src/lib/consolidation/fx.test.ts --reporter=dot` — all tests green
    - `npx tsc --noEmit` — clean
    - `grep "NZD" src/lib/consolidation/fx.ts` — zero matches (no stale currency)
  </commands>
</verification>

<success_criteria>
- fx.ts exports loadFxRates (DB loader), translatePLAtMonthlyAverage (pure), translationDiagnostics (pure), translateBSAtClosingSpot (stub)
- Missing rate = preserved value + month surfaced (NOT 1.0 silent fallback) — verified by test
- IICT fixture round-trip produces AUD values matching iictHKPL × 0.1925
- Slash currency pair format 'HKD/AUD' used throughout (no underscore, no NZD)
</success_criteria>

<output>
After completion, create `.planning/phases/34-dragon-multi-entity-consolidation/34-00c-SUMMARY.md` summarising:
- Module function count + signatures
- Test count + all-green
- Missing-rate handling contract (for plan 00e + 00f to surface to UI)
- Confirmation that no NZD references remain anywhere in src/lib/consolidation/
</output>
