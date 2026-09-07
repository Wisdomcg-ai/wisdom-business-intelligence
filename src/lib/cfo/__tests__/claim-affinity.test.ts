import { describe, expect, it } from 'vitest'
import { AFFINITY_WINDOW_MINUTES, affinityEligible } from '../claim-affinity'

const NOW = Date.parse('2026-09-08T06:00:00.000Z')
const justQueued = new Date(NOW - 60_000).toISOString()
const pastWindow = new Date(NOW - (AFFINITY_WINDOW_MINUTES + 1) * 60_000).toISOString()

describe('affinityEligible', () => {
  it('lets the requester’s own machine claim immediately', () => {
    expect(
      affinityEligible({ declaredOwnerEmail: 'vanessa@wisdomcg.com.au', requesterEmail: 'vanessa@wisdomcg.com.au', requestedAt: justQueued, nowMs: NOW })
    ).toBe(true)
  })

  it('matches owner emails case-insensitively and ignores whitespace', () => {
    expect(
      affinityEligible({ declaredOwnerEmail: ' Vanessa@WisdomCG.com.au ', requesterEmail: 'vanessa@wisdomcg.com.au', requestedAt: justQueued, nowMs: NOW })
    ).toBe(true)
  })

  it('makes another owner’s machine wait out the window', () => {
    expect(
      affinityEligible({ declaredOwnerEmail: 'matt@wisdombi.ai', requesterEmail: 'vanessa@wisdomcg.com.au', requestedAt: justQueued, nowMs: NOW })
    ).toBe(false)
  })

  it('opens to any runner once the window has passed', () => {
    expect(
      affinityEligible({ declaredOwnerEmail: 'matt@wisdombi.ai', requesterEmail: 'vanessa@wisdomcg.com.au', requestedAt: pastWindow, nowMs: NOW })
    ).toBe(true)
  })

  it('treats a runner with no declared owner as generic (legacy behavior)', () => {
    expect(
      affinityEligible({ declaredOwnerEmail: null, requesterEmail: 'vanessa@wisdomcg.com.au', requestedAt: justQueued, nowMs: NOW })
    ).toBe(true)
  })

  it('treats a request with no requester as unreserved', () => {
    expect(
      affinityEligible({ declaredOwnerEmail: 'matt@wisdombi.ai', requesterEmail: null, requestedAt: justQueued, nowMs: NOW })
    ).toBe(true)
  })

  it('fails open on an unparseable timestamp rather than wedging the queue', () => {
    expect(
      affinityEligible({ declaredOwnerEmail: 'matt@wisdombi.ai', requesterEmail: 'vanessa@wisdomcg.com.au', requestedAt: 'not-a-date', nowMs: NOW })
    ).toBe(true)
  })
})
