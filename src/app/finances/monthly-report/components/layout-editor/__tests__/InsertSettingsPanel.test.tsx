/**
 * The Uploaded Page placement in the real layout editor: named through its
 * labelled button, saved with the name as its title, and placeable again from
 * the palette — a client with two inserts needs two.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PDFLayoutEditorModal from '../PDFLayoutEditorModal'
import WidgetPaletteSidebar from '../WidgetPaletteSidebar'
import { DndContext } from '@dnd-kit/core'
import type { PDFLayout } from '../../../types/pdf-layout'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const layout = (titleOverride?: string): PDFLayout => ({
  version: 1,
  pages: [{
    id: 'page-1',
    orientation: 'portrait',
    widgets: [{ id: 'insert-1', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3, ...(titleOverride ? { titleOverride } : {}) }],
  }],
})

function renderEditor(initial: PDFLayout) {
  const onSave = vi.fn(async (_layout: PDFLayout) => true)
  render(
    <PDFLayoutEditorModal
      isOpen
      onClose={vi.fn()}
      initialLayout={initial}
      onSave={onSave}
      isSaving={false}
      businessId="c6c741db-6c09-45be-974c-5e6ca2cadf84"
      availableData={{ report: true, fullYear: true, cashflow: true, subscriptions: true, wages: true }}
    />,
  )
  return { onSave }
}

describe('naming an uploaded page', () => {
  it('an unnamed placement says so; its button opens the name; Apply and Save keep it as the title', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layout())
    expect(screen.getByText('Not named yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Name this page' }))
    const dialog = screen.getByRole('dialog', { name: 'Uploaded page' })
    await user.type(within(dialog).getByPlaceholderText('e.g. Income Analysis'), '  Income Analysis ')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Income Analysis')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    const saved = (onSave.mock.calls.at(-1)![0] as PDFLayout).pages[0].widgets[0]
    expect(saved).toMatchObject({ id: 'insert-1', type: 'uploaded_insert', titleOverride: 'Income Analysis' })
  })

  it('clearing the name removes the title rather than saving a blank one', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(layout('Cash vs Accruals'))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const dialog = screen.getByRole('dialog', { name: 'Uploaded page' })
    await user.clear(within(dialog).getByPlaceholderText('e.g. Income Analysis'))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    const saved = (onSave.mock.calls.at(-1)![0] as PDFLayout).pages[0].widgets[0]
    expect('titleOverride' in saved).toBe(false)
  })
})

describe('the palette', () => {
  it('an uploaded page already placed can be placed again; a memo cannot', () => {
    render(
      <DndContext>
        <WidgetPaletteSidebar
          placedWidgetTypes={new Set(['uploaded_insert', 'memo'])}
          availableData={{ report: true, fullYear: true, cashflow: true, subscriptions: true, wages: true }}
        />
      </DndContext>,
    )
    const card = (label: string) => screen.getByText(label).closest('div[class*="rounded-md"]') as HTMLElement
    expect(within(card('Uploaded Page (PDF)')).queryByText('Placed')).toBeNull()
    expect(within(card('Memo')).getByText('Placed')).toBeInTheDocument()
  })
})
