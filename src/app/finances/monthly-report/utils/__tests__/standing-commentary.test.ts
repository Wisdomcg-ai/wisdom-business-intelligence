/**
 * WD.3 — commentary house rules, pure halves.
 *
 *   - FX never fires a commentary trigger (house rule; IICT's currency
 *     gains/losses swing past $500 constantly and can't be "managed").
 *   - Standing-line gate: a refer_to pointing at a page not in the pack is
 *     flagged (in_pack:false), never dropped.
 */
import { describe, it, expect } from 'vitest'
import { isFxAccount, collectCommentaryTriggers } from '../commentary-triggers'
import { annotateStandingLines } from '../standing-commentary'
import type { GeneratedReport, ReportLine } from '../../types'

const line = (name: string, actual: number, budget: number): ReportLine => ({
  account_name: name,
  xero_account_name: name,
  is_budget_only: false,
  actual,
  budget,
  variance_amount: budget - actual,
  variance_percent: 0,
  ytd_actual: 0, ytd_budget: 0, ytd_variance_amount: 0, ytd_variance_percent: 0,
  unspent_budget: 0, budget_next_month: 0, budget_annual_total: 0, prior_year: null,
})

const reportWith = (sections: GeneratedReport['sections']): GeneratedReport =>
  ({ sections } as GeneratedReport)

describe('WD.3 — FX excluded from commentary triggers', () => {
  it('recognises the FX account family', () => {
    for (const name of [
      'Unrealised Currency Gains', 'Realised Currency Gains', 'Currency Loss',
      'Foreign Exchange Gain/Loss', 'FX Gain', 'Unrealized Gain on Exchange',
    ]) {
      expect(isFxAccount(name), name).toBe(true)
    }
    for (const name of ['Rent', 'Bank Fees', 'Gain on Sale of Asset', 'Exchange Street Rent']) {
      expect(isFxAccount(name), name).toBe(false)
    }
  })

  it('a $9,000 FX swing fires NO trigger; the rent line beside it still does', () => {
    const triggers = collectCommentaryTriggers(reportWith([
      {
        category: 'Other Expenses',
        lines: [
          line('Unrealised Currency Gains', 9_000, 0), // over budget by 9k — but FX
          line('Rent', 5_000, 4_000),                  // over budget by 1k — fires
        ],
        subtotal: line('Total Other Expenses', 14_000, 4_000),
      },
    ]))
    const names = triggers.expense_lines.map((l) => l.account_name)
    expect(names).toContain('Rent')
    expect(names).not.toContain('Unrealised Currency Gains')
  })

  it('FX in Other Income (multi-currency clients) is also excluded', () => {
    const triggers = collectCommentaryTriggers(reportWith([
      {
        category: 'Other Income',
        lines: [line('Realised Currency Gains', 0, 5_000)], // $5k "shortfall" — but FX
        subtotal: line('Total Other Income', 0, 5_000),
      },
    ]))
    expect(triggers.revenue_lines).toHaveLength(0)
  })
})

describe('WD.3 — standing-line gate', () => {
  const pack = ['Cover', 'Executive Summary', 'Budget vs Actual', 'Wages Analysis', 'Cashflow Forecast']

  it('a line pointing at a pack page is in_pack', () => {
    const [wages] = annotateStandingLines([{ label: 'Wages', refer_to: 'Wages Analysis' }], pack)
    expect(wages.in_pack).toBe(true)
  })

  it('partial matches work both directions', () => {
    const [a] = annotateStandingLines([{ label: 'Cash', refer_to: 'Cashflow' }], pack)
    expect(a.in_pack).toBe(true)
    const [b] = annotateStandingLines([{ label: 'X', refer_to: 'Budget vs Actual statement' }], pack)
    expect(b.in_pack).toBe(true)
  })

  it('a dangling reference is FLAGGED, not dropped', () => {
    const lines = annotateStandingLines(
      [{ label: 'Subscriptions', refer_to: 'Subscription Analysis' }],
      pack, // pack has no subscriptions page
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].in_pack).toBe(false)
  })

  it('empty labels are dropped; empty refer_to is never a match', () => {
    const lines = annotateStandingLines(
      [
        { label: '   ', refer_to: 'Wages Analysis' },
        { label: 'Note', refer_to: '' },
      ],
      pack,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].label).toBe('Note')
    expect(lines[0].in_pack).toBe(false)
  })
})
