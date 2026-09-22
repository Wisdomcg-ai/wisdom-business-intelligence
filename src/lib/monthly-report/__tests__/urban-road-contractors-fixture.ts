/**
 * Urban Road's contractor account (61400 Contractors excl. Artists) for August
 * 2026, as the subscription-detail route returns it when asked for three months.
 *
 * A FIXTURE, not a crawl. The preview harness cannot call Xero, and nothing
 * persists contractor documents, so the vendor figures are the ones the
 * client's Contractors Payment Summary prints (Calxa p14, Jun–Aug 2026) —
 * net AUD, WHOLE DOLLARS, because that is all the sheet prints. They are the
 * statement (net) figures; the gross ones are the same, except go sweet spot's
 * NZD bill INV-404634, whose document amount is 561.40 against its 403.28 in
 * the P&L's money (the audit's own read of the bill). The whole dollars leave
 * the vendor rows 70c over the ledger in August and 60c under it in July —
 * rounding, under the page's $1 Unallocated threshold, so no Unallocated row
 * prints; the live crawl carries cents.
 *
 * The rest is prod, read 14 Sep 2026:
 *   - budgets and departments: the 15 subscription_budgets rows on 61400
 *     (inactive today — data change C01 reactivates them), $30,081 a month.
 *     Airtasker and go sweet spot have no row; Kim Andrea Ambrocio's has no
 *     department. Those three are Matt's to file.
 *   - the ledger: xero_pl_lines 61400 — Jun 23,173.42, Jul 29,910.60,
 *     Aug 31,029.30.
 *   - the account budget: budget version 72c658c0 (FY2027, locked, effective
 *     2026-07) — Jul 28,007, Aug 28,375. There is no FY2026 version, so June
 *     has none.
 */
import type { SubscriptionDetailData, SubscriptionVendorLine } from '@/app/finances/monthly-report/types'

export const MONTHS = ['2026-06', '2026-07', '2026-08'] as const

type C = [name: string, category: string | null, budget: number, jun: number, jul: number, aug: number]
export const SHEET: C[] = [
  ['Ailene Alfonso', 'Marketing', 2922, 2124, 2721, 2099],
  ['Akshay Nirmal Proprietorship', 'All Departments', 6000, 4681, 4721, 5851],
  ['Allaine Fria', 'Creative/Product', 1522, 692, 1321, 1384],
  ['Anna Lischenko', 'Creative/Product', 550, 0, 1524, 696],
  ['Ara Vergara', 'Marketing', 0, 0, 0, 0],
  ['Emma Severin Freelancing', 'Creative/Product', 0, 249, 0, 190],
  ['Honeybee Dionio', 'Operations', 2310, 2100, 2048, 2625],
  ['Katrina Redondo', 'Finance', 3000, 2588, 2588, 2797],
  ['Lara Martinez', 'Marketing', 3072, 1839, 2925, 2228],
  ['Mark Joseph Judaya', 'Creative/Product', 2800, 2307, 4023, 5549],
  ['Maxx Tud', 'Operations', 2200, 1998, 1998, 2498],
  ['Reena Rosales', 'Operations', 1760, 1600, 2000, 1600],
  ['Upwork Global', 'Sales/Commercial', 1650, 1342, 1419, 1382],
  ['Van Anthony Ogatis', 'Sales/Commercial', 975, 753, 853, 338],
  ['Airtasker', null, 0, 0, 269, 190],
  ['Kim Andrea Ambrocio', null, 1320, 900, 1500, 1200],
  ['go sweet spot', null, 0, 0, 0, 403],
]

/** go sweet spot's bill in its document's own amount (NZD, as the route quotes gross). */
const GROSS_OVERRIDES: Record<string, Partial<Record<(typeof MONTHS)[number], number>>> = {
  gosweetspot: { '2026-08': 561.4 },
}

export const LEDGER = { '2026-06': 23173.42, '2026-07': 29910.6, '2026-08': 31029.3 }

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const round2 = (n: number) => Math.round(n * 100) / 100

export function contractorDetail(): SubscriptionDetailData {
  const vendors: SubscriptionVendorLine[] = SHEET.map(([name, category, budget, jun, jul, aug]) => {
    const key = keyOf(name)
    const net = { '2026-06': jun, '2026-07': jul, '2026-08': aug }
    const gross = { ...net, ...GROSS_OVERRIDES[key] }
    return {
      vendor_name: name,
      vendor_key: key,
      prior_month_actual: gross['2026-07'],
      actual: gross['2026-08'],
      budget,
      variance: round2(budget - gross['2026-08']),
      transaction_count: aug !== 0 ? 1 : 0,
      category,
      months: gross,
      statement: { prior_month_actual: jul, actual: aug, variance: round2(budget - aug), months: net },
    }
  })
  return {
    accounts: [{
      account_code: '61400',
      account_name: 'Contractors excl. Artists',
      vendors,
      total_prior_month: LEDGER['2026-07'],
      total_actual: LEDGER['2026-08'],
      total_budget: 28375,
      total_variance: round2(28375 - LEDGER['2026-08']),
      total_budget_source: 'approved_budget',
      window: {
        months: [...MONTHS],
        actual: { ...LEDGER },
        actual_source: 'ledger',
        budget: { '2026-06': null, '2026-07': 28007, '2026-08': 28375 },
        budget_absent: { '2026-06': 'no approved budget version is locked for FY2026' },
      },
    }],
    grand_total: { prior_month: LEDGER['2026-07'], actual: LEDGER['2026-08'], budget: 28375, variance: round2(28375 - LEDGER['2026-08']) },
    report_month: '2026-08',
    complete: true,
  }
}
