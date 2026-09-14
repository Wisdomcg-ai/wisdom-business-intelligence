/**
 * A small in-memory stand-in for the Supabase query builder, for the shared
 * pack loaders' tests. Filters (eq, in, gte, gt, lt, lte, is) are APPLIED to
 * the fixture rows, so a loader that filters on the wrong column or id-space
 * gets the wrong rows back — the class of defect these loaders exist to avoid.
 * order() sorts; limit() truncates; select(…, { count, head }) counts.
 *
 * Any write verb throws: every loader under test is meant to read only.
 */

type Row = Record<string, unknown>

export interface FakeTables {
  [table: string]: Row[] | { error: { message: string } }
}

export interface FakeCall {
  table: string
  filters: [string, string, unknown][]
}

export function fakeSupabase(tables: FakeTables) {
  const calls: FakeCall[] = []

  function builder(table: string) {
    const filters: [string, string, unknown][] = []
    let orderBy: { column: string; ascending: boolean } | null = null
    let limitN: number | null = null
    let countMode = false
    let headMode = false
    calls.push({ table, filters })

    const run = () => {
      const fixture = tables[table]
      if (fixture && !Array.isArray(fixture)) return { data: null, error: fixture.error, count: null }
      let rows = [...(fixture ?? [])]
      for (const [op, column, value] of filters) {
        rows = rows.filter((r) => {
          const v = r[column]
          switch (op) {
            case 'eq': return v === value
            case 'in': return (value as unknown[]).includes(v)
            case 'is': return (v ?? null) === value
            case 'gte': return String(v) >= String(value)
            case 'gt': return String(v) > String(value)
            case 'lt': return String(v) < String(value)
            case 'lte': return String(v) <= String(value)
            default: return true
          }
        })
      }
      if (orderBy) {
        const { column, ascending } = orderBy
        rows.sort((a, b) => {
          const av = a[column] as never
          const bv = b[column] as never
          if (av === bv) return 0
          return (av < bv ? -1 : 1) * (ascending ? 1 : -1)
        })
      }
      if (limitN !== null) rows = rows.slice(0, limitN)
      return { data: headMode ? null : rows, error: null, count: countMode ? rows.length : null }
    }

    const chain: Record<string, unknown> = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        countMode = !!opts?.count
        headMode = !!opts?.head
        return chain
      },
      eq(c: string, v: unknown) { filters.push(['eq', c, v]); return chain },
      in(c: string, v: unknown[]) { filters.push(['in', c, v]); return chain },
      is(c: string, v: unknown) { filters.push(['is', c, v]); return chain },
      gte(c: string, v: unknown) { filters.push(['gte', c, v]); return chain },
      gt(c: string, v: unknown) { filters.push(['gt', c, v]); return chain },
      lt(c: string, v: unknown) { filters.push(['lt', c, v]); return chain },
      lte(c: string, v: unknown) { filters.push(['lte', c, v]); return chain },
      order(c: string, o?: { ascending?: boolean }) { orderBy = { column: c, ascending: o?.ascending !== false }; return chain },
      limit(n: number) { limitN = n; return chain },
      maybeSingle() {
        const r = run()
        return Promise.resolve({ data: r.error ? null : (r.data ?? [])[0] ?? null, error: r.error })
      },
      single() {
        const r = run()
        return Promise.resolve({ data: r.error ? null : (r.data ?? [])[0] ?? null, error: r.error })
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject)
      },
    }
    for (const verb of ['insert', 'upsert', 'update', 'delete']) {
      chain[verb] = () => { throw new Error(`fake supabase: ${verb} on ${table} — loaders must not write`) }
    }
    return chain
  }

  return {
    calls,
    from: (table: string) => builder(table),
    rpc: () => { throw new Error('fake supabase: rpc — loaders must not write') },
  }
}
