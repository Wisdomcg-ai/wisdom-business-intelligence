/**
 * Read EVERY row a PostgREST select matches, however many pages that takes.
 *
 * Hosted Supabase cuts every response to the project's "Max rows" (1,000, and
 * it can be set lower) and sends the rows it kept with `error: null`. A read
 * that stops there is an answer with rows missing and nothing to say so: on
 * JDS in April 2026 the forecast wizard lost ~$5.3M of COGS and $3.8M of OpEx
 * to it (Phase 44.1).
 *
 * Paging is only exact under four rules, and this helper is those rules:
 *
 *  1. ORDER BY `id`, a total order. Without an ORDER BY, Postgres promises no
 *     row order from one statement to the next — a sync that rewrites a row
 *     moves it in storage, and a plan change starts somewhere else — so offset
 *     pages can repeat one row (counted twice) and skip another (lost).
 *  2. Each page asks for the rows AFTER the last id received (`gt('id', last)`),
 *     never an offset: a row inserted or deleted mid-read shifts every later
 *     offset, but it cannot move the rows after a cursor.
 *  3. Only an EMPTY page ends the read. A short page can be a Max rows cap set
 *     below PAGE_ROWS, not the last of the rows.
 *  4. A read that has not ended within `maxPages` pages FAILS instead of running
 *     without bound — as does a failed page, a response with no row array, and
 *     a page whose ids do not climb past the cursor (a row without an id, or a
 *     query that brought its own ORDER BY), since the cursor would then skip or
 *     repeat rows.
 *
 * The contract every caller relies on: `ok: true` means every matching row was
 * read, and an empty `rows` is a real "none". `ok: false` withholds the rows
 * entirely — part of the rows is an answer with the deciding ones missing — and
 * the caller turns it into ITS failure (throw, "could not be read"), never into
 * an empty answer. This helper never throws and reports nothing itself, so each
 * caller's failure semantics stay explicit at the call site.
 *
 * `query` must build a FRESH select that includes `id` (a uuid primary key, so
 * JavaScript's string order is Postgres's order) and carries no order, range or
 * limit of its own: readAllRows owns all three.
 */

/** Rows asked for per page. A lower Max rows cap costs pages, never rows. */
export const PAGE_ROWS = 1000

/**
 * Past this many pages a read counts as failed rather than run on. 50 pages is
 * ~28× the largest read that pages today (1,764 xero_pl_lines rows for one
 * business, 15 Sep 2026); a read that grows that big belongs in SQL.
 */
export const MAX_PAGES = 50

/** The parts of a PostgREST select builder that readAllRows pages with. */
export interface KeysetPageQuery<Row>
  extends PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
  order(column: string, options: { ascending: boolean }): KeysetPageQuery<Row>
  gt(column: string, value: string): KeysetPageQuery<Row>
  limit(count: number): KeysetPageQuery<Row>
}

export type IncompleteReadReason =
  | 'query_error'
  | 'no_row_array'
  | 'ids_not_ascending'
  | 'page_limit'
  | 'threw'

/** A read that could not reach its last row. Its partial rows are not an answer. */
export class IncompleteReadError extends Error {
  constructor(
    readonly source: string,
    readonly reason: IncompleteReadReason,
    detail: string,
    readonly rowsRead: number,
  ) {
    super(`${source} read did not finish (${reason}): ${detail}`)
    this.name = 'IncompleteReadError'
  }
}

export type ReadAllRowsResult<Row> =
  | { ok: true; rows: Row[] }
  | { ok: false; error: IncompleteReadError }

export async function readAllRows<Row>(
  /** Names the read in the error — usually the table. */
  source: string,
  query: () => KeysetPageQuery<Row>,
  { maxPages = MAX_PAGES }: { maxPages?: number } = {},
): Promise<ReadAllRowsResult<Row>> {
  const rows: Row[] = []
  const fail = (reason: IncompleteReadReason, detail: string): ReadAllRowsResult<Row> => ({
    ok: false,
    error: new IncompleteReadError(source, reason, detail, rows.length),
  })

  let after: string | null = null
  try {
    for (let page = 0; page < maxPages; page++) {
      let pageQuery = query().order('id', { ascending: true })
      if (after !== null) pageQuery = pageQuery.gt('id', after)
      const { data, error } = await pageQuery.limit(PAGE_ROWS)
      if (error) return fail('query_error', error.message)
      if (!Array.isArray(data)) return fail('no_row_array', 'the response carried no rows')
      if (data.length === 0) return { ok: true, rows }

      // Every id must climb past the one before it, starting from the cursor:
      // the next page starts after this page's LAST id, so a row out of order
      // here is a row the cursor would skip or read twice.
      let previous: string = after ?? ''
      for (const row of data) {
        const id = (row as { id?: unknown } | null)?.id
        if (typeof id !== 'string' || id <= previous) {
          return fail('ids_not_ascending', `page ${page + 1} has a row whose id does not follow ${previous || 'the start'}`)
        }
        previous = id
      }

      rows.push(...data)
      after = previous
    }
    return fail('page_limit', `still reading after ${maxPages} pages`)
  } catch (e) {
    return fail('threw', e instanceof Error ? e.message : String(e))
  }
}
