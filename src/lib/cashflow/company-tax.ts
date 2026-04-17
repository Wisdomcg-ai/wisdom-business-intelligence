/**
 * Company Tax module — Phase 28.2
 *
 * Computes company income tax cash outflows for the forecast period based on
 * cashflow_settings (rate + payment schedule). Uses annualised net profit × rate,
 * distributed across payment months per the schedule.
 *
 * Schedules (hardcoded for now; wired to cashflow_schedules table in Phase 28.3):
 * - 'quarterly_payg_instalment': AU PAYG instalments Feb/Apr/Jul/Oct
 * - 'annual_aug': single payment in August
 * - 'none': no tax cash outflow (tax handled outside cashflow)
 */

export interface CompanyTaxConfig {
  rate: number                              // decimal, e.g. 0.25
  schedule: string                          // schedule name
}

/** Return the set of calendar month numbers (1-12) when tax is paid, per schedule */
function paymentMonthsForSchedule(schedule: string): number[] {
  switch (schedule) {
    case 'quarterly_payg_instalment':
      return [2, 4, 7, 10]   // AU BAS quarterly
    case 'annual_aug':
      return [8]             // single annual payment in August
    case 'none':
      return []
    default:
      return [2, 4, 7, 10]   // default to quarterly BAS
  }
}

/**
 * Compute the cash outflow per month for company tax.
 * Simple model: annual tax = annual net profit × rate, evenly distributed
 * across schedule payment months. More sophisticated models (YTD true-up,
 * prior year base) come in later phases.
 *
 * @param months             Ordered YYYY-MM strings for the forecast
 * @param netProfitByMonth   net profit per month (P&L basis, already computed)
 * @param config             { rate, schedule }
 * @returns                  YYYY-MM → tax payment (positive number = outflow)
 */
export function computeCompanyTaxByMonth(
  months: string[],
  netProfitByMonth: Record<string, number>,
  config: CompanyTaxConfig
): Record<string, number> {
  const result: Record<string, number> = {}
  if (config.rate <= 0 || config.schedule === 'none') return result

  const annualNet = Object.values(netProfitByMonth).reduce((s, v) => s + v, 0)
  const annualTax = Math.max(0, annualNet * config.rate)
  if (annualTax === 0) return result

  const paymentMonths = paymentMonthsForSchedule(config.schedule)
  if (paymentMonths.length === 0) return result

  // Which months in our forecast correspond to payment months?
  const eligibleMonths = months.filter(m => {
    const monthNum = parseInt(m.split('-')[1], 10)
    return paymentMonths.includes(monthNum)
  })

  if (eligibleMonths.length === 0) return result

  const perPayment = annualTax / eligibleMonths.length
  for (const m of eligibleMonths) {
    result[m] = Math.round(perPayment * 100) / 100
  }

  return result
}
