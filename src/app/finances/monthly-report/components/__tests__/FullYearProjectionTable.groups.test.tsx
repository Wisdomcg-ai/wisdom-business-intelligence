/**
 * The Full Year tab groups expenses the way the Actual vs Budget tab does, and
 * the way the pack's Full Year page now does — a tab that disagrees with the
 * PDF beneath it is the defect, not a cosmetic difference.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FullYearProjectionTable from '../FullYearProjectionTable'
import { fixtureFullYear } from '../../services/__tests__/pdf-pack-fixture'
import type { FullYearReport } from '../../types'

const ORDER = ['Employment Expense', 'Bank and Other Fees']

function report(grouped: boolean): FullYearReport {
  const fy = fixtureFullYear({ forecastMonthly: 90_000 })
  const opex = fy.sections.find((s) => s.category === 'Operating Expenses')!
  const t = opex.lines[0]
  opex.lines = [
    { ...t, account_name: 'Bank Fees', account_code: '60550', group: grouped ? 'Bank and Other Fees' : null },
    { ...t, account_name: 'Employ - Wages & Salaries', account_code: '62170', group: grouped ? 'Employment Expense' : null },
    { ...t, account_name: 'Bank Revaluations', account_code: '497', group: null },
  ]
  return fy
}

const rowTexts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent ?? '')

describe('FullYearProjectionTable — expense groups', () => {
  it('renders group headings and Total rows, in the coach order, ungrouped last', () => {
    const { container } = render(<FullYearProjectionTable report={report(true)} expenseGroupOrder={ORDER} />)
    expect(screen.getByText('Total Employment Expense')).toBeTruthy()
    expect(screen.getByText('Total Bank and Other Fees')).toBeTruthy()

    const rows = rowTexts(container)
    const at = (t: string) => rows.indexOf(t)
    expect(at('Employment Expense')).toBeGreaterThan(-1)
    expect(at('Employment Expense')).toBeLessThan(at('Employ - Wages & Salaries'))
    expect(at('Employ - Wages & Salaries')).toBeLessThan(at('Total Employment Expense'))
    expect(at('Total Employment Expense')).toBeLessThan(at('Bank and Other Fees'))
    expect(at('Bank and Other Fees')).toBeLessThan(at('Bank Fees'))
    expect(at('Total Bank and Other Fees')).toBeLessThan(at('Bank Revaluations'))
    expect(at('Bank Revaluations')).toBeLessThan(at('Total Operating Expenses'))
  })

  it('falls back to the payload heading order when no prop is given', () => {
    const fy = { ...report(true), expense_group_order: ORDER }
    const { container } = render(<FullYearProjectionTable report={fy} />)
    const rows = rowTexts(container)
    expect(rows.indexOf('Employment Expense')).toBeLessThan(rows.indexOf('Bank and Other Fees'))
  })

  it('renders no headings for a client that has grouped nothing', () => {
    const { container } = render(<FullYearProjectionTable report={report(false)} expenseGroupOrder={ORDER} />)
    expect(screen.queryByText('Total Employment Expense')).toBeNull()
    expect(screen.queryByText('Employment Expense')).toBeNull()
    expect(rowTexts(container)).toContain('Employ - Wages & Salaries')
  })
})
