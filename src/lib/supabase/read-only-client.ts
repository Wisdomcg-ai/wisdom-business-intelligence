/**
 * A Supabase client that can only read.
 *
 * For tooling that holds the service-role key against prod — the preview
 * harness above all — where "this script only reads" should be enforced rather
 * than promised. Every write verb on a table builder (insert, upsert, update,
 * delete) and every RPC throws before a request is built, naming the table, so
 * a loader that grows a write-through fails loudly the first time the harness
 * runs it instead of quietly writing to prod.
 *
 * Storage and auth admin are refused outright; nothing that renders a pack
 * needs them.
 *
 * That Proxy is the second layer, not the guarantee: it can only refuse the
 * doors it knows about, and supabase-js has others (`client.rest` is the
 * PostgrestClient itself, and `rest.from(t).insert()` sent a real POST past an
 * earlier version of it). The guarantee is `readOnlyFetch`, handed to
 * createClient as `global.fetch`: PostgREST reads are GET and HEAD, and every
 * write — insert, upsert, update, delete, rpc, an auth token refresh — is a
 * POST, PATCH or DELETE, so refusing those at the transport refuses them
 * whichever door they came through. Use `createReadOnlyClient`, which does both.
 */

import { createClient } from '@supabase/supabase-js'

const WRITE_VERBS = new Set(['insert', 'upsert', 'update', 'delete'])

export class ReadOnlyViolation extends Error {
  constructor(what: string) {
    super(`read-only client: refused ${what}`)
    this.name = 'ReadOnlyViolation'
  }
}

const READ_METHODS = new Set(['GET', 'HEAD'])

/**
 * A fetch that lets only GET and HEAD leave, and nothing to a Xero host: taking
 * a Xero token can refresh and rotate it, a write that races the refresh cron.
 * A refused request throws before `base` is called. (supabase-js turns a
 * throwing fetch into an `{ error }` result, which every shared loader throws
 * on.)
 */
export function readOnlyFetch(base: typeof fetch = globalThis.fetch): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const request = typeof input === 'object' && !(input instanceof URL) ? input : null
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    if (/(^|\.)xero\.com$/i.test(url.hostname)) {
      throw new ReadOnlyViolation(`${method} to ${url.hostname} (never calls Xero)`)
    }
    if (!READ_METHODS.has(method)) {
      throw new ReadOnlyViolation(`${method} ${url.pathname}`)
    }
    return base(input, init)
  }) as typeof fetch
}

/** A service-role client that cannot write: read-only at the transport, and at the builder. */
export function createReadOnlyClient(url: string, key: string, base?: typeof fetch) {
  return readOnlyClient(createClient(url, key, { global: { fetch: readOnlyFetch(base) } }))
}

export function readOnlyClient<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from' || prop === 'schema') {
        return (...args: unknown[]) => {
          const method = Reflect.get(target, prop, receiver) as (...a: unknown[]) => object
          const inner = method.apply(target, args)
          if (prop === 'schema') return readOnlyClient(inner)
          const table = String(args[0])
          return new Proxy(inner, {
            get(builder, verb, r) {
              if (typeof verb === 'string' && WRITE_VERBS.has(verb)) {
                return () => { throw new ReadOnlyViolation(`${verb} on ${table}`) }
              }
              const v = Reflect.get(builder, verb, r)
              return typeof v === 'function' ? v.bind(builder) : v
            },
          })
        }
      }
      if (prop === 'rpc') {
        return (fn: unknown) => { throw new ReadOnlyViolation(`rpc ${String(fn)}`) }
      }
      if (prop === 'rest' || prop === 'storage' || prop === 'auth' || prop === 'functions' || prop === 'channel' || prop === 'realtime') {
        throw new ReadOnlyViolation(String(prop))
      }
      const v = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}
