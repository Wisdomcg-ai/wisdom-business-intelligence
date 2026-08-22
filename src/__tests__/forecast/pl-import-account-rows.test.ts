import { describe, it, expect } from 'vitest'
import { parsePLFile } from '@/app/finances/forecast/components/wizard-v4/utils/parsePLFile'

/**
 * 21 Aug 2026 forecast validity audit, finding COA-05.
 *
 * Section detection ran on every row BEFORE the amounts were read, so any
 * ACCOUNT whose name contained 'revenue', 'income', 'cost of', 'operating',
 * 'expense' or 'total' was consumed as a section header and silently dropped.
 * Australian charts are full of exactly those names — "Interest Income",
 * "Rental Income", "Motor Vehicle Expenses" — and this is the wizard's only
 * ingestion path for businesses that aren't on Xero, so an imported P&L
 * understated income and cost with no warning.
 *
 * The rule now: a row is a header only when it carries NO amount.
 */

const CSV = [
  'Account,Total',
  'Revenue,',                    // genuine header — empty
  'Sales,1000000',
  'Interest Income,12000',       // ACCOUNT that looks like a header
  'Cost of Sales,',              // genuine header
  'Materials,400000',
  'Operating Expenses,',         // genuine header
  'Motor Vehicle Expenses,48000',// ACCOUNT
  'Entertainment Expenses,6000', // ACCOUNT
  'Total Expenses,54000',        // summary row — must stay excluded
].join('\n')

async function parse() {
  const file = new File([CSV], 'pl.csv', { type: 'text/csv' })
  const result = await parsePLFile(file)
  expect(result.success).toBe(true)
  return result.data!
}

describe('P&L import keeps accounts whose names contain section words', () => {
  it('keeps "Interest Income" instead of eating it as a section header', async () => {
    const data = await parse()
    expect(data.revenue.byLine.map(l => l.name)).toContain('Interest Income')
  })

  it('keeps expense accounts whose names contain "Expenses"', async () => {
    const data = await parse()
    const names = data.opex.byLine.map(l => l.name)
    expect(names).toContain('Motor Vehicle Expenses')
    expect(names).toContain('Entertainment Expenses')
  })

  it('still excludes summary rows so nothing double-counts', async () => {
    const data = await parse()
    const allNames = [
      ...data.revenue.byLine.map(l => l.name),
      ...data.cogs.byLine.map(l => l.name),
      ...data.opex.byLine.map(l => l.name),
    ]
    expect(allNames).not.toContain('Total Expenses')
  })

  it('still honours genuine (amount-less) section headers', async () => {
    const data = await parse()
    expect(data.revenue.byLine.map(l => l.name)).toContain('Sales')
    expect(data.cogs.byLine.map(l => l.name)).toContain('Materials')
    expect(data.revenue.byLine.map(l => l.name)).not.toContain('Materials')
  })

  it('totals now include the previously dropped accounts', async () => {
    const data = await parse()
    expect(data.revenue.total).toBe(1_012_000) // was 1,000,000
    expect(data.opex.total).toBe(54_000)       // was 0
  })
})
