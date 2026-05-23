/**
 * Phase 67-02 — needsFxConsolidation predicate
 *
 * The predicate gates the multi-currency code path in historical-pl-summary
 * (and follow-up phases for sibling reads). False means "use the existing
 * direct-read fast path"; true means "route through the consolidation
 * engine for FX translation".
 *
 * The contract that matters most: false for single-tenant + all-AUD; true
 * only when there's a tenant whose functional_currency is something other
 * than 'AUD' and is active + included in consolidation. Anything else
 * (mis-tagged 'aud' lowercase, NULL, inactive HKD tenants) must not flip
 * the gate.
 */
import { describe, it, expect, vi } from 'vitest'
import { needsFxConsolidation } from '@/lib/utils/needs-fx-consolidation'

vi.mock('@/lib/utils/resolve-business-ids', () => ({
  resolveBusinessIds: vi.fn(async (_sb: unknown, businessId: string) => ({
    bizId: businessId,
    all: [businessId],
  })),
}))

function makeSb(rows: Array<{ functional_currency: string | null }> | null) {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  }
}

describe('needsFxConsolidation', () => {
  it('returns false when business has no Xero connections', async () => {
    const sb = makeSb([])
    expect(await needsFxConsolidation(sb, 'biz-1')).toBe(false)
  })

  it('returns false for single-tenant AUD', async () => {
    const sb = makeSb([{ functional_currency: 'AUD' }])
    expect(await needsFxConsolidation(sb, 'biz-2')).toBe(false)
  })

  it('returns false when all tenants are AUD', async () => {
    const sb = makeSb([
      { functional_currency: 'AUD' },
      { functional_currency: 'AUD' },
      { functional_currency: 'AUD' },
    ])
    expect(await needsFxConsolidation(sb, 'biz-3')).toBe(false)
  })

  it('returns true when any tenant is HKD (the IICT case)', async () => {
    const sb = makeSb([
      { functional_currency: 'AUD' },
      { functional_currency: 'AUD' },
      { functional_currency: 'HKD' },
    ])
    expect(await needsFxConsolidation(sb, 'biz-4')).toBe(true)
  })

  it('treats NULL functional_currency as AUD (safe default — does not flip the gate)', async () => {
    const sb = makeSb([{ functional_currency: null }])
    expect(await needsFxConsolidation(sb, 'biz-5')).toBe(false)
  })

  it('case-insensitive — lowercase aud should not flip the gate', async () => {
    const sb = makeSb([{ functional_currency: 'aud' }, { functional_currency: 'AUD' }])
    expect(await needsFxConsolidation(sb, 'biz-6')).toBe(false)
  })

  it('returns false when query errors (fail-safe to legacy path)', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          in: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: { message: 'db down' } }),
            }),
          }),
        }),
      }),
    }
    expect(await needsFxConsolidation(sb, 'biz-7')).toBe(false)
  })
})
