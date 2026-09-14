/**
 * The preview harness holds the service-role key against prod. Its client must
 * refuse to write — so a loader that grows a write-through fails loudly the
 * first time the harness runs it.
 */
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createReadOnlyClient, readOnlyClient, readOnlyFetch, ReadOnlyViolation } from '../read-only-client'

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

  it('refuses RPCs, storage, auth and the raw PostgrestClient', () => {
    const ro = readOnlyClient({ ...fakeClient().client, rest: {} })
    expect(() => ro.rpc('activate_forecast_locked')).toThrow('rpc activate_forecast_locked')
    expect(() => ro.storage).toThrow(ReadOnlyViolation)
    expect(() => ro.auth).toThrow(ReadOnlyViolation)
    expect(() => ro.rest).toThrow(ReadOnlyViolation)
  })
})

/**
 * The Proxy above can only refuse the doors it knows about — a real client's
 * `rest.from(t).insert()` once walked past it and sent a POST. So the guarantee
 * is the transport, and it is tested on a REAL supabase-js client: whatever the
 * call, the only requests that reach the network are GET and HEAD.
 */
describe('readOnlyFetch on a real supabase-js client', () => {
  function network() {
    const sent: { method: string; url: string }[] = []
    const base = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      sent.push({ method: (init?.method ?? 'GET').toUpperCase(), url })
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/0' } })
    }) as unknown as typeof fetch
    return { sent, base }
  }

  it('lets reads through, as GET and HEAD', async () => {
    const { sent, base } = network()
    const ro = createReadOnlyClient('http://supabase.local', 'service-key', base)
    const read = await ro.from('xero_pl_lines').select('*').eq('business_id', 'b1')
    expect(read.error).toBeNull()
    await ro.from('xero_pl_lines').select('*', { count: 'exact', head: true })
    expect(sent.map((r) => r.method)).toEqual(['GET', 'HEAD'])
    expect(sent[0].url).toContain('/rest/v1/xero_pl_lines?select=*&business_id=eq.b1')
  })

  it('sends no write, through any door', async () => {
    const { sent, base } = network()
    // Transport only — no Proxy — so each call reaches supabase-js's own
    // request building and the fetch is the one thing standing in the way.
    const raw = createClient('http://supabase.local', 'service-key', { global: { fetch: readOnlyFetch(base) } })
    // `rest` is protected in the types and an ordinary property at runtime.
    const rest = (raw as unknown as { rest: Pick<typeof raw, 'from'> }).rest
    const writes = [
      raw.from('t').insert({ a: 1 }),
      raw.from('t').upsert({ a: 1 }),
      raw.from('t').update({ a: 1 }).eq('a', 1),
      raw.from('t').delete().eq('a', 1),
      rest.from('t').insert({ a: 1 }),
      raw.schema('public').from('t').insert({ a: 1 }),
      raw.rpc('activate_forecast_locked', { p: 1 }),
    ]
    for (const w of writes) {
      const { error } = await w
      expect(error?.message).toContain('read-only client: refused')
    }
    expect(sent).toEqual([])
  })

  it('the full client still refuses rest at the builder, and the transport behind it', async () => {
    const { sent, base } = network()
    const ro = createReadOnlyClient('http://supabase.local', 'service-key', base)
    expect(() => (ro as unknown as { rest: unknown }).rest).toThrow(ReadOnlyViolation)
    expect(() => ro.from('t').insert({ a: 1 })).toThrow('insert on t')
    expect(sent).toEqual([])
  })

  it('refuses any Xero host, even a GET', async () => {
    const { sent, base } = network()
    const f = readOnlyFetch(base)
    await expect(f('https://api.xero.com/api.xro/2.0/Reports/BalanceSheet')).rejects.toThrow(ReadOnlyViolation)
    await expect(f('https://identity.xero.com/connect/revocation', { method: 'POST' })).rejects.toThrow('identity.xero.com')
    await expect(f(new Request('http://supabase.local/rest/v1/t', { method: 'PATCH' }))).rejects.toThrow('PATCH /rest/v1/t')
    expect(sent).toEqual([])
  })
})
