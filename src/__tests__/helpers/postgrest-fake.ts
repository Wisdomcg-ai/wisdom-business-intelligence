/**
 * An in-memory PostgREST that is faithful exactly where paging goes wrong.
 *
 *  - Every list response is cut to Max rows (1,000 unless a table sets it lower)
 *    and still carries `error: null`, as hosted Supabase does.
 *  - A read with no ORDER BY comes back in STORAGE order — the table's array
 *    order, oldest insert first — and `rewrite()` models an UPDATE the way the
 *    heap does it: the new row version lands at the END of storage. A sync
 *    between two page requests therefore moves rows under an offset reader,
 *    which is the double-count / skip an ORDER BY-less `.range()` pager suffers.
 *  - A request is answered in PostgREST's order: filters → ORDER BY → offset
 *    (`range`) → limit → the Max rows cut → the selected columns.
 *
 * Only the builder methods the readers under test use exist. Anything else is
 * "not a function" and fails the test loudly, so a reader that grows a new
 * filter cannot pass by having the fake ignore it.
 */

export type FakeRow = Record<string, unknown>

type Filter = (row: FakeRow) => boolean

export interface FakeTableOptions {
  /** This table's Max rows cut (hosted default 1,000). */
  maxRows?: number
  /** 0-based request numbers (list reads only) answered with an error instead of rows. */
  failOnRequest?: number[]
  /** 0-based request numbers whose await rejects, like a dropped connection. */
  throwOnRequest?: number[]
  /** Runs before the table answers request `n` — mutate storage to model concurrent writes. */
  beforeRequest?: (n: number, table: FakeTable) => void
}

export interface RecordedRequest {
  table: string
  select: string
  filters: string[]
  order: Array<{ column: string; ascending: boolean }>
  limit: number | null
  range: [number, number] | null
  rowsReturned: number
}

/** Code-unit order for strings (how Postgres orders lowercase uuids and ISO dates), numeric for numbers. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const x = String(a)
  const y = String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

export class FakeTable {
  rows: FakeRow[]
  requests = 0

  constructor(
    readonly name: string,
    rows: FakeRow[],
    readonly options: FakeTableOptions = {},
  ) {
    this.rows = rows.map((r) => ({ ...r }))
  }

  /** An UPDATE: the matching rows get `patch` and move to the end of storage. */
  rewrite(match: (row: FakeRow) => boolean, patch: FakeRow = {}): void {
    const moved = this.rows.filter(match).map((r) => ({ ...r, ...patch }))
    this.rows = [...this.rows.filter((r) => !match(r)), ...moved]
  }

  insert(row: FakeRow): void {
    this.rows.push({ ...row })
  }

  delete(match: (row: FakeRow) => boolean): void {
    this.rows = this.rows.filter((r) => !match(r))
  }
}

export class FakePostgrest {
  readonly tables = new Map<string, FakeTable>()
  readonly log: RecordedRequest[] = []

  table(name: string, rows: FakeRow[], options?: FakeTableOptions): FakeTable {
    const t = new FakeTable(name, rows, options)
    this.tables.set(name, t)
    return t
  }

  requestsTo(table: string): RecordedRequest[] {
    return this.log.filter((r) => r.table === table)
  }

  from(name: string) {
    const table = this.tables.get(name) ?? this.table(name, [])
    return new FakeQuery(this, table)
  }
}

class FakeQuery {
  private columns = '*'
  private readonly filters: Array<{ label: string; test: Filter }> = []
  private readonly orders: Array<{ column: string; ascending: boolean }> = []
  private limitCount: number | null = null
  private rangeBounds: [number, number] | null = null

  constructor(
    private readonly db: FakePostgrest,
    private readonly table: FakeTable,
  ) {}

  select(columns = '*') {
    if (columns.includes('(')) throw new Error(`postgrest-fake: embedded selects are not modelled (${columns})`)
    this.columns = columns
    return this
  }

  private where(label: string, test: Filter) {
    this.filters.push({ label, test })
    return this
  }

  eq(column: string, value: unknown) {
    return this.where(`${column}=eq.${value}`, (r) => r[column] === value)
  }

  neq(column: string, value: unknown) {
    return this.where(`${column}=neq.${value}`, (r) => r[column] !== value)
  }

