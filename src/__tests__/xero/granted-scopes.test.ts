/**
 * granted-scopes.ts — deriving the scopes a Xero token actually carries.
 *
 * Why this matters: adding `accounting.budgets.read` to the consent request
 * (PR 1 of XERO-BUDGET-SEED-PLAN.md) changes nothing for an org until it
 * re-consents. These helpers are how every connection write records what the
 * org has granted, so the reconnect round can be tracked per org.
 */
import { describe, it, expect } from 'vitest'
import {
  XERO_BUDGETS_SCOPE,
  parseScopeString,
  readScopesFromAccessToken,
  resolveGrantedScopes,
  hasScope,
  grantedScopesColumns,
  isMissingColumnError,
} from '@/lib/xero/granted-scopes'

/** Build an unsigned JWT-shaped token with the given payload. */
function fakeJwt(payload: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.signature`
}

describe('parseScopeString', () => {
  it('splits on whitespace, trims, de-duplicates and sorts', () => {
    expect(parseScopeString('  offline_access accounting.reports.read  offline_access\naccounting.budgets.read ')).toEqual([
      'accounting.budgets.read',
      'accounting.reports.read',
      'offline_access',
    ])
  })
  it('returns [] for non-strings and empty strings', () => {
    expect(parseScopeString(undefined)).toEqual([])
    expect(parseScopeString(null)).toEqual([])
    expect(parseScopeString(42)).toEqual([])
    expect(parseScopeString('')).toEqual([])
  })
})

describe('readScopesFromAccessToken', () => {
  it('reads an array `scope` claim from the JWT payload', () => {
    const token = fakeJwt({ scope: ['offline_access', 'accounting.budgets.read', 'accounting.reports.read'] })
    expect(readScopesFromAccessToken(token)).toEqual([
      'accounting.budgets.read',
      'accounting.reports.read',
      'offline_access',
    ])
  })
  it('accepts a space-delimited string `scope` claim too', () => {
    const token = fakeJwt({ scope: 'accounting.reports.read offline_access' })
    expect(readScopesFromAccessToken(token)).toEqual(['accounting.reports.read', 'offline_access'])
  })
  it('returns null when the token is not a JWT, has no payload, or has no scope claim', () => {
    expect(readScopesFromAccessToken('opaque-token')).toBeNull()
    expect(readScopesFromAccessToken('a..c')).toBeNull()
    expect(readScopesFromAccessToken('a.!!!not-base64-json!!!.c')).toBeNull()
    expect(readScopesFromAccessToken(fakeJwt({ sub: 'x' }))).toBeNull()
    expect(readScopesFromAccessToken(fakeJwt({ scope: [] }))).toBeNull()
    expect(readScopesFromAccessToken(fakeJwt({ scope: 7 }))).toBeNull()
    expect(readScopesFromAccessToken(fakeJwt('just a string'))).toBeNull()
    expect(readScopesFromAccessToken(undefined)).toBeNull()
  })
  it('ignores non-string entries in an array claim', () => {
    const token = fakeJwt({ scope: ['offline_access', 3, null, 'accounting.budgets.read'] })
    expect(readScopesFromAccessToken(token)).toEqual(['accounting.budgets.read', 'offline_access'])
  })
})

describe('resolveGrantedScopes', () => {
  it('prefers the token response scope string', () => {
    const token = fakeJwt({ scope: ['from.jwt'] })
    expect(resolveGrantedScopes({ scope: 'from.response', accessToken: token })).toEqual(['from.response'])
  })
  it('falls back to the JWT claim when the response has no scope', () => {
    const token = fakeJwt({ scope: ['from.jwt'] })
    expect(resolveGrantedScopes({ accessToken: token })).toEqual(['from.jwt'])
    expect(resolveGrantedScopes({ scope: '', accessToken: token })).toEqual(['from.jwt'])
  })
  it('returns null when neither source yields scopes (so callers leave the column alone)', () => {
    expect(resolveGrantedScopes({})).toBeNull()
    expect(resolveGrantedScopes({ scope: undefined, accessToken: 'opaque' })).toBeNull()
  })
})

describe('hasScope', () => {
  it('is true only for a known list that includes the scope', () => {
    expect(hasScope(['offline_access', XERO_BUDGETS_SCOPE], XERO_BUDGETS_SCOPE)).toBe(true)
    expect(hasScope(['offline_access'], XERO_BUDGETS_SCOPE)).toBe(false)
    expect(hasScope(null, XERO_BUDGETS_SCOPE)).toBe(false)
    expect(hasScope(undefined, XERO_BUDGETS_SCOPE)).toBe(false)
  })
})

describe('grantedScopesColumns', () => {
  it('produces both columns for a known list', () => {
    const now = new Date('2026-09-05T10:00:00.000Z')
    expect(grantedScopesColumns(['a', 'b'], now)).toEqual({
      granted_scopes: ['a', 'b'],
      scopes_granted_at: '2026-09-05T10:00:00.000Z',
    })
  })
  it('produces NO columns for unknown/empty, so a spread into an update leaves the row untouched', () => {
    expect(grantedScopesColumns(null)).toEqual({})
    expect(grantedScopesColumns([])).toEqual({})
    expect({ expires_at: 'x', ...grantedScopesColumns(null) }).toEqual({ expires_at: 'x' })
  })
})

describe('isMissingColumnError', () => {
  it('recognises Postgres undefined_column and PostgREST stale-schema-cache errors', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column "granted_scopes" of relation "xero_connections" does not exist' })).toBe(true)
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'granted_scopes' column of 'xero_connections' in the schema cache" })).toBe(true)
  })
  it('recognises the message shape even without a code, but only for our columns', () => {
    expect(isMissingColumnError({ message: "Could not find the 'scopes_granted_at' column" })).toBe(true)
    expect(isMissingColumnError({ message: "Could not find the 'tenant_name' column" })).toBe(false)
  })
  it('is false for other failures and non-objects', () => {
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value' })).toBe(false)
    expect(isMissingColumnError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError('granted_scopes column')).toBe(false)
  })
})
