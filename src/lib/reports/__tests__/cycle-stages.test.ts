import { describe, it, expect } from 'vitest'
import { periodMonthFromReportMonth, stampGeneratedFirst } from '../cycle-stages'

describe('periodMonthFromReportMonth', () => {
  it('bridges YYYY-MM to the first of the month', () => {
    expect(periodMonthFromReportMonth('2026-08')).toBe('2026-08-01')
  })

  it('rejects malformed keys rather than fabricating a date', () => {
    expect(periodMonthFromReportMonth('2026-8')).toBeNull()
    expect(periodMonthFromReportMonth('2026-13')).toBeNull()
    expect(periodMonthFromReportMonth('2026-00')).toBeNull()
    expect(periodMonthFromReportMonth('2026-08-01')).toBeNull()
    expect(periodMonthFromReportMonth('august')).toBeNull()
    expect(periodMonthFromReportMonth('')).toBeNull()
    expect(periodMonthFromReportMonth(null)).toBeNull()
    expect(periodMonthFromReportMonth(undefined)).toBeNull()
  })
})

/**
 * Minimal chainable stub capturing the two writes stampGeneratedFirst issues.
 * The contract under test: (1) the insert ignores an existing row instead of
 * clobbering it, targeting the real unique constraint; (2) the fill-update
 * only touches rows where generated_at IS NULL — so a later autosave can
 * never move an already-stamped generated_at.
 */
function makeStub(opts: { insertError?: string; updateError?: string } = {}) {
  const calls: any[] = []
  const table = {
    upsert(values: any, options: any) {
      calls.push({ op: 'upsert', values, options })
      return Promise.resolve({ error: opts.insertError ? { message: opts.insertError } : null })
    },
    update(values: any) {
      const call: any = { op: 'update', values, filters: [] }
      calls.push(call)
      const chain = {
        eq(col: string, val: unknown) {
          call.filters.push(['eq', col, val])
          return chain
        },
        is(col: string, val: unknown) {
          call.filters.push(['is', col, val])
          return Promise.resolve({ error: opts.updateError ? { message: opts.updateError } : null })
        },
      }
      return chain
    },
  }
  return { supabase: { from: (name: string) => (calls.push({ op: 'from', name }), table) }, calls }
}

describe('stampGeneratedFirst', () => {
  it('inserts ignoring duplicates on the real conflict target, then fills only NULL generated_at', async () => {
    const { supabase, calls } = makeStub()
    const result = await stampGeneratedFirst(supabase as any, 'biz-1', '2026-08-01', '2026-09-16T00:00:00Z')
    expect(result).toBeNull()

    const upsert = calls.find(c => c.op === 'upsert')
    expect(upsert.values).toMatchObject({
      business_id: 'biz-1',
      period_month: '2026-08-01',
      status: 'draft',
      generated_at: '2026-09-16T00:00:00Z',
    })
    // onConflict must match the table's unique constraint exactly — a
    // mismatched conflict target fails on every call (the financial_metrics
    // lesson) — and ignoreDuplicates keeps an existing workflow row intact.
    expect(upsert.options).toEqual({ onConflict: 'business_id,period_month', ignoreDuplicates: true })

    const update = calls.find(c => c.op === 'update')
    expect(update.values).toEqual({ generated_at: '2026-09-16T00:00:00Z' })
    expect(update.filters).toEqual([
      ['eq', 'business_id', 'biz-1'],
      ['eq', 'period_month', '2026-08-01'],
      ['is', 'generated_at', null],
    ])
  })

  it('reports insert failures as strings for the invariant capture', async () => {
    const { supabase } = makeStub({ insertError: 'boom' })
    expect(await stampGeneratedFirst(supabase as any, 'b', '2026-08-01')).toContain('insert failed: boom')
  })

  it('reports fill failures as strings for the invariant capture', async () => {
    const { supabase } = makeStub({ updateError: 'kaput' })
    expect(await stampGeneratedFirst(supabase as any, 'b', '2026-08-01')).toContain('fill failed: kaput')
  })
})

describe('stampGeneratedFirst never throws', () => {
  it('returns a thrown client error as a string (non-fatal contract)', async () => {
    const throwing = { from: () => { throw new Error('Unexpected table access in test: cfo_report_status') } }
    const result = await stampGeneratedFirst(throwing as any, 'b', '2026-08-01')
    expect(result).toContain('stamp threw')
    expect(result).toContain('cfo_report_status')
  })
})
