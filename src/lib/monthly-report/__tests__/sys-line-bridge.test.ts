/**
 * The accounts and codes are Urban Road's: the client whose Full Year page
 * printed wages, super and subscriptions twice each.
 */
import { describe, it, expect } from 'vitest'
import {
  sysCodeForXeroAccount,
  SYS_TEAM_WAGES, SYS_TEAM_SUPER, SYS_SUBSCRIPTIONS,
  type SysBridgeConfig,
} from '../sys-line-bridge'

const CONFIG: SysBridgeConfig = {
  wagesAccountNames: ['Employ - Wages & Salaries', 'Employ - Superannuation'],
  subscriptionAccountCodes: ['63700', '63706', '63710', '64610'],
}

describe('sysCodeForXeroAccount', () => {
  it('bridges the wages account to the engine line', () => {
    expect(sysCodeForXeroAccount(
      { account_code: '62170', account_name: 'Employ - Wages & Salaries' }, CONFIG,
    )).toBe(SYS_TEAM_WAGES)
  })

  it('sends super to its own line, not the wages one', () => {
    // Both are in the wages list — the coach configures it once for the Wages
    // page, which prints them as two rows. Both claiming SYS-TEAM-WAGES would
    // double-count $67,708 of super into the wages forecast.
    expect(sysCodeForXeroAccount(
      { account_code: '62160', account_name: 'Employ - Superannuation' }, CONFIG,
    )).toBe(SYS_TEAM_SUPER)
  })

  it('bridges a subscription account by CODE, since its name is client-specific', () => {
    expect(sysCodeForXeroAccount(
      { account_code: '63700', account_name: 'IT Costs Software' }, CONFIG,
    )).toBe(SYS_SUBSCRIPTIONS)
  })

  it('says nothing about an ordinary account', () => {
    expect(sysCodeForXeroAccount(
      { account_code: '61400', account_name: 'Contractors excl. Artists' }, CONFIG,
    )).toBeNull()
    expect(sysCodeForXeroAccount(
      { account_code: '55000', account_name: 'Freight to Customer' }, CONFIG,
    )).toBeNull()
  })

  it('does not claim an account that merely has "wages" in its name', () => {
    // "Manufacturing Wages" is a real Urban Road account with its own budget.
    // A fuzzy name match would hand it the team forecast; the list would not.
    expect(sysCodeForXeroAccount(
      { account_code: '51900', account_name: 'Manufacturing Wages' }, CONFIG,
    )).toBeNull()
  })

  it('matches names case- and whitespace-insensitively', () => {
    expect(sysCodeForXeroAccount(
      { account_code: '62170', account_name: '  employ - WAGES & salaries ' }, CONFIG,
    )).toBe(SYS_TEAM_WAGES)
  })

  it('says nothing when the client has configured nothing', () => {
    expect(sysCodeForXeroAccount(
      { account_code: '62170', account_name: 'Employ - Wages & Salaries' }, {},
    )).toBeNull()
    expect(sysCodeForXeroAccount(
      { account_code: '62170', account_name: 'Employ - Wages & Salaries' },
      { wagesAccountNames: null, subscriptionAccountCodes: null },
    )).toBeNull()
  })

  it('survives an account with no code or no name', () => {
    expect(sysCodeForXeroAccount({ account_code: null, account_name: null }, CONFIG)).toBeNull()
    expect(sysCodeForXeroAccount({ account_name: 'Employ - Wages & Salaries' }, CONFIG)).toBe(SYS_TEAM_WAGES)
  })
})
