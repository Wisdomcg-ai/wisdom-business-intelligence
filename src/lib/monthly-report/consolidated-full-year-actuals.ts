/**
 * The Full Year page's actuals for a business with more than one Xero
 * organisation and no active forecast — read through the consolidation engine.
 *
 * With an active forecast the page's actuals come from ForecastReadService,
 * which sums the organisations and translates a foreign one. Without one the
 * page fell back to reading every organisation's rows keyed on the account
 * NAME, the later organisation overwriting the earlier and a Hong Kong dollar
 * taken as an Australian one: IICT plotted August income of 32,516.53 where
 * Calxa has 324,881, and projected a net loss of 789,661 against Calxa's profit
 * of 475,523 (IICT-18, IICT-44). Wave 1 refused that read
 * (multi-org-fallback.ts). This is the read to use instead: the same engine,
 * alignment and monthly-average translation as the consolidated statement.
 *
 * Two fiscal years, because the page prints the prior year beside every month
 * (the charts' "LastYear Actuals" series). A rate the page needs and does not
 * have — a month up to the report month, or any month of the prior year — is a
 * refusal naming the months, never an untranslated figure.
 */
import { buildConsolidation } from '@/lib/consolidation/engine'
import { loadFxRates, translatePLAtMonthlyAverage } from '@/lib/consolidation/fx'
import { generateFiscalMonthKeys } from '@/lib/utils/fiscal-year-utils'
import { describeMissingRates, type MissingRate } from './consolidated-fx'

type Client = any

export interface ConsolidatedActualLine {
  account_code: null
  account_name: string
  account_type: string
  section: string
  monthly_values: Record<string, number>
}

export type ConsolidatedFullYearActuals =
  | { ok: true; lines: ConsolidatedActualLine[]; organisations: number }
  | { ok: false; error: string }

export async function loadConsolidatedFullYearActuals(
  supabase: Client,
  input: {
    /** businesses-space. */
    businessId: string
    fiscalYear: number
    yearStartMonth: number
    /** The last month printed as an actual. */
    lastActualMonth: string
  },
): Promise<ConsolidatedFullYearActuals> {
  const current = generateFiscalMonthKeys(input.fiscalYear, input.yearStartMonth)
  const prior = generateFiscalMonthKeys(input.fiscalYear - 1, input.yearStartMonth)
  const missing: MissingRate[] = []

  const run = (fyMonths: string[], fiscalYear: number, reportMonth: string, needed: Set<string>) =>
    buildConsolidation(supabase, {
      businessId: input.businessId,
      reportMonth,
      fiscalYear,
      fyMonths,
      translate: async (tenant, lines) => {
        const pair = `${tenant.functional_currency}/AUD`
        const rates = await loadFxRates(supabase, pair, 'monthly_average', fyMonths)
        const { translated, missing: gaps } = translatePLAtMonthlyAverage(lines, rates)
        for (const m of gaps) if (needed.has(m)) missing.push({ currency_pair: pair, period: m })
        const ratesUsed: Record<string, number> = {}
        for (const [m, r] of rates.entries()) ratesUsed[`${pair}::${m}`] = r
        return { translated, missing: gaps, ratesUsed }
      },
    })

  const [thisYear, lastYear] = await Promise.all([
    run(current, input.fiscalYear, input.lastActualMonth, new Set(current.filter((m) => m <= input.lastActualMonth))),
    run(prior, input.fiscalYear - 1, prior[prior.length - 1], new Set(prior)),
  ])

  if (missing.length > 0) {
    const seen = new Set<string>()
    const unique = missing
      .filter((r) => (seen.has(`${r.currency_pair}${r.period}`) ? false : (seen.add(`${r.currency_pair}${r.period}`), true)))
      .sort((a, b) => a.period.localeCompare(b.period))
    return {
      ok: false,
      error: `This page combines ${thisYear.byTenant.length} Xero organisations and ${describeMissingRates(unique)}, `
        + 'so their figures cannot be added together in AUD. Load the rates (Admin, Consolidation), then open the page again.',
    }
  }

  // One row per account across both years, on the engine's alignment key.
  const byKey = new Map<string, ConsolidatedActualLine>()
  for (const line of [...lastYear.consolidated.lines, ...thisYear.consolidated.lines]) {
    const key = `${line.account_type.toLowerCase()}::${line.account_name.toLowerCase().trim()}`
    const row = byKey.get(key) ?? { account_code: null, account_name: line.account_name, account_type: line.account_type, section: '', monthly_values: {} }
    Object.assign(row.monthly_values, line.monthly_values)
    byKey.set(key, row)
  }
  return { ok: true, lines: [...byKey.values()], organisations: thisYear.byTenant.length }
}
