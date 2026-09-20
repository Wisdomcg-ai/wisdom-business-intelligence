/**
 * Which exchange rates a consolidated pack cannot do without, and how to say so.
 *
 * translatePLAtMonthlyAverage never invents a rate: a month with none keeps
 * its foreign figure untranslated and is listed in fx_context.missing_rates.
 * That list was then read by nobody on the way to the client. Pre-flight was
 * handed the engine's diagnostics, which do not carry it, and passed "FX rates
 * complete" while IICT Group Limited's August Membership income printed as
 * 1,628,445 — the Hong Kong dollar figure, added to Australian dollars
 * one-for-one — where Calxa has 292,364 (IICT-04, IICT-05).
 *
 * A report needs the months it prints from: the fiscal year up to and
 * including the report month (the month, and the YTD columns built from the
 * months before it). A later month in the year is not printed, and neither is
 * any month before the year — though translation walks every month a line
 * carries, which is how IICT's banner came to list eighteen months when the
 * August pack reads two (IICT-62).
 *
 * Pure.
 */
import { packMonthYear } from '@/app/finances/monthly-report/services/pack-style'

export interface MissingRate {
  currency_pair: string
  period: string
}

/** The fiscal-year months a report for `reportMonth` prints from. */
export function reportedFxMonths(fyMonths: readonly string[], reportMonth: string): string[] {
  return fyMonths.filter((m) => m <= reportMonth)
}

/**
 * The missing rates a report for `reportMonth` reads, one per pair and month,
 * in month order. The consolidated route has already confined the list to the
 * fiscal year (reportedFxMonths); this drops anything after the report month,
 * so a caller holding an unscoped list never names a month the pack does not
 * print.
 */
export function missingRatesForReport(
  missing: readonly MissingRate[] | null | undefined,
  reportMonth: string,
): MissingRate[] {
  const seen = new Set<string>()
  const out: MissingRate[] = []
  for (const r of missing ?? []) {
    if (!r?.period || !r.currency_pair) continue
    const period = r.period.slice(0, 7)
    if (period > reportMonth) continue
    const key = `${r.currency_pair}::${period}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ currency_pair: r.currency_pair, period })
  }
  return out.sort((a, b) => a.period.localeCompare(b.period) || a.currency_pair.localeCompare(b.currency_pair))
}

/** "Jul 2026", "Jul 2026 and Aug 2026", "Jun 2026, Jul 2026 and Aug 2026". */
function listMonths(periods: string[]): string {
  const labels = periods.map(packMonthYear)
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * "no HKD/AUD exchange rate is stored for Jul 2026 and Aug 2026" — every pair,
 * every month, so the coach knows exactly which rates to load.
 */
export function describeMissingRates(missing: readonly MissingRate[]): string {
  const byPair = new Map<string, string[]>()
  for (const r of missing) byPair.set(r.currency_pair, [...(byPair.get(r.currency_pair) ?? []), r.period])
  const clauses = [...byPair.entries()].map(([pair, periods]) => `${pair} exchange rate is stored for ${listMonths([...new Set(periods)].sort())}`)
  return `no ${clauses.join('; no ')}`
}
