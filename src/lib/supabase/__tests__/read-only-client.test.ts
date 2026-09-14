/**
 * The preview harness holds the service-role key against prod. Its client must
 * refuse to write — so a loader that grows a write-through fails loudly the
 * first time the harness runs it.
 */
import { describe, it, expect, vi } from 'vitest'
import { readOnlyClient, ReadOnlyViolation } from '../read-only-client'

function fakeClient() {
  const select = vi.fn()
  const client = {
    tag: 'real',
    from(table: string) {
      return {
        table,
        // Reads `this`, so a proxy that failed to bind the builder would break it.
        select(this: { table: string }, ...args: unknown[]) {
          select(...args)
          const t = this.table
          return { eq: (..._eq: unknown[]) => Promise.resolve({ data: [t], error: null }) }
        },
        insert: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn(),
      }
    },
    rpc: vi.fn(),
    storage: {},
    auth: {},
  }
  return { client, select }
}

describe('readOnlyClient', () => {
  it('reads through, with the builder still bound to itself', async () => {
    const { client, select } = fakeClient()
    const ro = readOnlyClient(client)
    await expect(ro.from('xero_pl_lines').select('*').eq('a', 1)).resolves.toEqual({ data: ['xero_pl_lines'], error: null })
    expect(select).toHaveBeenCalledOnce()
    expect(ro.tag).toBe('real')
  })

  it.each(['insert', 'upsert', 'update', 'delete'])('refuses %s, naming the table', (verb) => {
    const ro = readOnlyClient(fakeClient().client)
    const builder = ro.from('subscription_vendor_actuals') as unknown as Record<string, () => unknown>
    expect(() => builder[verb]()).toThrow(ReadOnlyViolation)
    expect(() => builder[verb]()).toThrow(`${verb} on subscription_vendor_actuals`)
  })

  it('refuses RPCs, storage and auth', () => {
    const ro = readOnlyClient(fakeClient().client)
    expect(() => ro.rpc('activate_forecast_locked')).toThrow('rpc activate_forecast_locked')
    expect(() => ro.storage).toThrow(ReadOnlyViolation)
    expect(() => ro.auth).toThrow(ReadOnlyViolation)
  })
})
