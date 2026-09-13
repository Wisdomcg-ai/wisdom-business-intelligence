/**
 * Statement order: Xero account code as TEXT, codeless lines A-Z after.
 *
 * Every expected order below is read off the reference pack, not derived from
 * the implementation — the point of the module is to reproduce that pack, and
 * a test that re-states the comparator would pass whatever it did.
 */
import { describe, it, expect } from 'vitest'
import {
  compareStatementLines,
  realStatementCodes,
  statementAccountCode,
  type StatementOrderable,
} from '../statement-order'

/** Deterministic shuffle, so a failure reproduces. */
function shuffled<T>(items: T[], seed = 7): T[] {
  const out = [...items]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const sortedCodes = (lines: StatementOrderable[]) =>
  [...lines].sort(compareStatementLines).map((l) => l.account_code)

describe('compareStatementLines — the reference pack order', () => {
  it('reproduces Urban Road\'s income order from a shuffled list', () => {
    const reference = ['200', '41000', '41130', '41140', '41150', '41200', '41300', '41600', '41700', '41750', '42010', '43000', '44000', '44250', '48000']
    // Named so that A-Z by name would give a DIFFERENT order — otherwise the
    // test could pass on the old sort.
    const lines = reference.map((code, i) => ({ account_code: code, account_name: `Income ${String.fromCharCode(90 - i)}` }))
    const input = shuffled(lines)
    expect(input.map((l) => l.account_code)).not.toEqual(reference)
    expect(sortedCodes(input)).toEqual(reference)
    expect([...lines].sort((a, b) => a.account_name.localeCompare(b.account_name)).map((l) => l.account_code)).not.toEqual(reference)
  })

  it('reproduces Urban Road\'s cost of sales order, including the dotted 51400.2', () => {
    const reference = ['51100', '51150', '51210', '51216', '51220', '51300', '51400.2', '51500', '51550', '51601', '51700', '52700', '53000', '55000']
    const lines = reference.map((code) => ({ account_code: code, account_name: `COS ${code}` }))
    expect(sortedCodes(shuffled(lines, 11))).toEqual(reference)
  })

  it('compares codes as TEXT: Stripe Fees 100000 before Bank Revaluations 497 before Bank Fees 60550', () => {
    const lines = [
      { account_code: '60550', account_name: 'Bank Fees' },
      { account_code: '497', account_name: 'Bank Revaluations' },
      { account_code: '100000', account_name: 'Stripe Fees' },
    ]
    expect([...lines].sort(compareStatementLines).map((l) => l.account_name)).toEqual([
      'Stripe Fees',
      'Bank Revaluations',
      'Bank Fees',
    ])
  })

  it('compares codes as TEXT: Net Wage Payable 804 and Rounding 860 after 23005', () => {
    const lines = [
      { account_code: '860', account_name: 'Rounding' },
      { account_code: '804', account_name: 'Net Wage Payable' },
      { account_code: '23005', account_name: 'Loan' },
    ]
    expect(sortedCodes(lines)).toEqual(['23005', '804', '860'])
  })

  it('puts codeless lines after every coded one, A-Z by name', () => {
    const lines = [
      { account_code: null, account_name: 'Zebra' },
      { account_code: '60550', account_name: 'Bank Fees' },
      { account_name: 'Apple' },
      { account_code: '', account_name: 'Mango' },
      { account_code: '100000', account_name: 'Stripe Fees' },
    ]
    expect([...lines].sort(compareStatementLines).map((l) => l.account_name)).toEqual([
      'Stripe Fees',
      'Bank Fees',
      'Apple',
      'Mango',
      'Zebra',
    ])
  })

  it('breaks a tie on the code by name', () => {
    const lines = [
      { account_code: '41000', account_name: 'Sales — Wholesale' },
      { account_code: '41000', account_name: 'Sales — Retail' },
    ]
    expect([...lines].sort(compareStatementLines).map((l) => l.account_name)).toEqual([
      'Sales — Retail',
      'Sales — Wholesale',
    ])
  })
})

describe('statementAccountCode — only a real Xero code orders a line', () => {
  // This business's actuals and mappings. Urban Road's FX account really is
  // posted with a blank code and carries 62700 only on its mapping.
  const real = realStatementCodes(['41000', '60550', null, '', '62700', '51400.2'])

  it('takes the actuals row\'s own code first — the fact', () => {
    expect(statementAccountCode(['60550', '41000'], real)).toBe('60550')
  })

  it('falls back to the mapping\'s code when the row has none', () => {
    expect(statementAccountCode([null, '62700'], real)).toBe('62700')
    expect(statementAccountCode(['  ', '62700'], real)).toBe('62700')
  })

  it.each(['opex-28', 'SYS-TEAM-WAGES', 'ACCT-MISSING-abc', '1779341224375-5rkezjw0y'])(
    'treats the wizard code %s as no code at all',
    (wizardCode) => {
      expect(statementAccountCode([wizardCode], real)).toBeNull()
      expect(statementAccountCode([wizardCode, undefined], real)).toBeNull()
    },
  )

  it('lets the mapping supply a real code where the forecast line carries a wizard one', () => {
    // Urban Road: forecast 'opex-28' on Foreign Currency Gains and Losses,
    // mapping 62700.
    expect(statementAccountCode(['opex-28', '62700'], real)).toBe('62700')
  })

  it('does not accept a numeric-looking code this business never uses', () => {
    // A pattern test would let this through; the set does not.
    expect(statementAccountCode(['99999'], real)).toBeNull()
  })

  it('returns the code as Xero spells it', () => {
    const lettered = realStatementCodes(['SALES1'])
    expect(statementAccountCode([' sales1 '], lettered)).toBe('SALES1')
  })

  it('a forecast-only line with a wizard code sorts with the codeless tail', () => {
    const lines = [
      { account_name: 'Foreign Currency Loss/Gain', account_code: statementAccountCode(['opex-28'], real) },
      { account_name: 'Wages', account_code: statementAccountCode(['SYS-TEAM-WAGES'], real) },
      { account_name: 'Bank Fees', account_code: statementAccountCode(['60550'], real) },
    ]
    expect([...lines].sort(compareStatementLines).map((l) => l.account_name)).toEqual([
      'Bank Fees',
      'Foreign Currency Loss/Gain',
      'Wages',
    ])
  })
})
