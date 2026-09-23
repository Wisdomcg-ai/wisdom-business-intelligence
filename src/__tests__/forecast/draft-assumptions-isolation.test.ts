import { describe, it, expect } from 'vitest'
import {
  applyDraftPublishGuard,
  PUBLISHED_FORECAST_FIELDS,
} from '@/lib/forecast/draft-publish-guard'

/**
 * 23 Aug 2026 — "if I open a forecast and click through without changing
 * anything, does it override anything?" It did: `assumptions` was unprotected,
 * and a draft save needs no operator edit (every step-bar click calls saveDraft;
 * autosave fires 3s after any tracked state settles). Nothing broke on the spot
 * because drafts never materialise — but recompute, seed-from-prior and the next
 * Generate all rebuild the stored P&L from that column.
 */
describe('a draft save cannot touch the published record', () => {
  const approved = { goals: { year1: { revenue: 9_943_737 } } }
  const inProgress = { goals: { year1: { revenue: 1 } } }

  const payload = () => ({
    assumptions: inProgress,
    wizard_state: { year1: { revenue: 1 } },
    revenue_goal: 1,
    gross_profit_goal: 1,
    net_profit_goal: 1,
    goal_source: 'wizard_v4',
    name: 'FY2027 Forecast',
  })

  it('redirects assumptions to draft_assumptions — work kept, published record untouched', () => {
    const out = applyDraftPublishGuard(payload(), true)
    expect(out.assumptions).toBeUndefined()
    expect(out.draft_assumptions).toEqual(inProgress)
  })

  it('still strips every published headline column', () => {
    const out = applyDraftPublishGuard(payload(), true)
    for (const f of PUBLISHED_FORECAST_FIELDS) expect(out[f]).toBeUndefined()
  })

  it('leaves non-published columns alone', () => {
    expect(applyDraftPublishGuard(payload(), true).name).toBe('FY2027 Forecast')
  })

  it('a FINAL generate publishes assumptions unchanged — the whole point of the split', () => {
    const out = applyDraftPublishGuard({ ...payload(), assumptions: approved }, false)
    expect(out.assumptions).toEqual(approved)
    expect(out.draft_assumptions).toBeUndefined()
    expect(out.wizard_state).toBeDefined()
  })

  it('the Dragon scenario: clicking through a published forecast leaves it publishable-intact', () => {
    // Simulates the real incident shape — a wizard holding a stale/blank-slate
    // state autosaving onto a forecast whose approved plan is $9,943,737.
    const stored = { assumptions: approved, draft_assumptions: null as unknown }
    const draftWrite = applyDraftPublishGuard(
      { assumptions: { goals: { year1: { revenue: 9_000_000 } } } },
      true,
    )
    const after = { ...stored, ...draftWrite }
    expect(after.assumptions).toEqual(approved)
    expect(after.draft_assumptions).toEqual({ goals: { year1: { revenue: 9_000_000 } } })
  })

  it('is idempotent — re-guarding an already-redirected payload does not nest', () => {
    const once = applyDraftPublishGuard(payload(), true)
    const twice = applyDraftPublishGuard(once, true)
    expect(twice.draft_assumptions).toEqual(inProgress)
    expect(twice.assumptions).toBeUndefined()
  })

  it('a payload with no assumptions key gains no draft_assumptions key', () => {
    const out = applyDraftPublishGuard({ name: 'x' }, true)
    expect('draft_assumptions' in out).toBe(false)
  })
})
