/**
 * Phase 44.2 Plan 44.2-06B Task 2 — getXeroOrgTimezone unit tests.
 *
 * Calls fetchXeroWithRateLimit and maps Xero TZ codes (e.g.
 * AUSEASTERNSTANDARDTIME) to IANA TZ names ('Australia/Sydney').
 * Unknown TZ falls back to UTC with a Sentry warning.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

function makeOrgResponse(timezone: string, countryCode: string = 'AU') {
  return new Response(
    JSON.stringify({
      Organisations: [
        {
          OrganisationID: 'org-1',
          Timezone: timezone,
          CountryCode: countryCode,
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.resetModules()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getXeroOrgTimezone', () => {
  it('AUSEASTERNSTANDARDTIME → Australia/Sydney', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeOrgResponse('AUSEASTERNSTANDARDTIME', 'AU'),
    )
    const { getXeroOrgTimezone } = await import('@/lib/xero/organisation')
    const res = await getXeroOrgTimezone(
      { tenant_id: 'tenant-A' } as any,
      'tok',
    )
    expect(res.timezone).toBe('Australia/Sydney')
    expect(res.countryCode).toBe('AU')
  })

  it('HONGKONGSTANDARDTIME → Asia/Hong_Kong (IICT support)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeOrgResponse('HONGKONGSTANDARDTIME', 'HK'),
    )
    const { getXeroOrgTimezone } = await import('@/lib/xero/organisation')
    const res = await getXeroOrgTimezone(
      { tenant_id: 'tenant-IICT' } as any,
      'tok',
    )
    expect(res.timezone).toBe('Asia/Hong_Kong')
    expect(res.countryCode).toBe('HK')
  })

  it('NZSTANDARDTIME → Pacific/Auckland', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeOrgResponse('NZSTANDARDTIME', 'NZ'),
    )
    const { getXeroOrgTimezone } = await import('@/lib/xero/organisation')
    const res = await getXeroOrgTimezone(
      { tenant_id: 'tenant-NZ' } as any,
      'tok',
    )
    expect(res.timezone).toBe('Pacific/Auckland')
  })

  it('Unknown Xero TZ → falls back to UTC + Sentry warning', async () => {
    const Sentry = await import('@sentry/nextjs')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeOrgResponse('MARSCOLONYTIME', 'XX'),
    )
    const { getXeroOrgTimezone } = await import('@/lib/xero/organisation')
    const res = await getXeroOrgTimezone(
      { tenant_id: 'tenant-X' } as any,
      'tok',
    )
    expect(res.timezone).toBe('UTC')
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringMatching(/unknown.*xero.*timezone/i),
      expect.objectContaining({
        level: 'warning',
      }),
    )
  })

  it('429 daily → propagates RateLimitDailyExceededError from client', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 429,
        headers: { 'X-Rate-Limit-Problem': 'daily' },
      }),
    )
    const { getXeroOrgTimezone } = await import('@/lib/xero/organisation')
    const { RateLimitDailyExceededError } = await import(
      '@/lib/xero/xero-api-client'
    )
    await expect(
      getXeroOrgTimezone({ tenant_id: 'tenant-A' } as any, 'tok'),
    ).rejects.toBeInstanceOf(RateLimitDailyExceededError)
  })

  it('Empty/missing Organisations array → throws clear error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ Organisations: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const { getXeroOrgTimezone } = await import('@/lib/xero/organisation')
    await expect(
      getXeroOrgTimezone({ tenant_id: 'tenant-A' } as any, 'tok'),
    ).rejects.toThrow(/organisation/i)
  })

  it('Maps at least 11 Xero TZ codes', async () => {
    // Sanity: all required mappings produce non-UTC IANA names.
    const cases = [
      'AUSEASTERNSTANDARDTIME',
      'NZSTANDARDTIME',
      'EASTERNSTANDARDTIME',
      'USEASTERNSTANDARDTIME',
      'USPACIFICSTANDARDTIME',
      'GREENWICHSTANDARDTIME',
      'EUROPEANCENTRALTIME',
      'INDIASTANDARDTIME',
      'JAPANSTANDARDTIME',
      'HONGKONGSTANDARDTIME',
      'CHINASTANDARDTIME',
    ]
    const { mapXeroTimezoneToIANA } = await import('@/lib/xero/organisation')
    for (const code of cases) {
      const iana = mapXeroTimezoneToIANA(code)
      expect(iana, `${code} should map to a known IANA tz`).not.toBe('UTC')
    }
  })
})
