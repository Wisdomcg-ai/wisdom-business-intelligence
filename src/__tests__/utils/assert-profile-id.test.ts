/**
 * R1b — write-path id guardrail (assertBusinessProfileId)
 *
 * Contract: this guard is the last line of defence before money-table writes
 * (xero_pl_lines / xero_bs_lines), whose business_id MUST reference
 * business_profiles.id. It must:
 *   - resolve silently (no throw) when profileId is a real business_profiles row;
 *   - throw loudly with diagnostics when profileId resolves to nothing
 *     (the wrong-id-class case: a businesses.id or user-auth id leaking through
 *     resolveBusinessIds()'s echo fallback);
 *   - throw when the lookup itself errors (fail closed, never write on doubt);
 *   - throw on a missing / non-string profileId without even hitting the DB.
 *
 * The diagnostics matter: the thrown message must name the offending id and the
 * sibling ids so a prod incident is debuggable from the log line alone.
 */
import { describe, it, expect, vi } from 'vitest'
import { assertBusinessProfileId } from '@/lib/utils/assert-profile-id'

/**
 * Minimal supabase stub for `.from(t).select(c).eq(col, val).maybeSingle()`.
 * Records the table/column/value used so we can assert the guard queries
 * business_profiles by id.
 */
function makeSb(result: { data: any; error: any }) {
  const calls: { table?: string; column?: string; value?: string } = {}
  const sb = {
    from: (table: string) => {
      calls.table = table
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            calls.column = column
            calls.value = value
            return {
              maybeSingle: () => Promise.resolve(result),
            }
          },
        }),
      }
    },
  }
  return { sb, calls }
}

const VALID_PROFILE_ID = '11111111-1111-1111-1111-111111111111'
const WRONG_CLASS_ID = '22222222-2222-2222-2222-222222222222' // e.g. a businesses.id

describe('assertBusinessProfileId', () => {
  it('resolves silently when profileId is a real business_profiles row', async () => {
    const { sb, calls } = makeSb({ data: { id: VALID_PROFILE_ID }, error: null })
    await expect(
      assertBusinessProfileId(sb, VALID_PROFILE_ID, { input: VALID_PROFILE_ID, bizId: WRONG_CLASS_ID }),
    ).resolves.toBeUndefined()
    // Confirms it queries business_profiles by id (not business_id).
    expect(calls.table).toBe('business_profiles')
    expect(calls.column).toBe('id')
    expect(calls.value).toBe(VALID_PROFILE_ID)
  })

  it('throws on the wrong-id-class case (no matching business_profiles row)', async () => {
    const { sb } = makeSb({ data: null, error: null })
    await expect(
      assertBusinessProfileId(sb, WRONG_CLASS_ID, { input: WRONG_CLASS_ID, bizId: WRONG_CLASS_ID }),
    ).rejects.toThrow(/not a valid business_profiles\.id/)
  })

  it('includes the offending id and sibling diagnostics in the thrown message', async () => {
    const { sb } = makeSb({ data: null, error: null })
    await expect(
      assertBusinessProfileId(sb, WRONG_CLASS_ID, { input: 'user-auth-id-xyz', bizId: 'biz-abc' }),
    ).rejects.toThrow(/user-auth-id-xyz[\s\S]*biz-abc|biz-abc/)
    // And the id itself must appear so the log line is self-debuggable.
    await expect(
      assertBusinessProfileId(sb, WRONG_CLASS_ID, { input: 'user-auth-id-xyz', bizId: 'biz-abc' }),
    ).rejects.toThrow(WRONG_CLASS_ID)
  })

  it('fails closed when the lookup itself errors (never writes on doubt)', async () => {
    const { sb } = makeSb({ data: null, error: { message: 'connection reset' } })
    await expect(assertBusinessProfileId(sb, VALID_PROFILE_ID)).rejects.toThrow(
      /lookup failed[\s\S]*connection reset/,
    )
  })

  it('throws without hitting the DB on a missing profileId', async () => {
    const fromSpy = vi.fn()
    const sb = { from: fromSpy }
    await expect(assertBusinessProfileId(sb, '' as string)).rejects.toThrow(
      /missing or not a string/,
    )
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('throws without hitting the DB on a non-string profileId', async () => {
    const fromSpy = vi.fn()
    const sb = { from: fromSpy }
    await expect(
      assertBusinessProfileId(sb, undefined as unknown as string),
    ).rejects.toThrow(/missing or not a string/)
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
