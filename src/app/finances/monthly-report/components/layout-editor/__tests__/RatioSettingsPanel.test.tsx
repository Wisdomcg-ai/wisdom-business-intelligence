/**
 * The Ratio page settings panel, driven through the real layout editor: the
 * button on the placed widget, the real reducer, and the editor's own Save
 * Layout — so "Apply" is proven by what onSave receives, not by the panel's
 * say-so.
 *
 *   - a placed ratio page opens its settings from a LABELLED button
 *   - Apply is disabled while parseRatioAnalysisConfig refuses the form
 *   - an account list that cannot load says so, and totals still apply
 *   - Urban Road's stored config survives open → Apply → Save unchanged
 *   - a code missing from the ledger is shown as not found, and kept
 *   - typing in the panel cannot delete the widget; Escape closes only the panel
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PDFLayoutEditorModal from '../PDFLayoutEditorModal'
import type { LayoutWidget, PDFLayout } from '../../../types/pdf-layout'
import {
  URBAN_ROAD_ACCOUNTS,
  URBAN_ROAD_CONFIG,
  URBAN_ROAD_TITLE,
} from '@/lib/monthly-report/__tests__/ratio-config-fixture'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function layoutWith(widget: Partial<LayoutWidget>): PDFLayout {
  return {
    version: 1,
    pages: [
      {
        id: 'page-1',
        orientation: 'portrait',
        widgets: [{ id: 'ratio-1', type: 'ratio_analysis', col: 0, row: 0, colSpan: 2, rowSpan: 2, ...widget }],
      },
    ],
  }
}

function accountsOk() {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ accounts: URBAN_ROAD_ACCOUNTS, codeless_count: 1 }) })
}

function renderEditor(layout: PDFLayout) {
  const onSave = vi.fn(async (_layout: PDFLayout) => true)
  const onClose = vi.fn()
  render(
    <PDFLayoutEditorModal
      isOpen
      onClose={onClose}
      initialLayout={layout}
      onSave={onSave}
      isSaving={false}
      businessId="28d41193-38ae-4071-a2b1-0dbea90a38fd"
      availableData={{ report: true, fullYear: true, cashflow: true, subscriptions: true, wages: true }}
    />,
  )
  return { onSave, onClose }
}

const savedWidget = (onSave: ReturnType<typeof renderEditor>['onSave']) =>
  (onSave.mock.calls.at(-1)![0] as PDFLayout).pages[0].widgets[0]

describe('opening the panel', () => {
  it('an unconfigured placement says so, and its labelled button opens the settings', async () => {
    accountsOk()
    const user = userEvent.setup()
    renderEditor(layoutWith({}))
    expect(screen.getByText('Not set up yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Set up ratios' }))
    expect(screen.getByRole('dialog', { name: 'Ratio page settings' })).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monthly-report/account-actuals?business_id=28d41193-38ae-4071-a2b1-0dbea90a38fd&list=1',
    )
  })

  it('Apply is disabled while the page’s own rule refuses the form, with the reason in words', async () => {
    accountsOk()
    const user = userEvent.setup()
    renderEditor(layoutWith({}))
    await user.click(screen.getByRole('button', { name: 'Set up ratios' }))
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    // Within the dialog: dnd-kit keeps its own live region on the page.
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('Ratio 1 — name is blank')
  })
})

describe('the account list, fail-open', () => {
  it('a list that cannot load is stated — and a ratio of two totals still applies and saves', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith({}))
    await user.click(screen.getByRole('button', { name: 'Set up ratios' }))

    await waitFor(() => expect(screen.getByText(/The account list could not be loaded/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    // Never the empty state: "nothing synced" and "could not check" are different facts.
    expect(screen.queryByText(/No accounts with a code have synced/)).toBeNull()

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Ratio Analysis'), 'Margins')
    await user.type(within(dialog).getByPlaceholderText('e.g. Freight % of Income'), 'Gross margin')
    const top = within(dialog).getByRole('group', { name: 'What to measure (top line)' })
    await user.click(within(top).getByRole('radio', { name: 'A statement total' }))
    await user.selectOptions(within(top).getByRole('combobox'), 'gross_profit')

    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(apply).toBeEnabled()
    await user.click(apply)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Margins · 1 ratio')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const w = savedWidget(onSave)
    expect(w.titleOverride).toBe('Margins')
    expect(w.config).toEqual({
      months_shown: 3,
      trailing_averages: [6, 3],
      show_amounts: true,
      ratios: [{ label: 'Gross margin', numerator: { total: 'gross_profit' }, denominator: { total: 'income' } }],
    })
  })

  it('a refused business gets the refusal sentence, not an account list', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unavailable_reason: 'this business has 2 Xero organisations connected — account codes cannot be combined across organisations, so ratio analysis is not available for it yet' }),
    })
    const user = userEvent.setup()
    renderEditor(layoutWith({}))
    await user.click(screen.getByRole('button', { name: 'Set up ratios' }))
    await waitFor(() => expect(screen.getByText(/2 Xero organisations connected/)).toBeInTheDocument())
  })
})

describe('Urban Road', () => {
  it('open → Apply → Save Layout writes the stored config and title back unchanged', async () => {
    accountsOk()
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith({ config: URBAN_ROAD_CONFIG, titleOverride: URBAN_ROAD_TITLE }))
    expect(screen.getByText('COGS Tables · 2 ratios')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit ratios' }))

    await waitFor(() => expect(screen.getByText(/— Freight to Customer/)).toBeInTheDocument())
    expect(screen.getByText(/1 account has no code in Xero/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    const w = savedWidget(onSave)
    expect(JSON.stringify(w.config)).toBe(JSON.stringify(URBAN_ROAD_CONFIG))
    expect(w.titleOverride).toBe(URBAN_ROAD_TITLE)
    // Placement untouched.
    expect(w).toMatchObject({ id: 'ratio-1', col: 0, row: 0, colSpan: 2, rowSpan: 2 })
  })

  it('an account is picked by searching its name, shown as "code — name"', async () => {
    accountsOk()
    const user = userEvent.setup()
    const { onSave } = renderEditor(layoutWith({}))
    await user.click(screen.getByRole('button', { name: 'Set up ratios' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('e.g. Freight % of Income'), 'Freight % Income')

    const top = within(dialog).getByRole('group', { name: 'What to measure (top line)' })
    const search = await within(top).findByRole('textbox', { name: /search accounts/ })
    await user.type(search, 'freight')
    await user.click(within(top).getByRole('checkbox', { name: '55000 — Freight to Customer' }))
    expect(within(top).queryByRole('checkbox', { name: /Posters/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect(savedWidget(onSave).config).toMatchObject({
      ratios: [{ label: 'Freight % Income', numerator: { accounts: ['55000'] }, denominator: { total: 'income' } }],
    })
  })

  it('a code the ledger no longer has is shown as not found — and kept on Apply', async () => {
    accountsOk()
    const user = userEvent.setup()
    const config = {
      ...URBAN_ROAD_CONFIG,
      ratios: [{ ...URBAN_ROAD_CONFIG.ratios[0], numerator: { accounts: ['59999'] } }],
    }
    const { onSave } = renderEditor(layoutWith({ config }))
    await user.click(screen.getByRole('button', { name: 'Edit ratios' }))
    await waitFor(() => expect(screen.getByText(/not found in the chart of accounts/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Save Layout/ }))
    expect((savedWidget(onSave).config as typeof config).ratios[0].numerator.accounts).toEqual(['59999'])
  })
})

describe('the editor’s shortcuts while the panel is open', () => {
  it('Backspace in a panel field does not delete the widget; Escape closes the panel, not the editor', async () => {
    accountsOk()
    const user = userEvent.setup()
    const { onClose } = renderEditor(layoutWith({ config: URBAN_ROAD_CONFIG, titleOverride: URBAN_ROAD_TITLE }))
    // Select the widget first, so Delete/Backspace has a target to hit.
    await user.click(screen.getByText('COGS Tables · 2 ratios'))
    await user.click(screen.getByRole('button', { name: 'Edit ratios' }))

    const title = screen.getByPlaceholderText('Ratio Analysis')
    await user.click(title)
    await user.keyboard('{Backspace}{Backspace}')
    expect(title).toHaveValue('COGS Tabl')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    // Cancelled: the widget is still there, with its stored title.
    expect(screen.getByText('COGS Tables · 2 ratios')).toBeInTheDocument()
  })
})
