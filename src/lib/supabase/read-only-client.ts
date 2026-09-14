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
 */

const WRITE_VERBS = new Set(['insert', 'upsert', 'update', 'delete'])

export class ReadOnlyViolation extends Error {
  constructor(what: string) {
    super(`read-only client: refused ${what}`)
    this.name = 'ReadOnlyViolation'
  }
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
      if (prop === 'storage' || prop === 'auth' || prop === 'functions' || prop === 'channel' || prop === 'realtime') {
        throw new ReadOnlyViolation(String(prop))
      }
      const v = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}
