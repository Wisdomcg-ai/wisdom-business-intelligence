/**
 * R7 — brand config module lock.
 *
 * Pins two invariants of `src/lib/config/brand.ts`:
 *   1. Defaults reproduce the current WisdomBI values byte-for-byte, so
 *      production behavior is unchanged until a fork sets env vars.
 *   2. Env vars override the defaults (the fork's rebrand-by-config), and a
 *      set-but-empty env var falls back to the default rather than blanking
 *      the brand.
 *
 * The module reads env at import time, so override cases use `vi.resetModules()`
 * + a fresh dynamic import after stubbing env.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('brand config — WisdomBI defaults (production unchanged)', () => {
  it('exposes the current hardcoded values as defaults', async () => {
    const brand = await import('@/lib/config/brand')
    expect(brand.APP_NAME).toBe('WisdomBI')
    expect(brand.APP_TITLE).toBe('WisdomBi - Business Intelligence')
    expect(brand.APP_DESCRIPTION).toContain('data-driven coaching')
    expect(brand.BRAND_LOGO_URL).toBe('https://wisdombi.ai/images/logo-main.png')
    expect(brand.FAVICON_PATH).toBe('/favicon.png')
    expect(brand.BRAND_COLORS.orange).toBe('#F5821F')
    expect(brand.BRAND_COLORS.navy).toBe('#172238')
    expect(brand.BRAND_COLORS.orangeLight).toBe('#fff8f1')
    expect(brand.BRAND_COLORS.navyLight).toBe('#f4f6f9')
    // Preserves the exact pre-R7 sender header.
    expect(brand.SENDER_FROM).toBe('WisdomBI <noreply@mail.wisdombi.ai>')
    expect(brand.SUPPORT_EMAIL).toBe('support@wisdombi.ai')
    expect(brand.LEGAL_ABN).toBe('11 331 804 705')
  })
})

describe('brand config — env override (fork rebrand)', () => {
  it('lets env vars override the brand identity', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'inLIFE Pulse')
    vi.stubEnv('NEXT_PUBLIC_BRAND_ORANGE', '#123456')
    vi.stubEnv('SENDER_EMAIL', 'noreply@inlifepulse.com')
    const brand = await import('@/lib/config/brand')
    expect(brand.APP_NAME).toBe('inLIFE Pulse')
    expect(brand.BRAND_COLORS.orange).toBe('#123456')
    // SENDER_FROM is derived from APP_NAME + SENDER_EMAIL.
    expect(brand.SENDER_FROM).toBe('inLIFE Pulse <noreply@inlifepulse.com>')
  })

  it('treats a set-but-empty env var as unset (falls back to default)', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', '   ')
    const brand = await import('@/lib/config/brand')
    expect(brand.APP_NAME).toBe('WisdomBI')
  })
})

describe('getAppBaseUrl (MNT-N10)', () => {
  it('uses NEXT_PUBLIC_APP_URL when set, stripping trailing slashes', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com/')
    const { getAppBaseUrl } = await import('@/lib/config/brand')
    expect(getAppBaseUrl()).toBe('https://app.example.com')
  })

  it('falls back to the brand production domain (NOT localhost) in production when unset', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    const { getAppBaseUrl } = await import('@/lib/config/brand')
    expect(getAppBaseUrl()).toBe('https://wisdombi.ai')
  })

  it('falls back to localhost in development when unset', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NODE_ENV', 'development')
    const { getAppBaseUrl } = await import('@/lib/config/brand')
    expect(getAppBaseUrl()).toBe('http://localhost:3000')
  })
})
