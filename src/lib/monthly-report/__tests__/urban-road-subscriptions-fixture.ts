/**
 * Urban Road's August 2026 IT Costs Software rows, as the subscription route returns them.
 *
 * Vendor rows are shaped as the route returns them — prod's vendor keys and
 * names. Their `statement` figures are the ones the client's IT Costs Software
 * sheet prints (Calxa p13), net of GST in dollars. The sheet prints whole
 * dollars, except Edi Cloud, whose bill CL007500 posted $1,022.73 — so the
 * statement actuals sum to the P&L's $14,725.73 exactly, and the prior month's
 * whole dollars sum 73c past the P&L's $13,764.27.
 *
 * The default figures (`actual`, `prior_month_actual`, `variance`) are the
 * gross document amounts the route quotes by default, as if every line were
 * billed GST-inclusive: the sheet's figure plus 10%, and Edi Cloud's $1,125.
 *
 * The budgets are the sheet's (vendor sum $13,596), i.e. the page once Matt's
 * net per-vendor budgets are loaded; the TOTAL budget is the approved $13,697,
 * and the one the standard page printed before the budget store is the vendor
 * sum (no forecast line carries the account).
 */
import type { SubscriptionDetailData, SubscriptionVendorLine } from '@/app/finances/monthly-report/types'

export type V = [key: string, name: string, prior: number, budget: number, actual: number]
export const SHEET: V[] = [
  ['adobe', 'Adobe', 603, 389, 412],
  ['canva', 'Canva', 20, 20, 20],
  ['chatgpt', 'ChatGPT', 185, 161, 183],
  ['anthropic', 'Anthropic', 387, 350, 585],
  ['clickup', 'Clickup', 423, 425, 475],
  ['cloudflare', 'Cloudflare', 36, 37, 35],
  ['datafeedwatch', 'Data Feed Watch', 156, 156, 154],
  ['dropbox', 'Dropbox', 253, 305, 246],
  // Keyed and named as Step 6 and the history key bill CL007500 (its
  // description mentions Harvey Norman); the sheet's "Edi Cloud" is a label.
  ['harveynorman', 'Harvey Norman', 0, 0, 1022.73],
  ['firefliesai', 'Fireflies.ai', 51, 38, 50],
  ['googleworkspace', 'Google Workspace', 297, 348, 284],
  ['instantlyai', 'Instantly Ai', 70, 70, 68],
  ['klaviyoinc', 'Klaviyo Inc', 1456, 1470, 1445],
  ['kreaai', 'Krea.ai', 53, 55, 52],
  ['machship', 'Machship', 612, 621, 638],
  ['microsoft365', 'Microsoft 365', 555, 513, 555],
  ['midjourney', 'Midjourney', 98, 99, 95],
  ['neto', 'Neto', 398, 199, 199],
  ['orderdesk', 'Orderdesk', 29, 30, 29],
  ['paddle', 'Paddle', 272, 287, 270],
  ['profitpeak', 'Profitpeak', 1088, 1088, 1088],
  ['recraft', 'Recraft', 18, 18, 18],
  ['reviewsio', 'Reviews Io', 1256, 1256, 1256],
  ['shopify', 'Shopify', 4212, 4500, 4261],
  ['visily', 'Visily', 21, 21, 21],
  ['xero', 'Xero', 164, 140, 164],
  ['zapier', 'Zapier', 0, 0, 48],
  ['zohocorp', 'Zoho Corp', 1052, 1000, 1052],
  // Active budget rows the route backfills with nothing against them in August:
  // Inhaabit renews in September, Loom in March.
  ['inhaabitarptyltd', 'Inhaabit Ar Pty Ltd', 0, 0, 0],
  ['loom', 'Loom', 0, 0, 0],
]

const round2 = (n: number) => Math.round(n * 100) / 100
/** The gross document amount of a sheet figure: GST on top, and bill CL007500 as billed. */
export const gross = (key: string, net: number) => (key === 'harveynorman' && net === 1022.73 ? 1125 : round2(net * 1.1))

export const vendor = ([key, name, prior, budget, actual]: V): SubscriptionVendorLine => ({
  vendor_key: key,
  vendor_name: name,
  prior_month_actual: gross(key, prior),
  budget,
  actual: gross(key, actual),
  variance: round2(budget - gross(key, actual)),
  transaction_count: actual !== 0 ? 1 : 0,
  category: null,
  statement: { prior_month_actual: prior, actual, variance: round2(budget - actual) },
})

export function detail(vendors: V[] = SHEET, budgetSource: 'approved_budget' | 'vendor_sum' = 'approved_budget'): SubscriptionDetailData {
  return {
    report_month: '2026-08',
    accounts: [{
      account_code: '63700',
      account_name: 'IT Costs Software',
      vendors: vendors.map(vendor),
      total_prior_month: 13764.27,
      total_actual: 14725.73,
      total_budget: 13697,
      total_variance: Math.round((13697 - 14725.73) * 100) / 100,
      total_budget_source: budgetSource,
      // Urban Road has no forecast line for the account, so before the budget
      // store the page's total budget was the vendor budgets.
      ...(budgetSource === 'approved_budget' ? { pre_budget_store_total: { budget: 13596, variance: -1129.73, source: 'vendor_sum' as const } } : {}),
    }],
    grand_total: { prior_month: 13764.27, actual: 14725.73, budget: 13697, variance: -1028.73 },
    ...(budgetSource === 'approved_budget' ? { pre_budget_store_grand_budget: 13596 } : {}),
  }
}

/** The sheet's names, for the keys that are the same vendor under WisdomBI's canonical name. */
export const LABELS = {
  anthropic: 'Claude', harveynorman: 'Edi Cloud', cloudflare: 'Cloudflare Inc', firefliesai: 'fireflies', googleworkspace: 'Google',
  klaviyoinc: 'KLAVIYO INC', microsoft365: 'Microsoft', neto: 'neto', paddle: 'paddle.net',
  reviewsio: 'Reviews IO', visily: 'VISILY', zapier: 'Zapier Inc',
}

