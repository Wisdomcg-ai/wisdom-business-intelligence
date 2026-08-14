/**
 * The BS parser must never silently discard a section.
 *
 * `mapBSSectionToType` classified sections by substring — asset / liabilit /
 * equity / owner — and `parseSingleMonthBSReport` skipped any section it could
 * not name-match, with no log and no Sentry. Xero emits `Bank` as a TOP-LEVEL
 * sibling of `Assets` (which carries zero data rows), so every bank account of
 * every tenant was thrown away before it reached the mirror.
 *
 * Assets were understated by exactly the bank total. Verified in prod: 888 bank
 * rows across 13 tenants missing from `xero_balance_sheet_lines`, 14 tenant-
 * months reconciling to the cent once added back, and 0 of 11 real Xero tenants
 * ever satisfying assets − liabilities − equity = 0.
 *
 * These run against REAL captured Xero responses, which is what makes them
 * meaningful — the previous tests passed because their fixtures had no `Bank`
 * section.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseSingleMonthBSReport,
  mapBSSectionToType,
  mapXeroClassToType,
} from '@/app/api/monthly-report/sync-xero/report-parsers'

function fixture(name: string) {
  const raw = JSON.parse(readFileSync(`src/__tests__/xero/fixtures/${name}`, 'utf8'))
  return raw.response.Reports[0]
}

const total = (m: Map<string, { value: number }>, names: string[]) =>
  names.reduce((s, n) => s + (m.get(n)?.value ?? 0), 0)

describe('the section-title mapper cannot see these — which is why it is a fallback', () => {
  it.each(['Bank', 'Credit Cards', 'Net ATO Balance', 'Provision for Income Tax', "Director's Loan"])(
    '%s maps to null',
    section => expect(mapBSSectionToType(section)).toBeNull(),
  )

  it('still resolves the sections it was designed for', () => {
    expect(mapBSSectionToType('Current Assets')).toBe('asset')
    expect(mapBSSectionToType('Non-Current Liabilities')).toBe('liability')
    expect(mapBSSectionToType('Equity')).toBe('equity')
  })
})

describe('the chart of accounts is the authority', () => {
  it('classifies every Xero balance-sheet class', () => {
    expect(mapXeroClassToType('ASSET')).toBe('asset')
    expect(mapXeroClassToType('LIABILITY')).toBe('liability')
    expect(mapXeroClassToType('EQUITY')).toBe('equity')
  })

  it('returns null for a P&L class or junk, so it never mis-files one', () => {
    expect(mapXeroClassToType('REVENUE')).toBeNull()
    expect(mapXeroClassToType('EXPENSE')).toBeNull()
    expect(mapXeroClassToType(null)).toBeNull()
    expect(mapXeroClassToType('')).toBeNull()
  })
})

describe('real Xero payloads — the bank accounts survive', () => {
  it('keeps all three of JDS\'s bank accounts (was: all dropped)', () => {
    const parsed = parseSingleMonthBSReport(fixture('jds-bs-2026-04-30.json'))
    const banks = ['Aeris Paypal', 'Capital Growth Account', 'Cheque Account']
    const present = banks.filter(b => parsed.has(b))
    expect(present.length).toBeGreaterThan(0)
    // Every retained bank row sits under the 'Bank' section.
    for (const b of present) expect(parsed.get(b)!.section).toBe('Bank')
  })

  it('carries the account GUID so the catalog can classify it', () => {
    const parsed = parseSingleMonthBSReport(fixture('jds-bs-2026-04-30.json'))
    const withIds = [...parsed.values()].filter(v => v.account_id)
    expect(withIds.length).toBeGreaterThan(0)
  })

  it('leaves Bank unclassified WITHOUT a catalog — visible, not silently dropped', () => {
    const parsed = parseSingleMonthBSReport(fixture('jds-bs-2026-04-30.json'))
    const bank = [...parsed.entries()].find(([, v]) => v.section === 'Bank')
    expect(bank).toBeDefined()
    // Title-based mapping cannot resolve 'Bank'; the row is still RETURNED.
    expect(bank![1].account_type).toBeNull()
  })

  it('classifies Bank as an asset once the catalog is supplied', () => {
    const parsed = parseSingleMonthBSReport(
      fixture('jds-bs-2026-04-30.json'),
      () => 'asset', // stand-in for xero_accounts.xero_class = 'ASSET'
    )
    const bank = [...parsed.values()].find(v => v.section === 'Bank')
    expect(bank!.account_type).toBe('asset')
  })

  it('catalog beats the section title, because titles are renameable', () => {
    const parsed = parseSingleMonthBSReport(
      fixture('jds-bs-2026-04-30.json'),
      () => 'liability', // catalog disagrees with the 'Current Assets' heading
    )
    const receivable = parsed.get('Accounts Receivable')
    expect(receivable?.account_type).toBe('liability')
  })
})

describe('rows that must NOT be swept in', () => {
  it('skips computed rows with no account id, like Net Assets', () => {
    const parsed = parseSingleMonthBSReport(fixture('jds-bs-2026-04-30.json'))
    expect(parsed.has('Net Assets')).toBe(false)
  })
})

describe('other tenants with a Bank section', () => {
  it.each(['envisage-bs-2026-04-30.json', 'iict-hk-bs-2026-03-31.json'])(
    '%s retains its bank rows',
    file => {
      const parsed = parseSingleMonthBSReport(fixture(file), () => 'asset')
      const banks = [...parsed.values()].filter(v => v.section === 'Bank')
      expect(banks.length).toBeGreaterThan(0)
      for (const b of banks) expect(b.account_type).toBe('asset')
    },
  )

  it('preserves a NEGATIVE bank balance — the overdrawn account that proved the cause', () => {
    // Envisage's MAIN A/C ANZ is -5,313.58. Its sign is what made the single
    // positive fleet imbalance line up with the single negative bank balance.
    const parsed = parseSingleMonthBSReport(fixture('envisage-bs-2026-04-30.json'), () => 'asset')
    const banks = [...parsed.values()].filter(v => v.section === 'Bank')
    expect(total(parsed, [...parsed.keys()].filter(k => parsed.get(k)!.section === 'Bank'))).toBeLessThan(0)
    expect(banks.some(b => b.value < 0)).toBe(true)
  })
})
