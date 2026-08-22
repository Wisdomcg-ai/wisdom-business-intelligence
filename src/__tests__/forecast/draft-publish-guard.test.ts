/**
 * Phase 1 — a draft save records work; only a Generate publishes numbers.
 *
 * The wizard autosaves every few seconds. When the forecast already exists that
 * autosave takes the UPDATE path in api/forecast-wizard-v4/generate, and
 * materialisation is deliberately skipped for drafts — so forecast_pl_lines
 * stays at the last Generate. Writing the headline goals and the approved
 * summary on that same autosave advanced the published number every few seconds
 * while the stored P&L stood still, leaving the live row describing a forecast
 * that had never been published.
 */
import { describe, it, expect } from 'vitest'
import {
  applyDraftPublishGuard,
  PUBLISHED_FORECAST_FIELDS,
} from '@/lib/forecast/draft-publish-guard'

/** Mirrors the payload built in the generate route. */
const payload = () => ({
  business_id: 'profile-1',
  name: 'FY2027 Forecast',
  fiscal_year: 2027,
  assumptions: { revenue: { lines: [] } },
  forecast_duration: 1,
  updated_at: '2026-08-14T00:00:00Z',
  revenue_goal: 10_800_000,
  gross_profit_goal: 4_155_749,
  net_profit_goal: 212_663,
  wizard_state: { year1: { revenue: 10_800_000 } },
})

describe('draft saves', () => {
  const guarded = applyDraftPublishGuard(payload(), true)

  it('does not move any published number', () => {
    for (const field of PUBLISHED_FORECAST_FIELDS) {
      expect(guarded).not.toHaveProperty(field)
    }
  })

  it('still saves the operator\'s work', () => {
    expect(guarded.assumptions).toEqual({ revenue: { lines: [] } })
    expect(guarded.name).toBe('FY2027 Forecast')
    expect(guarded.forecast_duration).toBe(1)
    expect(guarded.updated_at).toBe('2026-08-14T00:00:00Z')
  })

  it('does not mutate the caller\'s payload', () => {
    const original = payload()
    applyDraftPublishGuard(original, true)
    expect(original.revenue_goal).toBe(10_800_000)
  })
})

describe('a final Generate', () => {
  it('publishes every field, because it materialises the P&L in the same request', () => {
    const published = applyDraftPublishGuard(payload(), false)
    expect(published.revenue_goal).toBe(10_800_000)
    expect(published.gross_profit_goal).toBe(4_155_749)
    expect(published.net_profit_goal).toBe(212_663)
    expect(published.wizard_state).toEqual({ year1: { revenue: 10_800_000 } })
  })
})

/**
 * Wiring guard. The helper above is new code, so a test of it alone cannot fail
 * against pre-fix HEAD and proves nothing about the route. This asserts the
 * generate route actually applies the guard on its UPDATE path — deleting that
 * call would otherwise leave the suite green.
 */
describe('the generate route applies the guard', () => {
  it('routes its UPDATE payload through applyDraftPublishGuard', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'src/app/api/forecast-wizard-v4/generate/route.ts',
      'utf8',
    )
    // 21 Aug 2026 audit (PROC-04): the first UPDATE is now ALWAYS the
    // draft-safe subset — stronger than the previous `isDraft` argument,
    // which let a final Generate advance the headline before the lines were
    // stored. The headline is published separately, after materialisation.
    expect(src).toContain('applyDraftPublishGuard(forecastData, true)')
    // …and that the guarded payload — not the raw one — is what gets written.
    expect(src).toMatch(/\.update\(updatePayload\)/)
  })

  it('publishes the headline only AFTER materialisation, never before', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'src/app/api/forecast-wizard-v4/generate/route.ts',
      'utf8',
    )
    const materialiseAt = src.indexOf("save_assumptions_and_materialize")
    const publishAt = src.indexOf('forecast_headline_publish_failed')
    const guardedUpdateAt = src.indexOf('applyDraftPublishGuard(forecastData, true)')

    expect(materialiseAt).toBeGreaterThan(-1)
    expect(publishAt).toBeGreaterThan(-1)
    // Order in the file mirrors order of execution in this linear handler:
    // guarded work-only update → materialise → publish headline.
    expect(guardedUpdateAt).toBeLessThan(materialiseAt)
    expect(publishAt).toBeGreaterThan(materialiseAt)
  })
})
