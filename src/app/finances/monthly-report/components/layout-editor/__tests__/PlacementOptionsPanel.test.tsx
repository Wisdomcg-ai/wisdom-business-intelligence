/**
 * The cover, summary and money-flow options, driven through the real layout
 * editor: the button on the placed page, the real reducer and the editor's own
 * Save Layout — so what Apply stores is proven by what onSave receives.
 *
 *   - Distinct Directions' cover: the Xero badge sentence
 *   - IICT's summary: net profit margin only; DD's: no margins
 *   - DD's money flow: only the bank accounts that moved, with the stored
 *     last line kept
 *   - a choice left at its default stores nothing; Apply with no change
 *     leaves the layout unchanged and not marked unsaved
 *   - hand-typed keys are kept unless the coach removes them
 *   - Escape closes the panel only
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PDFLayoutEditorModal from '../PDFLayoutEditorModal'
import type { LayoutWidget, PDFLayout, WidgetType } from '../../../types/pdf-layout'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function layoutWith(type: WidgetType, widget: Partial<LayoutWidget> = {}): PDFLayout {
  const landscape = type === 'executive_summary'
  return {
    version: 1,
    pages: [
      {
        id: 'page-1',
        orientation: landscape ? 'landscape' : 'portrait',
        widgets: [{ id: 'w-1', type, col: 0, row: 0, colSpan: landscape ? 3 : 2, rowSpan: 3, ...widget }],
      },
    ],
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

describe("Distinct Directions' cover", () => {
  it('opens from a labelled button, and saves the badge sentence', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith('cover_page'))
    expect(screen.getByText('Standard')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Page options' }))

    const dialog = screen.getByRole('dialog', { name: 'Cover page options' })
    // Today's line is what is chosen until someone chooses otherwise.
    expect(within(dialog).getByRole('radio', { name: /The report’s own line/ })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: /Counted from the Xero badge/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Reconciliation from the Xero badge')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    const w = savedWidget(onSave)
    expect(w.config).toEqual({ reconciliation_line: 'xero_badge' })
    expect(w).toMatchObject({ id: 'w-1', type: 'cover_page', col: 0, row: 0, colSpan: 2, rowSpan: 3 })
  })

  it('choosing the default again stores no key', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith('cover_page', { config: { reconciliation_line: 'xero_badge' } }))
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    await user.click(screen.getByRole('radio', { name: /The report’s own line/ }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({})
  })
})

describe('the summary’s margins', () => {
  it("IICT: net profit margin only", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith('executive_summary'))
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    const dialog = screen.getByRole('dialog', { name: 'Summary page options' })
    expect(within(dialog).getByRole('radio', { name: /Gross Profit Margin and Net Profit Margin/ })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: /Net Profit Margin only/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(screen.getByText('Net margin only')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({ margins: 'net_only' })
  })

  it("DD: none — and a stored title override rides through", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith('executive_summary', { titleOverride: 'P&L Summary' }))
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    await user.click(screen.getByRole('radio', { name: /Leave Additional Information off/ }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave)).toMatchObject({ config: { margins: 'none' }, titleOverride: 'P&L Summary' })
  })
})

describe('Where Did Our Money Go', () => {
  it("DD: only the bank accounts that moved, keeping the stored 'surplus' last line", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith('money_flow', { config: { last_line: 'surplus' } }))
    expect(screen.getByText('Last line repeats the surplus')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    const dialog = screen.getByRole('dialog', { name: 'Where Did Our Money Go options' })
    expect(within(dialog).getByRole('radio', { name: /Repeats the Surplus/ })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: /Only the accounts that moved/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({ last_line: 'surplus', bank_rows: 'moved' })
  })

  it('a hand-typed key is named and kept, unless the coach removes it', async () => {
    const user = userEvent.setup()
    const first = renderEditor(layoutWith('money_flow', { config: { lastLine: 'surplus' } }))
    expect(screen.getByText('Settings need attention')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    expect(screen.getByText(/settings made by hand that this panel does not show: lastLine/)).toBeInTheDocument()
    expect(screen.getByText(/prints a configuration error until they are removed/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Only the accounts that moved/ }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(first.onSave).config).toEqual({ lastLine: 'surplus', bank_rows: 'moved' })
  })

  it('…and removed when asked', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith('money_flow', { config: { lastLine: 'surplus', last_line: 'Surplus' } }))
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    expect(screen.getByText(/last_line held a value this page does not offer/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Remove them when I apply' }))
    await user.click(screen.getByRole('radio', { name: /Repeats the Surplus/ }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toEqual({ last_line: 'surplus' })
  })
})

describe('the editor around the panel', () => {
  it('Apply with nothing changed leaves the layout unchanged and not unsaved', async () => {
    const user = userEvent.setup()
    renderEditor(layoutWith('cover_page'))
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // The toolbar's undo has nothing to undo.
    expect(screen.getByTitle(/Undo/)).toBeDisabled()
  })

  it('Escape closes the panel, not the editor, and the placement survives a Backspace after', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith('executive_summary'))
    await user.click(screen.getByRole('button', { name: 'Page options' }))
    await user.click(screen.getByRole('radio', { name: /Net Profit Margin only/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.keyboard('{Backspace}')
    expect(screen.getByText('Standard')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(onSave).not.toHaveBeenCalled()
  })
})