  in(column: string, values: unknown[]) {
    return this.where(`${column}=in.(${values.join(',')})`, (r) => values.includes(r[column]))
  }

  gt(column: string, value: unknown) {
    return this.where(`${column}=gt.${value}`, (r) => r[column] != null && compare(r[column], value) > 0)
  }

  gte(column: string, value: unknown) {
    return this.where(`${column}=gte.${value}`, (r) => r[column] != null && compare(r[column], value) >= 0)
  }

  lte(column: string, value: unknown) {
    return this.where(`${column}=lte.${value}`, (r) => r[column] != null && compare(r[column], value) <= 0)
  }

  is(column: string, value: null | boolean) {
    return this.where(`${column}=is.${value}`, (r) => (value === null ? r[column] == null : r[column] === value))
  }

  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null) throw new Error(`postgrest-fake: not.${operator}.${value} is not modelled`)
    return this.where(`${column}=not.is.null`, (r) => r[column] != null)
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true })
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  range(from: number, to: number) {
    this.rangeBounds = [from, to]
    return this
  }

  /** Filters and ORDER BY over current storage — everything before offset, limit and the cut. */
  private matching(): FakeRow[] {
    let rows = this.table.rows.filter((r) => this.filters.every((f) => f.test(r)))
    if (this.orders.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of this.orders) {
          const x = a[column]
          const y = b[column]
          if (x == null && y == null) continue
          // Postgres: NULLS LAST ascending, NULLS FIRST descending.
          if (x == null) return ascending ? 1 : -1
          if (y == null) return ascending ? -1 : 1
          const c = compare(x, y)
          if (c !== 0) return ascending ? c : -c
        }
        return 0
      })
    }
    return rows
  }

  /** Offset then limit, as PostgREST applies them after ORDER BY. */
  private window(rows: FakeRow[]): FakeRow[] {
    let out = rows
    if (this.rangeBounds) out = out.slice(this.rangeBounds[0], this.rangeBounds[1] + 1)
    if (this.limitCount !== null) out = out.slice(0, this.limitCount)
    return out
  }

  private project(rows: FakeRow[]): FakeRow[] {
    if (this.columns.trim() === '*') return rows.map((r) => ({ ...r }))
    const cols = this.columns.split(',').map((c) => c.trim()).filter(Boolean)
    return rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])))
  }

  private respond(): { data: FakeRow[] | null; error: { message: string } | null } {
    const n = this.table.requests++
    const opts = this.table.options
    opts.beforeRequest?.(n, this.table)
    if (opts.throwOnRequest?.includes(n)) throw new Error(`postgrest-fake: ${this.table.name} request ${n} dropped`)

    const rows = this.window(this.matching()).slice(0, opts.maxRows ?? 1000)

    const failed = opts.failOnRequest?.includes(n) ?? false
    this.db.log.push({
      table: this.table.name,
      select: this.columns,
      filters: this.filters.map((f) => f.label),
      order: [...this.orders],
      limit: this.limitCount,
      range: this.rangeBounds,
      rowsReturned: failed ? 0 : rows.length,
    })
    if (failed) return { data: null, error: { message: `simulated ${this.table.name} failure on request ${n}` } }
    return { data: this.project(rows), error: null }
  }

  then<T1 = unknown, T2 = never>(
    onFulfilled?: ((value: { data: FakeRow[] | null; error: { message: string } | null }) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    return Promise.resolve().then(() => this.respond()).then(onFulfilled, onRejected)
  }

  async maybeSingle() {
    const rows = this.window(this.matching())
    if (rows.length > 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
    return { data: rows[0] ? this.project(rows)[0] : null, error: null }
  }

  async single() {
    const rows = this.window(this.matching())
    if (rows.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
    return { data: this.project(rows)[0], error: null }
  }
}

/**
 * A lowercase uuid whose code-unit order is `n`'s order — ids that sort the way
 * Postgres sorts a uuid column, so a test can say which rows come first.
 */
export function uuidAt(n: number, prefix = '00000000'): string {
  const hex = n.toString(16).padStart(12, '0')
  return `${prefix}-0000-4000-8000-${hex}`
}
