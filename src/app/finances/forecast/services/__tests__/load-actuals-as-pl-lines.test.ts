/**
 * Phase 65 — ForecastService.loadActualsAsPLLines
 *
 * Verifies the aggregation that powers the prior-FY actuals view. A row per
 * (account_code, month) in xero_pl_lines becomes one PLLine per account_code
 * with actual_months keyed by 'YYYY-MM'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type RawRow = {
  account_code: string | null
  account_name: string | null
  account_type: string | null
  period_month: string
  amount: number
}

// Module-level vars rebuilt per test so the mocked supabase client returns
// scenario-specific data.
let mockProfileLookup: { id: string } | null = null
let mockXeroRows: RawRow[] = []

vi.mock('@/lib/supabase/client', () => {
  const supabase = {
    from: (table: string) => {
      if (table === 'business_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockProfileLookup, error: null }),
            }),
          }),
        }
      }
      if (table === 'xero_pl_lines') {
        // Build a chained query object that captures filters then resolves
        // the .range() call with the in-memory rows.
        const state: { gte?: string; lte?: string } = {}
        const builder: any = {
          select: () => builder,
          in: () => builder,
          gte: (_col: string, v: string) => { state.gte = v; return builder },
          lte: (_col: string, v: string) => { state.lte = v; return builder },
          range: async (from: number, to: number) => {
            const filtered = mockXeroRows.filter(r => {
              if (state.gte && r.period_month < state.gte) return false
              if (state.lte && r.period_month > state.lte) return false
              return true
            })
            return { data: filtered.slice(from, to + 1), error: null }
          },
        }
        return builder
      }
      throw new Error(`Unexpected table in mock: ${table}`)
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  }
  return { createClient: () => supabase }
})

import { ForecastService } from '../forecast-service'

beforeEach(() => {
  mockProfileLookup = null
  mockXeroRows = []
})

describe('ForecastService.loadActualsAsPLLines', () => {
  it('returns empty array when no xero_pl_lines exist', async () => {
    mockXeroRows = []
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out).toEqual([])
  })

  it('aggregates per-account amounts across months in the FY range (yearStart=7)', async () => {
    // FY25 (AU FY) = Jul 2024 – Jun 2025
    mockXeroRows = [
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 10000 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-08-01', amount: 12000 },
      { account_code: '400', account_name: 'Rent', account_type: 'opex', period_month: '2024-07-01', amount: 5000 },
      // Row outside the FY range — should be filtered out by gte/lte.
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2025-07-01', amount: 999999 },
    ]
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)

    expect(out).toHaveLength(2)
    const sales = out.find(l => l.account_code === '200')
    const rent = out.find(l => l.account_code === '400')

    expect(sales).toBeDefined()
    expect(sales!.account_name).toBe('Sales')
    expect(sales!.account_type).toBe('revenue')
    expect(sales!.is_from_xero).toBe(true)
    expect(sales!.actual_months).toEqual({ '2024-07': 10000, '2024-08': 12000 })
    expect(sales!.forecast_months).toEqual({})

    expect(rent!.actual_months).toEqual({ '2024-07': 5000 })
    // Sanity: the out-of-range row (2025-07) didn't leak into the FY25 result.
    expect(sales!.actual_months['2025-07']).toBeUndefined()
  })

  it('sums duplicate (account, month) rows from multiple tenants', async () => {
    mockXeroRows = [
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 5000 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 3000 },
    ]
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out).toHaveLength(1)
    expect(out[0].actual_months['2024-07']).toBe(8000)
  })

  it('groups rows with null account_code by account_name fallback', async () => {
    mockXeroRows = [
      { account_code: null, account_name: 'Misc', account_type: 'opex', period_month: '2024-07-01', amount: 100 },
      { account_code: null, account_name: 'Misc', account_type: 'opex', period_month: '2024-08-01', amount: 200 },
    ]
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out).toHaveLength(1)
    expect(out[0].account_name).toBe('Misc')
    expect(out[0].actual_months).toEqual({ '2024-07': 100, '2024-08': 200 })
  })

  it('handles calendar-year fiscal years (yearStart=1, FY2025 = Jan-Dec 2025)', async () => {
    mockXeroRows = [
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-12-01', amount: 999999 }, // outside
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2025-01-01', amount: 1000 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2025-12-01', amount: 2000 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2026-01-01', amount: 999999 }, // outside
    ]
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 1)
    expect(out).toHaveLength(1)
    expect(out[0].actual_months).toEqual({ '2025-01': 1000, '2025-12': 2000 })
  })

  it('sorts output by account_type then account_name', async () => {
    mockXeroRows = [
      { account_code: '400', account_name: 'Rent', account_type: 'opex', period_month: '2024-07-01', amount: 1 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 1 },
      { account_code: '300', account_name: 'Wages', account_type: 'cogs', period_month: '2024-07-01', amount: 1 },
    ]
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out.map(l => l.account_type)).toEqual(['cogs', 'opex', 'revenue'])
  })
})
