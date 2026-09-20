/**
 * The external-data page's series, trend and row order, set through the real
 * layout editor — IICT's HubSpot pages (Calxa p3 and p4) built from the palette
 * rather than written into pdf_layout by hand.
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
      orientation: 'portrait',
      widgets: [{ id: 'w-1', type: 'external_metric', col: 0, row: 0, colSpan: 2, rowSpan: 3, ...widget }],
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
      businessId="fbc6dffd-677d-47ec-8277-7157982938e7"
      availableData={{ report: true, fullYear: true, cashflow: true, subscriptions: true, wages: true }}
    />,
  )
  return { onSave }
}

const savedWidget = (onSave: ReturnType<typeof renderEditor>['onSave']) =>
  (onSave.mock.calls.at(-1)![0] as PDFLayout).pages[0].widgets[0]

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Page settings' }))
  return screen.getByRole('dialog', { name: 'External data page settings' })
}

describe("IICT's HubSpot trend", () => {
  it('sets the series, eight months newest first, the rows and their subtotal', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith())
    expect(screen.getByText('Every series')).toBeInTheDocument()

    const dialog = await openPanel(user)
    await user.type(within(dialog).getByLabelText('Series key'), 'hubspot_memberships')
    await user.click(within(dialog).getByRole('radio', { name: /A trend, newest month on the left/ }))
    const months = within(dialog).getByLabelText('Months shown')
    await user.clear(months)
    await user.type(months, '8')

    await user.click(within(dialog).getByRole('button', { name: 'Add a row' }))
    await user.type(within(dialog).getByLabelText('Row name 1'), 'New Members / Subscribe (AU & NZ)')
    await user.click(within(dialog).getByRole('button', { name: 'Add a row' }))
    await user.type(within(dialog).getByLabelText('Row name 2'), 'New Members / Subscribe (Outside AU & NZ)')
    await user.click(within(dialog).getByRole('button', { name: 'Add a subtotal' }))
    await user.type(within(dialog).getByLabelText('Row name 3'), 'Total New Members')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Total New Members adds New Members / Subscribe (AU & NZ)' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Total New Members adds New Members / Subscribe (Outside AU & NZ)' }))
    await user.type(within(dialog).getByLabelText('Notes'), 'HubSpot dollars do not tie to Xero Membership income yet.')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))

    expect(screen.getByText('hubspot_memberships · 8 months, newest first · 3 rows')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({
      series_key: 'hubspot_memberships',
      layout: 'trend',
      months: 8,
      rows: [
        { dimension: 'New Members / Subscribe (AU & NZ)' },
        { dimension: 'New Members / Subscribe (Outside AU & NZ)' },
        { subtotal: 'Total New Members', of: ['New Members / Subscribe (AU & NZ)', 'New Members / Subscribe (Outside AU & NZ)'] },
      ],
      notes: ['HubSpot dollars do not tie to Xero Membership income yet.'],
    })
  })

  it('a worked-out measure and the line that prints it under the dollars', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith({
      config: { series_key: 'hubspot_memberships', rows: [{ dimension: 'Upgrade Members' }] },
    }))
    const dialog = await openPanel(user)
    await user.click(within(dialog).getByRole('button', { name: 'Add a worked-out measure' }))
    await user.type(within(dialog).getByLabelText('Measure key 1'), 'avg_rate')
    await user.type(within(dialog).getByLabelText('Measure label 1'), 'Avg. Membership Rate')
    await user.type(within(dialog).getByLabelText('Left measure 1'), 'revenue')
    await user.type(within(dialog).getByLabelText('Right measure 1'), 'members')
    await user.click(within(dialog).getByRole('button', { name: 'Add a single figure' }))
    await user.type(within(dialog).getByLabelText('Row name 2'), 'Avg. Membership Rate')
    await user.selectOptions(within(dialog).getByLabelText('Reads row 2'), 'Upgrade Members')
    await user.type(within(dialog).getByLabelText('Prints measure 2'), 'avg_rate')
    await user.type(within(dialog).getByLabelText('Prints under 2'), 'revenue')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({
      series_key: 'hubspot_memberships',
      derived_measures: [{ key: 'avg_rate', label: 'Avg. Membership Rate', format: 'number', op: 'divide', left: 'revenue', right: 'members' }],
      rows: [
        { dimension: 'Upgrade Members' },
        { line: 'Avg. Membership Rate', row: 'Upgrade Members', measure: 'avg_rate', under: 'revenue' },
      ],
    })
  })

  it('a subtotal can only add the rows above it', async () => {
    const user = userEvent.setup()
    renderEditor(layoutWith({ config: { rows: [{ subtotal: 'Total', of: ['A'] }, { dimension: 'A' }] } }))
    // A layout written by hand that the page would refuse says so on the canvas.
    expect(screen.getByText('Settings need attention')).toBeInTheDocument()
    const dialog = await openPanel(user)
    // The panel opens on the defaults, and says so rather than showing a page
    // the PDF would refuse as if it were fine.
    expect(within(dialog).getByText(/could not be read/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Add a subtotal' }))
    expect(within(dialog).getByText(/Nothing above this row to add yet/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Add a row' }))
    await user.type(within(dialog).getByLabelText('Row name 2'), 'Upgrade Members')
    // A row below it is still not something the subtotal can add.
    expect(within(dialog).queryByRole('checkbox', { name: /adds Upgrade Members/ })).toBeNull()
  })

  it('settings the page would refuse cannot be applied, and say why', async () => {
    const user = userEvent.setup()
    renderEditor(layoutWith())
    const dialog = await openPanel(user)
    await user.click(within(dialog).getByRole('button', { name: 'Add a subtotal' }))
    await user.type(within(dialog).getByLabelText('Row name 1'), 'Total')
    expect(within(dialog).getByText(/would refuse these settings/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('a placement left as it was stores nothing', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith())
    const dialog = await openPanel(user)
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({})
  })
})
