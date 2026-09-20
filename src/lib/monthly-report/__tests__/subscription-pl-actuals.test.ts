/**
 * DRG-34 — the Subscriptions page's account total does not depend on row order.
 *
 * The total is read from xero_pl_lines_wide_compat, one row per LEDGER row
 * (org × account_id × code × section), and was kept per org with `set` — the
 * last row read for an org won. Dragon Roofing + Easy Hail carry 62 stale
 * mirror rows from before a resync: same org, same account name, a superseded
 * account_id, nothing in 2026. Today's read order happens to put each org's
 * live 485 Subscriptions row last, so August prints 6,515.08; the same rows in
 * another order print Easy Hail's stale 0 and lose $1,786.
 *
 * Summed per org instead. The one thing `set` was right to do — not count a
 * row twice when it is read once per business id-space — is kept by keying on
 * the ledger row, not the org.
 *
 * Rows are Dragon's, August 2026 (tenants 42735fc3 Dragon, 3b67e5b6 Easy Hail).
 */
import { describe, it, expect } from 'vitest'
import { sumSubscriptionPlActuals, type SubscriptionPlRow } from '../subscription-detail-build'

const DRAGON = '42735fc3-21f2-4668-9783-93ce0f66f481'
const EASY_HAIL = '3b67e5b6-780c-4158-831c-82293f34ca04'

const row = (tenant_id: string, account_id: string, account_name: string, monthly_values: Record<string, number>, section: string | null = null): SubscriptionPlRow => ({
  tenant_id, account_id, account_code: account_name === 'Subscriptions' ? '485' : '488', account_type: 'opex', section, account_name, monthly_values,
})

const ROWS: SubscriptionPlRow[] = [
  row(EASY_HAIL, 'ehc-488-live', 'Appointment Setting', {}),
  // Easy Hail's superseded Subscriptions row: last touched 20 Apr 2026.
  row(EASY_HAIL, '5b442f25-1129-5b73-ac09-d617c2213da9', 'Subscriptions', { '2026-07': 0, '2026-08': 0 }, 'Less Operating Expenses'),
  row(EASY_HAIL, 'ehc-488-stale', 'Appointment Setting', {}),
  row(EASY_HAIL, 'ehc-485-live', 'Subscriptions', { '2026-07': 2967.98, '2026-08': 1786 }),
  row(DRAGON, 'drg-488-live', 'Appointment Setting', {}),
  // Dragon's superseded row still holds FY2025 history the live row does not.
  row(DRAGON, 'drg-485-stale', 'Subscriptions', { '2025-04': 4501.45, '2025-05': 4183.14, '2025-06': 4293.82 }, 'Less Operating Expenses'),
  row(DRAGON, 'drg-485-live', 'Subscriptions', { '2026-07': 4256.13, '2026-08': 4729.08 }),
]

const opts = {
  accountCodes: ['488', '485'],
  accountNames: new Map([['485', 'Subscriptions'], ['488', 'Appointment Setting']]),
  reportMonth: '2026-08',
  priorMonth: '2026-07',
  windowMonths: [] as string[],
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs]
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))
}

describe('the Subscriptions account total', () => {
  it("is Dragon's ledger — 4,729.08 + 1,786.00 = 6,515.08 for August, 7,224.11 for July", () => {
    const r = sumSubscriptionPlActuals(ROWS, opts)
    expect(r.actuals.get('485')).toBe(6515.08)
    expect(r.priorActuals.get('485')).toBe(7224.11)
    expect(r.actuals.get('488')).toBe(0)
  })

  it('whatever order the rows come back in', () => {
    // The four Subscriptions rows' 24 orders — every one must give the ledger.
    const subs = ROWS.filter((x) => x.account_name === 'Subscriptions')
    const others = ROWS.filter((x) => x.account_name !== 'Subscriptions')
    for (const order of permutations(subs)) {
      const r = sumSubscriptionPlActuals([...others, ...order], opts)
      expect(r.actuals.get('485')).toBe(6515.08)
      expect(r.priorActuals.get('485')).toBe(7224.11)
    }
  })

  it('a stale row read AFTER the live one no longer wipes it', () => {
    const isLive = (x: SubscriptionPlRow) => (x.account_id ?? '').includes('live')
    const liveFirst = [...ROWS.filter(isLive), ...ROWS.filter((x) => !isLive(x))]
    expect(sumSubscriptionPlActuals(liveFirst, opts).actuals.get('485')).toBe(6515.08)
  })

  it('a ledger row read once per business id-space is counted once', () => {
    const doubled = [...ROWS, ...ROWS.map((x) => ({ ...x }))]
    const r = sumSubscriptionPlActuals(doubled, opts)
    expect(r.actuals.get('485')).toBe(6515.08)
    expect(r.priorActuals.get('485')).toBe(7224.11)
  })

  it('a window keeps each month the ledger has, the superseded rows included', () => {
    const r = sumSubscriptionPlActuals(ROWS, { ...opts, windowMonths: ['2025-06', '2026-07', '2026-08'] })
    expect(r.windowActuals.get('485')).toEqual({ '2025-06': 4293.82, '2026-07': 7224.11, '2026-08': 6515.08 })
  })

  it('a single-org business with one row per account is exactly what it was', () => {
    const one = [row(DRAGON, 'drg-485-live', 'Subscriptions', { '2026-07': 4256.13, '2026-08': -4729.08 })]
    const r = sumSubscriptionPlActuals(one, opts)
    // Absolute, as the page has always read the ledger.
    expect(r.actuals.get('485')).toBe(4729.08)
    expect(r.priorActuals.get('485')).toBe(4256.13)
    expect(r.actuals.has('488')).toBe(false)
    expect(r.windowActuals.size).toBe(0)
  })
})
