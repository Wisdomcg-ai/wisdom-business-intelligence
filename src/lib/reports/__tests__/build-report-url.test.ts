import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildReportUrl } from '../build-report-url'
import { signReportToken, verifyReportToken } from '../report-token'

const VALID_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const APP_URL = 'https://wisdombi.ai'

describe('buildReportUrl', () => {
  beforeEach(() => {
    vi.stubEnv('REPORT_LINK_SECRET', VALID_SECRET)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('Test 1: with portalSlug=null, returns /reports/view/<token> with a valid token', () => {
    const url = buildReportUrl({
      statusId: 'status-abc-123',
      portalSlug: null,
      periodMonth: '2026-03-01',
    })
    expect(url.startsWith(`${APP_URL}/reports/view/`)).toBe(true)
    const token = url.slice(`${APP_URL}/reports/view/`.length)
    // Token must verify back to the original statusId
    expect(verifyReportToken(token)).toBe('status-abc-123')
  })

  it('Test 2: with portalSlug and periodMonth YYYY-MM-DD, returns /portal/<slug>?month=YYYY-MM', () => {
    const url = buildReportUrl({
      statusId: 'status-abc-123',
      portalSlug: 'urban-road',
      periodMonth: '2026-03-01',
    })
    expect(url).toBe(`${APP_URL}/portal/urban-road?month=2026-03`)
  })

  it('Test 3: with portalSlug undefined (not passed), behaves same as null → token URL', () => {
    const url = buildReportUrl({
      statusId: 'status-abc-123',
      periodMonth: '2026-03-01',
    })
    expect(url.startsWith(`${APP_URL}/reports/view/`)).toBe(true)
  })

  it('Test 4: when appUrl param omitted, falls back to process.env.NEXT_PUBLIC_APP_URL', () => {
    const url = buildReportUrl({
      statusId: 'status-xyz',
      portalSlug: null,
      periodMonth: '2026-03-01',
    })
    expect(url.startsWith(APP_URL)).toBe(true)
  })

  it('Test 5: when neither appUrl nor NEXT_PUBLIC_APP_URL present, throws with clear message', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    expect(() =>
      buildReportUrl({
        statusId: 'status-abc',
        portalSlug: null,
        periodMonth: '2026-03-01',
      })
    ).toThrow(/NEXT_PUBLIC_APP_URL/)
  })

  it('Test 6: trailing slash on appUrl is normalized', () => {
    const withSlash = buildReportUrl({
      statusId: 'status-abc',
      portalSlug: null,
      periodMonth: '2026-03-01',
      appUrl: 'https://x.com/',
    })
    const withoutSlash = buildReportUrl({
      statusId: 'status-abc',
      portalSlug: null,
      periodMonth: '2026-03-01',
      appUrl: 'https://x.com',
    })
    expect(withSlash).toBe(withoutSlash)
    expect(withSlash.startsWith('https://x.com/reports/view/')).toBe(true)
  })

  it('accepts periodMonth in YYYY-MM format too (portal path)', () => {
    const url = buildReportUrl({
      statusId: 'status-abc',
      portalSlug: 'urban-road',
      periodMonth: '2026-03',
    })
    expect(url).toBe(`${APP_URL}/portal/urban-road?month=2026-03`)
  })

  it('throws on malformed periodMonth when portal path is used', () => {
    expect(() =>
      buildReportUrl({
        statusId: 'status-abc',
        portalSlug: 'urban-road',
        periodMonth: 'nonsense',
      })
    ).toThrow(/periodMonth/)
  })

  it('explicit appUrl param overrides env var', () => {
    const url = buildReportUrl({
      statusId: 'status-abc',
      portalSlug: null,
      periodMonth: '2026-03-01',
      appUrl: 'https://staging.wisdombi.ai',
    })
    expect(url.startsWith('https://staging.wisdombi.ai/reports/view/')).toBe(true)
  })

  it('URL-encodes portal slug with special characters', () => {
    const url = buildReportUrl({
      statusId: 'status-abc',
      portalSlug: 'urban road/2',
      periodMonth: '2026-03-01',
    })
    expect(url).toBe(`${APP_URL}/portal/urban%20road%2F2?month=2026-03`)
  })
})

describe('buildReportUrl + signReportToken integration', () => {
  beforeEach(() => {
    vi.stubEnv('REPORT_LINK_SECRET', VALID_SECRET)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('token in URL is identical to signReportToken(statusId)', () => {
    const statusId = 'same-status-id'
    const url = buildReportUrl({ statusId, portalSlug: null, periodMonth: '2026-03-01' })
    const tokenFromUrl = url.slice(`${APP_URL}/reports/view/`.length)
    // Token payload must decode back to statusId (signatures may differ on re-sign if non-deterministic,
    // but HMAC is deterministic so they should match byte-for-byte)
    expect(tokenFromUrl).toBe(signReportToken(statusId))
  })
})
