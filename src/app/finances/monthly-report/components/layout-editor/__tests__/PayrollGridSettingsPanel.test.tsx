/**
 * The Payroll Report's roster and budget basis, set through the real layout
 * editor: the button on the placed page, the real reducer and the editor's own
 * Save Layout — so what Apply stores is proven by what onSave receives.
 *
 * Until this panel existed a 35-line roster could only be written into
 * pdf_layout by hand (setup-dd.sql A06).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PDFLayoutEditorModal from '../PDFLayoutEditorModal'
import type { LayoutWidget, PDFLayout } from '../../../types/pdf-layout'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

function layoutWith(widget: Partial<LayoutWidget> = {}): PDFLayout {
  return {
    version: 1,
    pages: [{
      id: 'page-1',
      orientation: 'landscape',
      widgets: [{ id: 'w-1', type: 'payroll_grid', col: 0, row: 0, colSpan: 3, rowSpan: 3, ...widget }],
    }],
  }
}

function renderEditor(layout: PDFLayout) {
  const onSave = vi.fn(async (_layout: PDFLayout) => true)
  render(
    <PDFLayoutEditorModal
      isOpen
      onClose={vi.fn()}
      initialLayout={layout}
      onSave={onSave}
      isSaving={false}
      businessId="c6c741db-6c09-45be-974c-5e6ca2cadf84"
      availableData={{ report: true, fullYear: true, cashflow: true, subscriptions: true, wages: true }}
    />,
  )
  return { onSave }
}

const savedWidget = (onSave: ReturnType<typeof renderEditor>['onSave']) =>
  (onSave.mock.calls.at(-1)![0] as PDFLayout).pages[0].widgets[0]

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Page settings' }))
  return screen.getByRole('dialog', { name: 'Payroll page settings' })
}

describe("Distinct Directions' payrun pages", () => {
  it('sets the Calxa layout, one month, the roster basis, the month columns and the shaded pays', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith())
    expect(screen.getByText('Payroll grid · 2 months')).toBeInTheDocument()

    const dialog = await openPanel(user)
    await user.click(within(dialog).getByRole('radio', { name: /The Payroll Report/ }))
    const months = within(dialog).getByLabelText('Months shown')
    await user.clear(months)
    await user.type(months, '1')
    await user.click(within(dialog).getByRole('radio', { name: /The roster — each salary/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Month actual, Month budget and Variance/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Shade each pay/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /A Standard Units column/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Fill the Difference cells/ }))

    await user.click(within(dialog).getByRole('button', { name: 'Add an employee' }))
    await user.type(within(dialog).getByLabelText('Employee 1'), 'Daniel Jarvis')
    await user.type(within(dialog).getByLabelText('Area 1'), 'Head Office')
    await user.type(within(dialog).getByLabelText('Weekly salary 1'), '3185')
    await user.click(within(dialog).getByRole('button', { name: 'Add an employee' }))
    await user.type(within(dialog).getByLabelText('Employee 2'), 'James Baker')
    await user.type(within(dialog).getByLabelText('Area 2'), 'Bathurst')
    await user.type(within(dialog).getByLabelText('Weekly salary 2'), '2314')
    await user.type(within(dialog).getByLabelText('Notes'), 'Adam Davey was paid 222 hours of annual leave.')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Payroll Report · 1 month · 2 on the roster · 2 areas · roster budget')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({
      layout: 'calxa',
      months: 1,
      difference_fills: true,
      budget_basis: 'roster',
      employee_month_columns: true,
      pay_fills: true,
      standard_units_column: false,
      notes: ['Adam Davey was paid 222 hours of annual leave.'],
      roster: [
        { name: 'Daniel Jarvis', area: 'Head Office', weekly_salary: 3185 },
        { name: 'James Baker', area: 'Bathurst', weekly_salary: 2314 },
      ],
    })
  })

  it('a stored roster opens in the form, keeps its Xero links, and can be reordered', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith({
      config: {
        layout: 'calxa',
        roster: [
          { name: 'Daniel Jarvis', employee_id: '06fd2ce1', area: 'Head Office', weekly_salary: 3185 },
          { name: 'James Baker', employee_id: '84a87517', area: 'Bathurst', weekly_salary: 2314 },
        ],
      },
    }))
    const dialog = await openPanel(user)
    expect(within(dialog).getByLabelText('Employee 1')).toHaveValue('Daniel Jarvis')
    expect(within(dialog).getByLabelText('Weekly salary 2')).toHaveValue('2314')
    await user.click(within(dialog).getByRole('button', { name: 'Move up 2' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({
      layout: 'calxa',
      roster: [
        { name: 'James Baker', employee_id: '84a87517', area: 'Bathurst', weekly_salary: 2314 },
        { name: 'Daniel Jarvis', employee_id: '06fd2ce1', area: 'Head Office', weekly_salary: 3185 },
      ],
    })
  })

  it('switching the salary column to a fortnight converts the figures, and stores them per fortnight', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith({
      config: { layout: 'calxa', roster: [{ name: 'Jennifer Moore', weekly_salary: 1353.5 }] },
    }))
    const dialog = await openPanel(user)
    await user.click(within(dialog).getByRole('radio', { name: /Per fortnight/ }))
    expect(within(dialog).getByLabelText('Fortnightly salary 1')).toHaveValue('2707')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({
      layout: 'calxa',
      salary_period: 'fortnight',
      roster: [{ name: 'Jennifer Moore', fortnightly_salary: 2707 }],
    })
  })

  it('a choice left at the page’s own default stores nothing', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith())
    const dialog = await openPanel(user)
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({})
  })

  it('settings the page would refuse cannot be applied, and say why', async () => {
    const user = userEvent.setup()
    renderEditor(layoutWith())
    const dialog = await openPanel(user)
    const months = within(dialog).getByLabelText('Months shown')
    await user.clear(months)
    await user.type(months, '9')
    expect(within(dialog).getByText(/would refuse these settings/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('a config written by hand that the page cannot read is named, and replaced by what is applied', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith({ config: { layout: 'calxa', rooster: [] } }))
    expect(screen.getByText('Settings need attention')).toBeInTheDocument()
    const dialog = await openPanel(user)
    expect(within(dialog).getByText(/could not be read/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: /The Payroll Report/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({ layout: 'calxa' })
  })

  it('Escape closes the panel and leaves the layout alone', async () => {
    const user = userEvent.setup()
    renderEditor(layoutWith())
    const dialog = await openPanel(user)
    await user.click(within(dialog).getByRole('radio', { name: /The Payroll Report/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Payroll grid · 2 months')).toBeInTheDocument()
  })
})
