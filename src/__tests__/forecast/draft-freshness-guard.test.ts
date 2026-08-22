import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  loadStateFromStorage,
  MAX_LOCAL_DRAFT_AGE_MS,
} from '@/app/finances/forecast/components/wizard-v4/useForecastWizard'

/**
 * 21 Aug 2026 forecast validity audit, finding PROC-03.
 *
 * The local draft used to win over server state unconditionally and carried no
 * timestamp, so there was no way to tell a fresh draft from a week-old one.
 * Opening a forecast on a second device whose browser still held last week's
 * draft restored the stale numbers, and the first edit wrote them back over the
 * newer server draft — silent work loss behind a green "Draft saved".
 */

const BUSINESS_ID = 'biz-freshness'
const FY = 2027

function writeDraft(savedAt: string | null, extra: Record<string, unknown> = {}) {
  const draft = {
    businessId: BUSINESS_ID,
    fiscalYearStart: FY,
    forecastId: null,
    revenueLines: [{ id: 'r1' }],
    cogsLines: [],
    opexLines: [],
    ...(savedAt ? { draftSavedAt: savedAt } : {}),
    ...extra,
  }
  localStorage.setItem(`forecast-wizard-v4-${BUSINESS_ID}-${FY}`, JSON.stringify(draft))
}

describe('local draft freshness (PROC-03)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a draft saved moments ago', () => {
    writeDraft(new Date().toISOString())
    expect(loadStateFromStorage(BUSINESS_ID, FY)).not.toBeNull()
  })

  it('keeps a draft from earlier today — the reason the cache exists', () => {
    writeDraft(new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    expect(loadStateFromStorage(BUSINESS_ID, FY)).not.toBeNull()
  })

  it('THE SECOND-DEVICE CASE: discards a week-old draft so the server copy wins', () => {
    writeDraft(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    expect(loadStateFromStorage(BUSINESS_ID, FY)).toBeNull()
  })

  it('discards anything past the age limit', () => {
    writeDraft(new Date(Date.now() - (MAX_LOCAL_DRAFT_AGE_MS + 60_000)).toISOString())
    expect(loadStateFromStorage(BUSINESS_ID, FY)).toBeNull()
  })

  it('discards a draft whose stamp is unparseable rather than trusting it', () => {
    writeDraft('not-a-date')
    expect(loadStateFromStorage(BUSINESS_ID, FY)).toBeNull()
  })

  it('lets an UNSTAMPED legacy draft through — they predate the guard and re-stamp on next save', () => {
    // Discarding these would throw away every in-flight draft on the deploy
    // that ships the guard.
    writeDraft(null)
    expect(loadStateFromStorage(BUSINESS_ID, FY)).not.toBeNull()
  })
})
