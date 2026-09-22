/**
 * A Supabase client double whose reads honour their filters.
 *
 * Each table is an in-memory array of rows. A read returns only the rows that
 * every applied filter matches, the way PostgREST would, and a query method the
 * double does not implement THROWS instead of quietly returning every row.
 *
 * Why it exists: verifyBusinessAccess refused every active team member whenever
 * a caller passed a business_profiles.id — its membership check filtered
 * business_users on the raw id, and business_users.business_id is
 * businesses-space — while its characterization test passed, because that fake
 * answered the membership read with the same row whatever business_id it was
 * asked for. A filter-blind fake makes every id look right; dual-ID defects only
 * exist in the filter value.
 *
 * Writes (insert / update / upsert / delete) are recorded in `writes` and applied
 * to the in-memory rows when the query is awaited.
 */

export type Row = Record<string, unknown>

export type FilterOp = 'eq' | 'neq' | 'in' | 'is'

export interface Filter {
  op: FilterOp
  column: string
  value: unknown
}

export interface FakeRead {
  table: string
  filters: Filter[]
}

export interface FakeWrite {
  table: string
  op: 'insert' | 'update' | 'upsert' | 'delete'
  values: unknown
  filters: Filter[]
}

export interface PostgrestLikeError {
  message: string
  code?: string
}

export interface FilterAwareSupabase {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: PostgrestLikeError | null }>
  /** The live rows, by table. Writes land here. */
  tables: Record<string, Row[]>
  /** Every read executed, in order, with the filters it carried. */
  reads: FakeRead[]
  /** Every write executed, in order. */
  writes: FakeWrite[]
  /** Make every query on `table` fail with a PostgREST-shaped error. */
  failTable: (table: string, error?: PostgrestLikeError) => void
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(({ op, column, value }) => {
    const cell = row[column]
    switch (op) {
      case 'eq':
        return cell === value
      case 'neq':
        return cell !== value
      case 'in':
        return (value as unknown[]).includes(cell)
      case 'is':
        // PostgREST `is` compares against null / true / false.
        return value === null ? cell === null || cell === undefined : cell === value
    }
  })
}

const QUERY_METHODS = new Set([
  'select',
  'eq',
  'neq',
  'in',
  'is',
  'order',
  'limit',
  'insert',
  'update',
  'upsert',
  'delete',
  'maybeSingle',
  'single',
  'then',
])

export function createFilterAwareSupabase(
  seed: Record<string, Row[]> = {},
  options: { rpc?: Record<string, (args: Record<string, unknown> | undefined) => unknown> } = {},
): FilterAwareSupabase {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }))
  const reads: FakeRead[] = []
  const writes: FakeWrite[] = []
  const failing = new Map<string, PostgrestLikeError>()

  function from(table: string) {
    const filters: Filter[] = []
    let write: { op: FakeWrite['op']; values: unknown; onConflict?: string } | null = null
    let limit: number | null = null
    const ordering: Array<{ column: string; ascending: boolean }> = []

    function execute(): { data: Row[] | null; error: PostgrestLikeError | null } {
      const failure = failing.get(table)
      if (failure) return { data: null, error: failure }
      const rows = (tables[table] ??= [])

      if (!write) {
        reads.push({ table, filters: [...filters] })
        let found = rows.filter((r) => matches(r, filters))
        for (const { column, ascending } of [...ordering].reverse()) {
          found = [...found].sort((a, b) => {
            const x = a[column] as any
            const y = b[column] as any
            if (x === y) return 0
            return (x > y ? 1 : -1) * (ascending ? 1 : -1)
          })
        }
        if (limit !== null) found = found.slice(0, limit)
        return { data: found.map((r) => ({ ...r })), error: null }
      }

      writes.push({ table, op: write.op, values: write.values, filters: [...filters] })
      const incoming = (Array.isArray(write.values) ? write.values : [write.values]) as Row[]
      switch (write.op) {
        case 'insert': {
          const inserted = incoming.map((r) => ({ ...r }))
          rows.push(...inserted)
          return { data: inserted, error: null }
        }
        case 'upsert': {
          const keys = (write.onConflict ?? 'id').split(',').map((k) => k.trim())
          const out: Row[] = []
          for (const r of incoming) {
            const existing = rows.find((x) => keys.every((k) => x[k] === r[k]))
            if (existing) Object.assign(existing, r)
            else rows.push({ ...r })
            out.push({ ...(existing ?? r) })
          }
          return { data: out, error: null }
        }
        case 'update': {
          const hit = rows.filter((r) => matches(r, filters))
          for (const r of hit) Object.assign(r, write.values as Row)
          return { data: hit.map((r) => ({ ...r })), error: null }
        }
        case 'delete': {
          const kept = rows.filter((r) => !matches(r, filters))
          const removed = rows.filter((r) => matches(r, filters))
          tables[table] = kept
          return { data: removed, error: null }
        }
      }
    }

    const builder: Record<string, unknown> = {
      select: () => proxy,
      eq: (column: string, value: unknown) => (filters.push({ op: 'eq', column, value }), proxy),
      neq: (column: string, value: unknown) => (filters.push({ op: 'neq', column, value }), proxy),
      in: (column: string, value: unknown[]) => (filters.push({ op: 'in', column, value }), proxy),
      is: (column: string, value: unknown) => (filters.push({ op: 'is', column, value }), proxy),
      order: (column: string, opts?: { ascending?: boolean }) => (
        ordering.push({ column, ascending: opts?.ascending !== false }), proxy
      ),
      limit: (n: number) => ((limit = n), proxy),
      insert: (values: unknown) => ((write = { op: 'insert', values }), proxy),
      update: (values: unknown) => ((write = { op: 'update', values }), proxy),
      upsert: (values: unknown, opts?: { onConflict?: string }) => (
        (write = { op: 'upsert', values, onConflict: opts?.onConflict }), proxy
      ),
      delete: () => ((write = { op: 'delete', values: undefined }), proxy),
      maybeSingle: async () => {
        const { data, error } = execute()
        if (error) return { data: null, error }
        if (data!.length > 1) {
          return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
        }
        return { data: data![0] ?? null, error: null }
      },
      single: async () => {
        const { data, error } = execute()
        if (error) return { data: null, error }
        if (data!.length !== 1) {
          return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
        }
        return { data: data![0], error: null }
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        try {
          const { data, error } = execute()
          return Promise.resolve({ data, error, count: data?.length ?? null }).then(resolve, reject)
        } catch (e) {
          return Promise.reject(e).then(resolve, reject)
        }
      },
    }

    const proxy: any = new Proxy(builder, {
      get(target, prop) {
        if (typeof prop === 'symbol') return undefined
        if (QUERY_METHODS.has(prop)) return target[prop]
        throw new Error(
          `filter-aware-supabase: .${prop}() is not implemented on "${table}" — ` +
            'implement it in src/__tests__/helpers/filter-aware-supabase.ts rather than let the query run unfiltered',
        )
      },
    })
    return proxy
  }

  return {
    from,
    rpc: async (fn, args) => {
      const handler = options.rpc?.[fn]
      if (!handler) throw new Error(`filter-aware-supabase: rpc "${fn}" is not stubbed`)
      return { data: handler(args), error: null }
    },
    get tables() {
      return tables
    },
    reads,
    writes,
    failTable: (table, error = { message: `${table} is unavailable`, code: '57014' }) => {
      failing.set(table, error)
    },
  }
}
