import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildConsolidation,
  loadBusinessContext,
  reportMissingCurrencyTenants,
} from './engine'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  DRAGON_ROOFING_TENANT,
  EASY_HAIL_TENANT,
} from './__fixtures__/dragon-mar-2026'
import type { ConsolidationTenant, XeroPLLineLike } from './types'

/**
 * DM-N8 — Consolidation FX invariant: a tenant whose
 * xero_connections.functional_currency is NULL/empty must NOT be silently
 * treated as the presentation currency (which sums foreign-currency figures
 * 1:1 — a wrong number, no error). The engine defaults to the presentation
 * currency so the report still renders, but flags the tenant via
 * diagnostics.tenants_missing_currency AND fires a Sentry invariant alert.
 */

// Mock Sentry so we can assert the invariant alert without a real client.
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}))

beforeEach(() => {
  captureMessage.mockClear()
})

/**
 * Minimal fake supabase. `connections` lets each test inject the
 * xero_connections rows (so we can null out functional_currency). Covers every
 * table buildConsolidation touches in 'single' mode with no forecast.
 */
function makeFakeSupabase(connections: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table === 'businesses') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: DRAGON_ROOFING_BIZ,
                  name: 'Dragon Group',
                  consolidation_budget_mode: 'single',
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'xero_connections') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: async () => ({ data: connections, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'xero_pl_lines_wide_compat') {
        return {
          select: () => ({
            in: () => ({
              in: async () => ({
                data: [...dragonRoofingPL, ...easyHailPL] as XeroPLLineLike[],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'consolidation_elimination_rules') {
        return {
          select: () => ({
            eq: () => ({ eq: async () => ({ data: [], error: null }) }),
          }),
        }
      }
      if (table === 'business_profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }
      }
      // financial_forecasts (single-mode budget lookup) → no forecast
      if (table === 'financial_forecasts') {
        return {
          select: () => ({
            in: () => ({
              is: () => ({
                eq: () => ({
                  order: () => ({ limit: async () => ({ data: [], error: null }) }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`[test] unexpected from(${table})`)
    },
  }
}

const dragonConn = (overrides: Record<string, unknown> = {}) => ({
  id: 'c-dragon',
  business_id: DRAGON_ROOFING_BIZ,
  tenant_id: DRAGON_ROOFING_TENANT,
  tenant_name: 'Dragon Roofing',
  display_name: 'Dragon Roofing',
  display_order: 0,
  functional_currency: 'AUD',
  include_in_consolidation: true,
  is_active: true,
  ...overrides,
})

const easyHailConn = (overrides: Record<string, unknown> = {}) => ({
  id: 'c-easyhail',
  business_id: DRAGON_ROOFING_BIZ,
  tenant_id: EASY_HAIL_TENANT,
  tenant_name: 'Easy Hail Claim',
  display_name: 'Easy Hail Claim',
  display_order: 1,
  functional_currency: 'AUD',
  include_in_consolidation: true,
  is_active: true,
  ...overrides,
})

// ─── loadBusinessContext: currency_known flag ────────────────────────────────

describe('loadBusinessContext — currency_known flag', () => {
  it('marks currency_known=true for a real currency and preserves the value', async () => {
    const supabase = makeFakeSupabase([dragonConn({ functional_currency: 'NZD' })])
    const { tenants } = await loadBusinessContext(supabase as any, DRAGON_ROOFING_BIZ)
    expect(tenants[0].functional_currency).toBe('NZD')
    expect(tenants[0].currency_known).toBe(true)
  })

  it('flags currency_known=false and defaults to AUD when functional_currency is NULL', async () => {
    const supabase = makeFakeSupabase([dragonConn({ functional_currency: null })])
    const { tenants } = await loadBusinessContext(supabase as any, DRAGON_ROOFING_BIZ)
    expect(tenants[0].functional_currency).toBe('AUD')
    expect(tenants[0].currency_known).toBe(false)
  })

  it('flags currency_known=false for an empty/whitespace currency', async () => {
    const supabase = makeFakeSupabase([dragonConn({ functional_currency: '   ' })])
    const { tenants } = await loadBusinessContext(supabase as any, DRAGON_ROOFING_BIZ)
    expect(tenants[0].functional_currency).toBe('AUD')
    expect(tenants[0].currency_known).toBe(false)
  })
})

// ─── reportMissingCurrencyTenants ────────────────────────────────────────────

describe('reportMissingCurrencyTenants', () => {
  const t = (id: string, currency_known?: boolean): ConsolidationTenant => ({
    connection_id: `c-${id}`,
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: id,
    display_name: id,
    display_order: 0,
    functional_currency: 'AUD',
    include_in_consolidation: true,
    currency_known,
  })

  it('returns the tenant_ids with currency_known=false and fires one Sentry alert', () => {
    const missing = reportMissingCurrencyTenants(DRAGON_ROOFING_BIZ, [
      t('known', true),
      t('unknown-a', false),
      t('unknown-b', false),
    ])
    expect(missing).toEqual(['unknown-a', 'unknown-b'])
    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [message, opts] = captureMessage.mock.calls[0]
    expect(message).toMatch(/missing functional_currency/i)
    expect((opts as any).tags.invariant).toBe('consolidation_missing_functional_currency')
    expect((opts as any).extra.tenant_ids).toEqual(['unknown-a', 'unknown-b'])
  })

  it('returns [] and does NOT alert when every tenant has a known currency', () => {
    const missing = reportMissingCurrencyTenants(DRAGON_ROOFING_BIZ, [
      t('a', true),
      t('b', true),
    ])
    expect(missing).toEqual([])
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('treats undefined currency_known (legacy literals) as not flagged', () => {
    const missing = reportMissingCurrencyTenants(DRAGON_ROOFING_BIZ, [t('legacy', undefined)])
    expect(missing).toEqual([])
    expect(captureMessage).not.toHaveBeenCalled()
  })
})

// ─── buildConsolidation: diagnostics surface the invariant ───────────────────

describe('buildConsolidation — tenants_missing_currency diagnostic', () => {
  it('reports the NULL-currency tenant and alerts, while the report still renders', async () => {
    const supabase = makeFakeSupabase([
      dragonConn({ functional_currency: 'AUD' }),
      easyHailConn({ functional_currency: null }),
    ])
    const report = await buildConsolidation(supabase as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      singleBusinessBudget: null,
    })

    expect(report.diagnostics.tenants_missing_currency).toEqual([EASY_HAIL_TENANT])
    expect(captureMessage).toHaveBeenCalledTimes(1)
    // Report still produced consolidated lines (non-fatal).
    expect(report.consolidated.lines.length).toBeGreaterThan(0)
    expect(report.diagnostics.tenants_loaded).toBe(2)
  })

  it('reports an empty list and does not alert when all currencies are known', async () => {
    const supabase = makeFakeSupabase([dragonConn(), easyHailConn()])
    const report = await buildConsolidation(supabase as any, {
      businessId: DRAGON_ROOFING_BIZ,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      singleBusinessBudget: null,
    })

    expect(report.diagnostics.tenants_missing_currency).toEqual([])
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
