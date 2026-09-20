/**
 * IICT's HubSpot memberships, Jan–Aug 2026 — Calxa pages 3 and 4.
 *
 * p3 is an eight-month trend with the newest month on the left, in a declared
 * order (New ANZ, New Other, Total New, Renew ANZ, Renew Other, Upgrade,
 * Downgrade, Total Renewing, Total Members) and an Avg. Membership Rate line
 * under the dollars. p4 is August against budget, where only the subtotals
 * carry a budget: Total New 181 / $38,010, Total Renewing 842 / $176,820.
 *
 * The series is the one that already exists in prod (external_metric_series
 * 'hubspot_memberships': dimension "Member type", measures members and
 * revenue). Only the values are missing — IICT-14.
 */
export const HUBSPOT_MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'] as const

/** Newest first, as Calxa prints them: Aug-26 … Jan-26. */
const NEWEST_FIRST = [...HUBSPOT_MONTHS].reverse()

type Row = [string, number[], number[]]
/** Member type, members newest-first, revenue newest-first. */
const ROWS: Row[] = [
  ['New Members / Subscribe (AU & NZ)', [220, 160, 208, 173, 239, 178, 154, 142], [45280, 31398, 41368, 32238, 46548, 33644, 29673, 27458]],
  ['New Members / Subscribe (Outside AU & NZ)', [58, 61, 97, 76, 59, 76, 50, 32], [6512, 7449, 11293, 9144, 6271, 9304, 6050, 3448]],
  ['Renew Members (AU & NZ)', [720, 819, 959, 750, 577, 713, 677, 613], [161670, 184505, 212867, 159586, 128494, 162704, 153742, 138424]],
  ['Renew Members (Outside AU & NZ)', [134, 127, 137, 120, 127, 116, 120, 123], [23779, 18644, 21215, 17525, 15983, 16835, 15450, 21149]],
  ['Upgrade Members', [28, 21, 16, 14, 13, 18, 17, 17], [5850, 4163, 3588, 2950, 2616, 3471, 3687, 3552]],
  ['Downgrade Members', [0, 3, 0, 1, 0, 0, 2, 1], [0, 657, 0, 219, 0, 0, 438, 219]],
]

export interface MetricValue {
  period_month: string
  dimension_value: string
  measure_key: string
  scenario: 'actual' | 'budget'
  value: number
}

export const HUBSPOT_VALUES: MetricValue[] = ROWS.flatMap(([dimension_value, members, revenue]) =>
  NEWEST_FIRST.flatMap((period_month, i) => [
    { period_month, dimension_value, measure_key: 'members', scenario: 'actual' as const, value: members[i] },
    { period_month, dimension_value, measure_key: 'revenue', scenario: 'actual' as const, value: revenue[i] },
  ]))

/** Calxa p4: the budget sits on the subtotals, never on the rows under them. */
export const HUBSPOT_BUDGETS: MetricValue[] = [
  { period_month: '2026-08', dimension_value: 'Total New Members', measure_key: 'members', scenario: 'budget', value: 181 },
  { period_month: '2026-08', dimension_value: 'Total New Members', measure_key: 'revenue', scenario: 'budget', value: 38010 },
  { period_month: '2026-08', dimension_value: 'Total Renewing members', measure_key: 'members', scenario: 'budget', value: 842 },
  { period_month: '2026-08', dimension_value: 'Total Renewing members', measure_key: 'revenue', scenario: 'budget', value: 176820 },
]

export const HUBSPOT_SERIES = {
  id: 'hubspot',
  series_key: 'hubspot_memberships',
  display_name: 'HubSpot — Memberships',
  dimension_label: 'Member type',
  measures: [
    { key: 'members', label: '#', format: 'number' },
    { key: 'revenue', label: '$', format: 'currency' },
  ],
  values: [...HUBSPOT_VALUES, ...HUBSPOT_BUDGETS].filter((v) => v.period_month === '2026-08'),
  history: [...HUBSPOT_VALUES, ...HUBSPOT_BUDGETS],
  tie: null,
}

/** The placement Calxa p3 is: eight months, newest on the left, in this order. */
export const HUBSPOT_ROWS = [
  { dimension: 'New Members / Subscribe (AU & NZ)' },
  { dimension: 'New Members / Subscribe (Outside AU & NZ)' },
  { subtotal: 'Total New Members', of: ['New Members / Subscribe (AU & NZ)', 'New Members / Subscribe (Outside AU & NZ)'] },
  { dimension: 'Renew Members (AU & NZ)' },
  { dimension: 'Renew Members (Outside AU & NZ)' },
  { dimension: 'Upgrade Members' },
  { dimension: 'Downgrade Members' },
  {
    subtotal: 'Total Renewing members',
    of: ['Renew Members (AU & NZ)', 'Renew Members (Outside AU & NZ)', 'Upgrade Members', 'Downgrade Members'],
  },
  { subtotal: 'Total Members', of: ['Total New Members', 'Total Renewing members'] },
  { line: 'Avg. Membership Rate', row: 'Total Members', measure: 'avg_rate', under: 'revenue' },
]

export const HUBSPOT_DERIVED = [
  { key: 'avg_rate', label: 'Avg. Membership Rate', format: 'currency', op: 'divide', left: 'revenue', right: 'members' },
]

export const HUBSPOT_TREND_CONFIG = {
  series_key: 'hubspot_memberships',
  layout: 'trend',
  months: 8,
  rows: HUBSPOT_ROWS,
  derived_measures: HUBSPOT_DERIVED,
  notes: ['HubSpot dollars do not tie to Xero Membership income while insurance premiums sit in that account.'],
}

/** Calxa p4 — the same rows for one month, against budget. */
export const HUBSPOT_MONTH_CONFIG = {
  series_key: 'hubspot_memberships',
  rows: HUBSPOT_ROWS,
  derived_measures: HUBSPOT_DERIVED,
}
