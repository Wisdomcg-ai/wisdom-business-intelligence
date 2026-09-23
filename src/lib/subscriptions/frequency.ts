/**
 * How often a vendor bills, and what that means in a month.
 *
 * The conversion used to be written out wherever it was needed — `/12` for an
 * annual in the frequency handler, `/3` for a quarterly in the manual-add form,
 * `* 12` again in the row renderer — which is why adding a fifth rhythm meant
 * finding all of them. It lives here now, once.
 *
 * "bi-annual" means twice a year here: every six months. The phrase is
 * genuinely ambiguous in English — it can also mean every two years — so the
 * label says "Every 6 months" rather than leaving a reader to guess.
 */

export type VendorFrequency = 'monthly' | 'quarterly' | 'bi-annual' | 'annual' | 'ad-hoc'

/** How many months one billing period covers. Ad-hoc is treated as monthly. */
const MONTHS_PER_PERIOD: Record<VendorFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  'bi-annual': 6,
  annual: 12,
  'ad-hoc': 1,
}

export const FREQUENCY_OPTIONS: { value: VendorFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'bi-annual', label: 'Every 6 months' },
  { value: 'annual', label: 'Annual' },
  { value: 'ad-hoc', label: 'Ad-hoc' },
]

export function monthsPerPeriod(frequency: VendorFrequency | null | undefined): number {
  return MONTHS_PER_PERIOD[(frequency ?? 'monthly') as VendorFrequency] ?? 1
}

/** The amount a vendor bills in one period → the monthly figure the P&L carries. */
export function monthlyFromPeriod(amount: number, frequency: VendorFrequency | null | undefined): number {
  const months = monthsPerPeriod(frequency)
  return months > 0 ? amount / months : amount
}

/** The monthly figure → what the operator recognises on the invoice. */
export function periodFromMonthly(monthly: number, frequency: VendorFrequency | null | undefined): number {
  return monthly * monthsPerPeriod(frequency)
}

/** The unit shown beside an amount field: "/mo", "/qtr", "/6mo", "/yr". */
export function periodSuffix(frequency: VendorFrequency | null | undefined): string {
  switch (frequency) {
    case 'quarterly': return '/qtr'
    case 'bi-annual': return '/6mo'
    case 'annual': return '/yr'
    default: return '/mo'
  }
}

/**
 * Does this rhythm bill in lumps rather than every month?
 *
 * The row renderer shows a renewal-month dropdown beside lumpy vendors and the
 * summary card lists them separately, because a $14,000 charge landing in one
 * month is a cashflow fact that a smoothed $1,167 hides.
 */
export function isLumpy(frequency: VendorFrequency | null | undefined): boolean {
  return frequency === 'annual' || frequency === 'bi-annual'
}
