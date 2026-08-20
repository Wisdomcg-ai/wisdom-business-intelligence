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
  it.each(['Net ATO Balance', 'Provision for Income Tax', "Director's Loan"])(
    '%s maps to null — genuinely ambiguous, the class decides',
    section => expect(mapBSSectionToType(section)).toBeNull(),
  )

  // DELIBERATE change (21 Aug 2026, bs_equation cluster): Bank and Credit
  // Cards sections carry a KNOWN sign convention, so they map — that is what
  // lets the polarity override flip a card the catalog classes ASSET but the
  // report prints as amount-owed under a liabilities-convention section.
  it('Bank maps to asset (exact match — "Bank Loans" must not)', () => {
    expect(mapBSSectionToType('Bank')).toBe('asset')
    expect(mapBSSectionToType('Bank Loans')).toBeNull()
  })
  it('Credit Cards maps to liability', () => {
    expect(mapBSSectionToType('Credit Cards')).toBe('liability')
  })

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

  it('classifies Bank as asset even WITHOUT a catalog — the section carries polarity', () => {
    const parsed = parseSingleMonthBSReport(fixture('jds-bs-2026-04-30.json'))
    const bank = [...parsed.entries()].find(([, v]) => v.section === 'Bank')
    expect(bank).toBeDefined()
    // Since the 21 Aug polarity change 'Bank' maps to asset directly — the
    // row is classified rather than merely retained.
    expect(bank![1].account_type).toBe('asset')
  })

  it('classifies Bank as an asset once the catalog is supplied', () => {
    const parsed = parseSingleMonthBSReport(
      fixture('jds-bs-2026-04-30.json'),
      () => 'asset', // stand-in for xero_accounts.xero_class = 'ASSET'
    )
    const bank = [...parsed.values()].find(v => v.section === 'Bank')
    expect(bank!.account_type).toBe('asset')
  })

  // DELIBERATE inversion of the earlier 'catalog beats the section title'
  // test (21 Aug 2026, bs_equation cluster). Xero prints report values
  // SECTION-RELATIVE: a credit card owing $69,015.86 sits under Current
  // Liabilities as +69,015.86 while its catalog class stays ASSET. Booking
  // that value by class overstated assets AND understated liabilities —
  // an imbalance of exactly 2× every such row, proven to the cent on 7
  // tenants (Urban Road: 138,001.67 = 2×(69,015.86 − 15.02)). When class
  // and section polarity disagree, the SECTION wins, because the printed
  // value carries the section's sign convention. The class still rules
  // wherever the section maps to null — the actual point of #373.
  it('section beats the catalog when their polarity disagrees — the value is printed in section convention', () => {
    const parsed = parseSingleMonthBSReport(
      fixture('jds-bs-2026-04-30.json'),
      () => 'liability', // catalog disagrees with the 'Current Assets' heading
    )
    const receivable = parsed.get('Accounts Receivable')
    expect(receivable?.account_type).toBe('asset')
  })

  it('the production case: an ASSET-class credit card under Current Liabilities books as a liability', () => {
    // "Mastercard Aeris" sits under Current Liabilities in this real report,
    // but Xero's account catalog classes BANK/CREDITCARD accounts as ASSET.
    // Booking its printed (amount-owed) value as an asset was the bs_equation
    // bug: imbalance = exactly 2× every such row across 7 tenants.
    const mastercardId = 'df7e5fda-6c21-44e3-ba48-6ab077831a71'
    const parsed = parseSingleMonthBSReport(
      fixture('jds-bs-2026-04-30.json'),
      id => (id === mastercardId ? 'asset' : null),
    )
    expect(parsed.get('Mastercard Aeris')?.account_type).toBe('liability')
  })

  // Where the section maps to null (ambiguous titles like "Director's Loan"),
  // the catalog still decides — that contract is pinned by the mapper it.each
  // above plus the with-catalog classification tests; no fixture here carries
  // an ambiguous section, so there is no parser-level case to assert.
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
