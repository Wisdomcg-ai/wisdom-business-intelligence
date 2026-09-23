/**
 * FLEET-02 (26 Aug 2026) — cash derived from the balance-sheet mirror.
 *
 * `financial_metrics.total_cash` was 0.00 in EVERY row fleet-wide (verified in
 * prod: 27 of 28 rows exactly 0, 1 null) because all three writers called
 * `api.xro/2.0/BankSummary` — Xero's BankSummary is a REPORT at
 * `/api.xro/2.0/Reports/BankSummary` — and parsed a property the real response
 * never contains. `/cfo` then showed "Cash $0" for all 6 CFO clients as fact.
 *
 * The two rules these tests exist to defend:
 *   1. "No data" must be null (rendered "—"), never a fabricated 0.
 *   2. A foreign-currency tenant with no closing-spot rate is EXCLUDED and
 *      flagged, never summed at 1:1 — IICT holds HK$1,833,977, which at 1:1
 *      would land as ~$1.8M of phantom AUD (the FX-01 defect, again).
 */
import { describe, it, expect } from 'vitest'
import { deriveCashFromBSMirror } from '@/lib/xero/derive-cash-from-bs-mirror'

type Row = Record<string, unknown>

/** Minimal supabase stub: table -> rows, with .in()/.eq() filtering. */
function stub(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const api: Record<string, unknown> = {}
      api.select = () => api
      api.in = (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col] as never))
        return api
      }
      api.eq = (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val)
        return api
      }
      api.then = (onF: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(onF)
      return api
    },
  }
}

const bank = (over: Row = {}): Row => ({
  business_id: 'biz-1',
  tenant_id: 'ten-aud',
  balance_date: '2026-08-31',
  balance: 100,
  section: 'Bank',
  ...over,
})

describe('rule 1 — "no data" is never $0', () => {
  it('returns null when the business has no bank rows at all', async () => {
    const out = await deriveCashFromBSMirror(
      stub({ xero_bs_lines: [] }),
      new Map([['biz-1', ['biz-1']]]),
    )
    expect(out.get('biz-1')).toEqual({ amount: null, as_at: null, missing_fx: [], partial: false })
  })

  it('returns null when rows exist but none are bank rows', async () => {
    const out = await deriveCashFromBSMirror(
      stub({ xero_bs_lines: [bank({ section: 'Current Liabilities' })] }),
      new Map([['biz-1', ['biz-1']]]),
    )
    expect(out.get('biz-1')!.amount).toBeNull()
  })

  it('a genuine zero balance is reported as 0, not null', async () => {
    const out = await deriveCashFromBSMirror(
      stub({
        xero_bs_lines: [bank({ balance: 0 })],
        xero_connections: [{ tenant_id: 'ten-aud', functional_currency: 'AUD' }],
      }),
      new Map([['biz-1', ['biz-1']]]),
    )
    expect(out.get('biz-1')!.amount).toBe(0)
  })
})

describe('rule 2 — foreign currency is never summed at 1:1', () => {
  const iictRows = [
    bank({ tenant_id: 'ten-aud', balance: 42_889.7 }),
    bank({ tenant_id: 'ten-hkd', balance: 1_833_977.52 }),
  ]
  const conns = [
    { tenant_id: 'ten-aud', functional_currency: 'AUD' },
    { tenant_id: 'ten-hkd', functional_currency: 'HKD' },
  ]

  it('EXCLUDES the HKD tenant and flags it when no closing-spot rate exists', async () => {
    const out = await deriveCashFromBSMirror(
      stub({ xero_bs_lines: iictRows, xero_connections: conns, fx_rates: [] }),
      new Map([['iict', ['biz-1']]]),
    )
    const r = out.get('iict')!
    // AUD only — the HK$1.83M is NOT added
    expect(r.amount).toBe(42_889.7)
    expect(r.partial).toBe(true)
    expect(r.missing_fx).toEqual([{ currency_pair: 'HKD/AUD', period: '2026-08-31' }])
    // the 1:1 disaster this prevents
    expect(r.amount).not.toBeCloseTo(42_889.7 + 1_833_977.52, 2)
  })

  it('translates the HKD tenant when a closing-spot rate IS present', async () => {
    const out = await deriveCashFromBSMirror(
      stub({
        xero_bs_lines: iictRows,
        xero_connections: conns,
        fx_rates: [
          { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-08-31', rate: 0.1778 },
        ],
      }),
      new Map([['iict', ['biz-1']]]),
    )
    const r = out.get('iict')!
    expect(r.partial).toBe(false)
    expect(r.missing_fx).toEqual([])
    expect(r.amount).toBeCloseTo(42_889.7 + 1_833_977.52 * 0.1778, 1)
  })
})

describe('multi-org and dual-ID behaviour', () => {
  it('sums every AUD tenant of a multi-org business', async () => {
    const out = await deriveCashFromBSMirror(
      stub({
        xero_bs_lines: [
          bank({ tenant_id: 't1', balance: 100_000 }),
          bank({ tenant_id: 't2', balance: 44_127 }),
        ],
        xero_connections: [
          { tenant_id: 't1', functional_currency: 'AUD' },
          { tenant_id: 't2', functional_currency: 'AUD' },
        ],
      }),
      new Map([['dragon', ['biz-1']]]),
    )
    expect(out.get('dragon')!.amount).toBe(144_127)
  })

  it('finds rows stored under either id-space (dual-ID)', async () => {
    const out = await deriveCashFromBSMirror(
      stub({
        xero_bs_lines: [bank({ business_id: 'profile-1', balance: 555 })],
        xero_connections: [{ tenant_id: 'ten-aud', functional_currency: 'AUD' }],
      }),
      new Map([['biz-1', ['biz-1', 'profile-1']]]),
    )
    expect(out.get('biz-1')!.amount).toBe(555)
  })

  it('uses the newest balance_date and ignores older snapshots', async () => {
    const out = await deriveCashFromBSMirror(
      stub({
        xero_bs_lines: [
          bank({ balance_date: '2026-07-31', balance: 999_999 }),
          bank({ balance_date: '2026-08-31', balance: 200 }),
        ],
        xero_connections: [{ tenant_id: 'ten-aud', functional_currency: 'AUD' }],
      }),
      new Map([['biz-1', ['biz-1']]]),
    )
    const r = out.get('biz-1')!
    expect(r.as_at).toBe('2026-08-31')
    expect(r.amount).toBe(200)
  })
})
