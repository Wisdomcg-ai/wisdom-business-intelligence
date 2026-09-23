/**
 * readAllRows — every matching row or an explicit failure, against a PostgREST
 * fake that cuts every response to Max rows and answers un-ORDERed reads in
 * storage order.
 */
import { describe, it, expect } from 'vitest'
import { readAllRows, IncompleteReadError, MAX_PAGES, PAGE_ROWS } from '../read-all-rows'
import { FakePostgrest, uuidAt, type FakeRow } from '@/__tests__/helpers/postgrest-fake'

const rowsNumbered = (count: number, extra: (i: number) => FakeRow = () => ({})): FakeRow[] =>
  Array.from({ length: count }, (_, i) => ({ id: uuidAt(i), amount: 1, ...extra(i) }))

/** Deterministic shuffle, so "storage order is not id order" is the same every run. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  let seed = 7
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647
    const j = seed % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const read = (db: FakePostgrest, table = 'lines', options?: { maxPages?: number }) =>
  readAllRows<FakeRow>(table, () => db.from(table).select('id, amount') as any, options)

const ids = (rows: FakeRow[]) => rows.map((r) => r.id as string)

describe('readAllRows', () => {
  it('pages 1,000 rows at a time, 50 pages at most', () => {
    expect(PAGE_ROWS).toBe(1000)
    expect(MAX_PAGES).toBe(50)
  })

  it('an empty table is a real "none" after one empty page', async () => {
    const db = new FakePostgrest()
    db.table('lines', [])
    const result = await read(db)
    expect(result).toEqual({ ok: true, rows: [] })
    expect(db.requestsTo('lines')).toHaveLength(1)
  })

  it('orders every page by id and asks for the rows after the last id received', async () => {
    const db = new FakePostgrest()
    db.table('lines', rowsNumbered(1500))
    await read(db)
    const pages = db.requestsTo('lines')
    expect(pages.map((p) => p.order)).toEqual([
      [{ column: 'id', ascending: true }],
      [{ column: 'id', ascending: true }],
      [{ column: 'id', ascending: true }],
    ])
    expect(pages.map((p) => p.limit)).toEqual([1000, 1000, 1000])
    expect(pages.map((p) => p.range)).toEqual([null, null, null])
    expect(pages[0].filters).toEqual([])
    expect(pages[1].filters).toEqual([`id=gt.${uuidAt(999)}`])
    expect(pages[2].filters).toEqual([`id=gt.${uuidAt(1499)}`])
  })

  it('exactly 1,000 rows: a full page is not the end, the empty page after it is', async () => {
    const db = new FakePostgrest()
    db.table('lines', rowsNumbered(1000))
    const result = await read(db)
    expect(result.ok && result.rows).toHaveLength(1000)
    expect(db.requestsTo('lines').map((p) => p.rowsReturned)).toEqual([1000, 0])
  })

  it('1,001 rows: the row past the cap is read', async () => {
    const db = new FakePostgrest()
    db.table('lines', rowsNumbered(1001, (i) => ({ amount: i === 1000 ? 5_000_000 : 1 })))
    const result = await read(db)
    if (!result.ok) throw result.error
    expect(result.rows.reduce((s, r) => s + (r.amount as number), 0)).toBe(1000 + 5_000_000)
    expect(db.requestsTo('lines').map((p) => p.rowsReturned)).toEqual([1000, 1, 0])
  })

  it('a Max rows cap below the page size: short pages are not the end', async () => {
    const db = new FakePostgrest()
    db.table('lines', rowsNumbered(2345), { maxRows: 400 })
    const result = await read(db)
    if (!result.ok) throw result.error
    expect(new Set(ids(result.rows)).size).toBe(2345)
    expect(db.requestsTo('lines').map((p) => p.rowsReturned)).toEqual([400, 400, 400, 400, 400, 345, 0])
  })

  it('storage order that is not id order still reads every row exactly once', async () => {
    const all = rowsNumbered(2500)
    const db = new FakePostgrest()
    db.table('lines', shuffled(all))
    const result = await read(db)
    if (!result.ok) throw result.error
    expect(ids(result.rows)).toEqual(ids(all))
  })

  describe('rows written while the read is between pages', () => {
    /** A sync UPDATE between page 1 and page 2 moves 50 of page 1's rows to the end of storage. */
    const syncRewritesPageOne = (n: number, table: { rewrite: (m: (r: FakeRow) => boolean) => void }) => {
      if (n === 1) table.rewrite((r) => (r.id as string) <= uuidAt(49))
    }

    it('a row rewritten mid-read is neither counted twice nor pushes another row out', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(2000), { beforeRequest: syncRewritesPageOne })
      const result = await read(db)
      if (!result.ok) throw result.error
      expect(ids(result.rows)).toEqual(ids(rowsNumbered(2000)))
    })

    it('control: the same write breaks an un-ORDERed offset pager, so the fake can tell', async () => {
      // The shape readAllRows replaced: .range() with no ORDER BY, stop on a short page.
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(2000), { beforeRequest: syncRewritesPageOne })
      const seen: string[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = (await db.from('lines').select('id').range(from, from + 999)) as { data: FakeRow[] }
        seen.push(...ids(data))
        if (data.length < 1000) break
      }
      expect(seen).toHaveLength(2000)
      expect(new Set(seen).size).toBeLessThan(2000) // the rewritten rows came back twice…
      expect(seen).not.toContain(uuidAt(1000)) // …and the rows they displaced were never read
    })

    it('a row deleted mid-read does not shift the rows after it', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(2000), {
        beforeRequest: (n, t) => { if (n === 1) t.delete((r) => r.id === uuidAt(10)) },
      })
      const result = await read(db)
      if (!result.ok) throw result.error
      expect(result.rows).toHaveLength(2000) // uuidAt(10) was already read on page 1
      expect(new Set(ids(result.rows)).size).toBe(2000)
    })

    it('a row inserted mid-read past the cursor is read once; one before the cursor is not re-read', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(2000, (i) => ({ id: uuidAt(i * 2) })), {
        beforeRequest: (n, t) => {
          if (n !== 1) return
          t.insert({ id: uuidAt(3), amount: 1 }) // behind the cursor (page 1 ended at uuidAt(1998))
          t.insert({ id: uuidAt(2001), amount: 1 }) // ahead of it
        },
      })
      const result = await read(db)
      if (!result.ok) throw result.error
      expect(result.rows).toHaveLength(2001)
      expect(new Set(ids(result.rows)).size).toBe(2001)
      expect(ids(result.rows)).toContain(uuidAt(2001))
    })
  })

  describe('a read that cannot finish is a failure, never a shorter answer', () => {
    it('a failed later page withholds the rows already read', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(2500), { failOnRequest: [1] })
      const result = await read(db)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result).not.toHaveProperty('rows')
      expect(result.error).toBeInstanceOf(IncompleteReadError)
      expect(result.error.reason).toBe('query_error')
      expect(result.error.rowsRead).toBe(1000)
      expect(result.error.message).toMatch(/lines read did not finish \(query_error\): simulated lines failure on request 1/)
    })

    it('a page that throws is a failure, not an exception', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(1500), { throwOnRequest: [1] })
      const result = await read(db)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.reason).toBe('threw')
    })

    it('a response with no row array is a failure', async () => {
      const page: any = {
        order: () => page,
        gt: () => page,
        limit: () => page,
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      }
      const result = await readAllRows('lines', () => page)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.reason).toBe('no_row_array')
    })

    it('rows selected without an id cannot be paged', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(10))
      const result = await readAllRows<FakeRow>('lines', () => db.from('lines').select('amount') as any)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.reason).toBe('ids_not_ascending')
    })

    it('a query that brings its own ORDER BY breaks the cursor, so the read fails', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(1500, (i) => ({ account_code: String(9999 - i) })))
      const result = await readAllRows<FakeRow>('lines', () =>
        db.from('lines').select('id, account_code').order('account_code', { ascending: true }) as any,
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.reason).toBe('ids_not_ascending')
    })

    it('a read still going after maxPages is a failure', async () => {
      const db = new FakePostgrest()
      db.table('lines', rowsNumbered(5000))
      const result = await read(db, 'lines', { maxPages: 3 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.reason).toBe('page_limit')
      expect(result.error.rowsRead).toBe(3000)
    })
  })

  it("keeps the caller's filters on every page", async () => {
    const db = new FakePostgrest()
    db.table('lines', rowsNumbered(2400, (i) => ({ tenant_id: i % 2 === 0 ? 'a' : 'b' })))
    const result = await readAllRows<FakeRow>('lines', () => db.from('lines').select('id, tenant_id').eq('tenant_id', 'a') as any)
    if (!result.ok) throw result.error
    expect(result.rows).toHaveLength(1200)
    expect(result.rows.every((r) => r.tenant_id === 'a')).toBe(true)
    expect(db.requestsTo('lines').every((p) => p.filters[0] === 'tenant_id=eq.a')).toBe(true)
  })
})
