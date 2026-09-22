/**
 * S2 (22 Sep 2026 system diagnostic): the Xero connect flow's return_to must
 * only ever be a same-site path — see src/lib/utils/safe-return-path.ts.
 */
import { describe, it, expect } from 'vitest'
import { safeReturnPath, withReturnParams } from '@/lib/utils/safe-return-path'

describe('safeReturnPath', () => {
  it.each([
    ['/finances/forecast', '/finances/forecast'],
    ['/coach/dashboard', '/coach/dashboard'],
    ['/integrations?tab=xero#top', '/integrations?tab=xero#top'],
    ['  /finances/forecast  ', '/finances/forecast'],
  ])('keeps the same-site path %j', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/phish',
    'http://localhost.evil.example',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/\t/evil.example',
    '/\n/evil.example',
    'finances/forecast',
    '',
    undefined,
    null,
    42,
  ])('replaces %j with the fallback', (input) => {
    expect(safeReturnPath(input)).toBe('/integrations')
    expect(safeReturnPath(input, '/home')).toBe('/home')
  })
})

describe('withReturnParams', () => {
  it('appends to a bare path', () => {
    expect(withReturnParams('/finances/forecast', { success: 'connected', syncing: 'true' }))
      .toBe('/finances/forecast?success=connected&syncing=true')
  })

  it('merges with an existing query instead of producing a second "?"', () => {
    expect(withReturnParams('/finances/forecast?business_id=abc', { success: 'connected' }))
      .toBe('/finances/forecast?business_id=abc&success=connected')
  })

  it('a hostile value still yields a same-site path', () => {
    expect(withReturnParams('https://evil.example', { success: 'connected' })).toBe('/integrations?success=connected')
  })
})
