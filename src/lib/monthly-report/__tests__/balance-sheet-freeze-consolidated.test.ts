/**
 * A consolidated balance sheet is frozen at Finalise, and kept by Approve &
 * Send, exactly as one organisation's is.
 *
 * It has to be: the mirror it is built from moves every six hours, so a
 * finalised August re-exported in October would otherwise print a different
 * August (the reason the freeze exists — balance-sheet-freeze.ts). Nothing in
 * the freeze had to change for that, because the consolidated sheet comes back
 * from the same endpoint in the same shape; what is locked here is that it
 * does, notes and warnings included, so nobody later "tidies" the freeze into
 * dropping them or skips a group's sheet for want of a live Xero report.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import dragon from './fixtures/dragon-bs-mirror-2026-08.json'
import { buildConsolidatedBalanceSheet } from '../consolidated-balance-sheet'
import type { BalanceSheetCompare, BalanceSheetData } from '@/app/finances/monthly-report/types'
import type { EliminationRule } from '@/lib/consolidation/types'

const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: (...a: unknown[]) => captureMessage(...a),
}))

import {
  balanceSheetsForExport,
  freezeBalanceSheetsAtFinalise,
  printedBalanceSheets,
  readFrozenBalanceSheets,
  sentBalanceSheetSources,
  FROZEN_BALANCE_SHEETS_KEY,
} from '../balance-sheet-freeze'

const BIZ = dragon.business_id
const LOAN: EliminationRule = {
  id: 'r1',
  business_id: BIZ,
  rule_type: 'intercompany_loan',
  tenant_a_id: '42735fc3-21f2-4668-9783-93ce0f66f481',
  entity_a_account_code: '700',
  entity_a_account_name_pattern: null,
  tenant_b_id: '3b67e5b6-780c-4158-831c-82293f34ca04',
  entity_b_account_code: '906',
  entity_b_account_name_pattern: null,
  direction: 'bidirectional',
  description: 'Dragon ↔ Easy Hail loan',
  active: true,
}

function consolidated(compare: BalanceSheetCompare): BalanceSheetData {
  const result = buildConsolidatedBalanceSheet({
    businessId: BIZ,
    month: '2026-08',
    compare,
    fiscalYearStart: 7,
    organisations: dragon.connections.map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency })),
    rows: dragon.rows,
    accounts: dragon.accounts,
    rates: [],
    rules: [LOAN],
  })
  if (!result.ok) throw new Error(result.reason)
  return result.data
}

const mom = consolidated('mom')
const yoy = consolidated('yoy')

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function fakeFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/Xero/balance-sheet')) {
      return json(new URLSearchParams(url.split('?')[1]).get('compare') === 'mom' ? mom : yoy)
    }
    if (url === '/api/monthly-report/snapshot' && init?.method === 'PATCH') return json({ success: true, updated: true })
    if (url.startsWith('/api/monthly-report/snapshot')) return json({ sent_balance_sheets: null })
    throw new Error(`unexpected fetch ${url}`)
  })
}

beforeEach(() => captureMessage.mockReset())

describe('a group’s sheet is frozen like any other', () => {
  it('Finalise writes both comparisons, with the elimination note, in one PATCH', async () => {
    const f = fakeFetch()
    await expect(freezeBalanceSheetsAtFinalise(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBe(true)
    const patch = f.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    const body = JSON.parse(String(patch[1]!.body))
    // The organisations added, then what was done to their figures — the whole
    // note list travels into the freeze, not just its first line.
    expect(body.balance_sheets.mom.consolidation.notes[0]).toMatch(/^Added together: Dragon Roofing/)
    expect(body.balance_sheets.mom.consolidation.notes.some((n: string) => n.startsWith('Eliminated on consolidation'))).toBe(true)
    expect(body.balance_sheets.mom).toEqual(mom)
    expect(body.balance_sheets.yoy).toEqual(yoy)
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('the stored freeze survives the route’s own validation, notes and all', () => {
    const stored = JSON.parse(JSON.stringify({ frozen_at: '2026-09-16T01:00:00.000Z', report_month: '2026-08', mom, yoy }))
    const frozen = readFrozenBalanceSheets(stored, '2026-08')
    expect(frozen?.mom.consolidation?.notes).toEqual(mom.consolidation?.notes)
    expect(frozen?.mom.rows).toEqual(mom.rows)
  })

  it('a finalised month exports the frozen group sheet without going near the mirror again', async () => {
    const f = fakeFetch()
    const report = { report_month: '2026-08', summary: { income: 1 } }
    const sources = await balanceSheetsForExport({
      businessId: BIZ,
      reportMonth: '2026-08',
      report,
      stored: {
        status: 'final',
        report_data: { ...report, [FROZEN_BALANCE_SHEETS_KEY]: { frozen_at: 'then', report_month: '2026-08', mom, yoy } },
      },
      fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources.mom?.data).toEqual(mom)
    expect(f).not.toHaveBeenCalled()
  })

  it('and an Approve & Send keeps the group sheet its PDF printed', () => {
    const sent = printedBalanceSheets({ mom: { data: mom }, yoy: { data: yoy } })
    const report = { report_month: '2026-08', summary: { income: 1 } }
    const kept = readFrozenBalanceSheets({ ...sent, frozen_at: 'now', report_month: '2026-08' }, '2026-08')
    const printedAgain = sentBalanceSheetSources({ frozen: kept, report }, report, '2026-08')
    expect(printedAgain?.mom?.data).toEqual(mom)
  })
})
