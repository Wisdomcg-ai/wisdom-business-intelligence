/**
 * A consolidated report carries the real draft and unreconciled state
 * (IICT-04, DRG-02).
 *
 * The adapter hard-coded is_draft:false and unreconciled_count:0, and the hook
 * dropped Generate's force_draft on the consolidated branch. So IICT — one of
 * its three Xero organisations refusing every sync — generated as FINAL with a
 * clean gate: pre-flight passed "Final, with a clean reconciliation gate",
 * Finalise was enabled, and the cover printed no draft line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { useMonthlyReport, adaptConsolidatedToGeneratedReport } from '../useMonthlyReport'
import { draftCoverLine } from '../../services/monthly-report-pdf-service'
import { runPreflight } from '@/lib/monthly-report/preflight'
import { DEFAULT_SECTIONS } from '../../types'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            // Three included connections: the consolidation branch.
            eq: () => Promise.resolve({ count: 3 }),
          }),
        }),
      }),
    }),
  }),
}))

const IICT = 'fbc6dffd-677d-47ec-8277-7157982938e7'

/** The settings row the consolidated route serves beside the report (P3). */
const SETTINGS = {
  business_id: IICT,
  sections: { ...DEFAULT_SECTIONS },
  show_prior_year: false,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
}

const CONSOLIDATED = {
  consolidated: {
    lines: [{ account_type: 'revenue', account_name: 'Membership income', monthly_values: { '2026-07': 409_984, '2026-08': 324_881 } }],
    budgetLines: [],
  },
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/monthly-report/consolidated')) {
      return { ok: true, json: async () => ({ report: CONSOLIDATED, settings: SETTINGS }) } as unknown as Response
    }
    throw new Error(`unexpected fetch: ${url}`)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function harness() {
  const api: { current: ReturnType<typeof useMonthlyReport> | null } = { current: null }
  function Harness() {
    api.current = useMonthlyReport(IICT)
    return null
  }
  return { api, Harness }
}

async function generated(forceDraft: boolean | undefined, unreconciled?: number) {
  const { api, Harness } = harness()
  render(<Harness />)
  // Let the consolidation detection resolve before Generate, as the page does.
  await act(async () => { await Promise.resolve() })
  let report: any
  await act(async () => {
    report = await api.current!.generateReport('2026-08', 2027, forceDraft, unreconciled)
  })
  return report
}

describe('the consolidated Generate keeps the gate’s answer', () => {
  it('a draft with 12 unreconciled transactions is a draft with 12, and the cover says so', async () => {
    const report = await generated(true, 12)
    expect(report.is_consolidation).toBe(true)
    expect(report.is_draft).toBe(true)
    expect(report.unreconciled_count).toBe(12)
    expect(draftCoverLine(report)).toBe('There are still 12 unreconciled transactions when this report is generated.')
    const row = runPreflight({ report }).find((r) => r.key === 'draft_state')!
    expect(row.status).toBe('warn')
  })

  it('a failed reconciliation check (draft, no count) prints the neutral draft line', async () => {
    const report = await generated(true, 0)
    expect(report.is_draft).toBe(true)
    expect(draftCoverLine(report)).toBe('Draft — figures may change')
  })

  it('a clean completed check is a final report, as before', async () => {
    const report = await generated(false, 0)
    expect(report.is_draft).toBe(false)
    expect(draftCoverLine(report)).toBeNull()
  })

  it('no answer at all is a draft, never a clean final', async () => {
    const report = await generated(undefined)
    expect(report.is_draft).toBe(true)
  })
})

describe('adaptConsolidatedToGeneratedReport — draft state', () => {
  it('defaults to a draft when the caller says nothing', () => {
    const r = adaptConsolidatedToGeneratedReport(CONSOLIDATED, '2026-08', 2027, IICT, { settings: SETTINGS })
    expect(r.is_draft).toBe(true)
    expect(r.unreconciled_count).toBe(0)
  })

  it('carries what it is given', () => {
    const r = adaptConsolidatedToGeneratedReport(CONSOLIDATED, '2026-08', 2027, IICT, { settings: SETTINGS }, { isDraft: false, unreconciledCount: 0 })
    expect(r.is_draft).toBe(false)
  })
})
