/**
 * Phase 46 Plan 46-04 — SEC-04 PART 2 strictness regression tests.
 *
 * RED state: tests 1, 2, 3, and "throws when only SUPABASE_SERVICE_KEY is set"
 * fail because the current decrypt() has 3 silent fallbacks and
 * getEncryptionKey() falls back to SUPABASE_SERVICE_KEY PBKDF2 derivation.
 *
 * GREEN state after Task 4: all 7 pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_ENV = process.env

async function importEncryption() {
  vi.resetModules()
  return await import('@/lib/utils/encryption')
}

describe('SEC-04 PART 2: decrypt() throws on all malformed inputs', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      APP_SECRET_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
    }
  })
  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('throws on plaintext (no colon) — fallback 1 removed', async () => {
    const { decrypt } = await importEncryption()
    expect(() => decrypt('plaintext-no-colon')).toThrow()
  })

  it('throws on input with only 2 parts — fallback 2 removed', async () => {
    const { decrypt } = await importEncryption()
    expect(() => decrypt('one:two')).toThrow()
  })

  it('throws on input with valid shape but invalid auth tag — fallback 3 removed', async () => {
    const { decrypt } = await importEncryption()
    expect(() => decrypt('aGVsbG8=:d29ybGQ=:Zm9v')).toThrow()
  })

  it('round-trip: decrypt(encrypt(x)) === x', async () => {
    const { encrypt, decrypt } = await importEncryption()
    const ct = encrypt('hello world')
    expect(decrypt(ct)).toBe('hello world')
  })

  it('returns empty string for empty input (preserved behavior)', async () => {
    const { decrypt } = await importEncryption()
    expect(decrypt('')).toBe('')
  })
})

describe('SEC-04 PART 2: getEncryptionKey() requires explicit key', () => {
  beforeEach(() => {
    // Strip ALL three key vars; leave only SUPABASE_SERVICE_KEY (the
    // soon-to-be-removed fallback). Test asserts it now throws instead
    // of silently deriving via PBKDF2.
    process.env = { ...ORIGINAL_ENV }
    delete (process.env as any).APP_SECRET_KEY
    delete (process.env as any).ENCRYPTION_KEY
    process.env.SUPABASE_SERVICE_KEY = 'placeholder-service-key'
  })
  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('throws when only SUPABASE_SERVICE_KEY is set — fallback removed', async () => {
    // Importing encrypt forces getEncryptionKey() to run via the
    // round-trip; if the throw is in place, this throws on call.
    const { encrypt } = await importEncryption()
    expect(() => encrypt('test')).toThrow(/APP_SECRET_KEY/)
  })

  it('succeeds when APP_SECRET_KEY is set (64 hex chars)', async () => {
    process.env.APP_SECRET_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000'
    const { encrypt, decrypt } = await importEncryption()
    const ct = encrypt('hello')
    expect(decrypt(ct)).toBe('hello')
  })
})
