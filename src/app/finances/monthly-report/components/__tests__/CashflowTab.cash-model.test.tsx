/**
 * The on-screen cashflow tab on cash model v2 prints the pack's rows. It used
 * the forecast wizard's table, which reads neither equity_lines nor
 * unreconciled_lines: in a month with a late credit ($853.80 between the P&L
 * and balance-sheet syncs) the coach saw rows that did not add to Net Movement
 * and nothing saying why, while the PDF said.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import CashflowTab from '../CashflowTab'
import { buildPackCashModel } from '@/lib/monthly-report/pack-cash-model'
import { buildPackCashflowRows } from '@/lib/monthly-report/pack-cashflow-rows'
import { urbanRoadFullYear, UR_EXPENSE_GROUP_ORDER } from '@/lib/monthly-report/__tests__/urban-road-full-year-fixture'
import { UR_ACCOUNTS, UR_BANK_IDS, UR_BS_ROWS, UR_CREDIT_CARD_IDS, UR_PAY_RUNS, UR_PL_ROWS } from '@/lib/monthly-report/__tests__/urban-road-ledger-fixture'
import { urbanRoadCashModel } from '@/lib/monthly-report/__tests__/urban-road-cash-model-config'

const late = UR_PL_ROWS.map((r) => r.account_name === 'Returns & Allowances'
  ? { ...r, monthly_values: { ...r.monthly_values, '2026-08': Number(r.monthly_values['2026-08']) - 853.8 } }
  : r)

function model() {
  const m = buildPackCashModel({
    fullYear: urbanRoadFullYear(),
    reportMonth: '2026-08',
    config: urbanRoadCashModel({ dso_days: 19, dpo_days: 29 }),
    inputs: { bsRows: UR_BS_ROWS, plRows: late, accounts: UR_ACCOUNTS, payRuns: UR_PAY_RUNS, bankAccountIds: UR_BANK_IDS, creditCardAccountIds: UR_CREDIT_CARD_IDS, fiscalYearStart: 7 },
  })
  if (m.status !== 'ready') throw new Error(m.reason)
  return m.cashflow
}

function row(container: HTMLElement, label: string): string[] | null {
  const tr = Array.from(container.querySelectorAll('tbody tr')).find((r) => r.querySelector('td')?.textContent === label)
  return tr ? Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? '') : null
}

describe('CashflowTab — cash model v2', () => {
  it('prints the sync-gap row, equity rows and Actual/Budget labels, as the pack does', () => {
    const cf = model()
    const { container } = render(<CashflowTab data={cf} isLoading={false} groupOrder={UR_EXPENSE_GROUP_ORDER} />)
    // Every row the PDF prints, in the PDF's order.
    const labels = Array.from(container.querySelectorAll('tbody tr')).map((r) => r.querySelector('td')?.textContent)
    expect(labels).toEqual(buildPackCashflowRows(cf, UR_EXPENSE_GROUP_ORDER).map((r) => r.label))
    expect(row(container, 'Difference between P&L and balance sheet syncs')).not.toBeNull()
    expect(row(container, 'Net Movement')![2]).toBe('(31,708)')
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent ?? '')
    expect(headers.filter((h) => h.includes('Actual'))).toHaveLength(2)
    expect(headers.filter((h) => h.includes('Budget'))).toHaveLength(10)
  })
})
