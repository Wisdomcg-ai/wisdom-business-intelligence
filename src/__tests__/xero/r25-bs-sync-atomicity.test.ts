import { describe, it, expect, vi, beforeEach } from 'vitest'
import { replaceTenantBSRows, type BSLineRow } from '@/app/api/monthly-report/sync-xero/bs-writer'

/**
 * R25 / DM-N5 — balance-sheet sync atomicity.
 *
 * replaceTenantBSRows must:
 *   - skip the swap (keep existing rows) when there are no new rows to write;
 *   - scope BOTH the delete and the insert to the SAME business_id (id-space
 *     symmetry — no wipe-broad/write-narrow);
 *   - on insert failure after the delete, RESTORE the prior rows so the BS is
 *     never left silently empty, and report 'insert_failed' so the caller
 *     surfaces it (no more silent success:true).
 */

const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}))

beforeEach(() => {
  captureMessage.mockClear()
})

const BIZ_ID = 'biz-uuid-1'
const TENANT_ID = 'tenant-abc'

function row(name: string, value: number): BSLineRow {
  return {
    business_id: BIZ_ID,
    tenant_id: TENANT_ID,
    account_name: name,
    account_code: null,
    account_type: 'asset',
    section: 'Bank',
    monthly_values: { '2026-03': value },
    updated_at: '2026-03-31T00:00:00.000Z',
  }
}

/**
 * Mock service client. Records every delete .eq() filter and every insert
 * payload, and returns programmed errors. `insertErrors` is a queue: index 0 =
 * the main insert, index 1 = the restore insert.
 */
function makeMockAdmin(opts: {
  priorRows?: BSLineRow[]
  deleteError?: { message: string } | null
  insertErrors?: Array<{ message: string } | null>
}) {
  const calls = {
    deleteFilters: [] as Array<[string, unknown]>,
    selectFilters: [] as Array<[string, unknown]>,
    insertPayloads: [] as unknown[][],
  }
  let insertIdx = 0
  const thenable = (val: unknown) => ({ then: (resolve: (v: unknown) => void) => resolve(val) })

  const admin = {
    calls,
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              calls.selectFilters.push([col, val])
              return {
                eq(col2: string, val2: unknown) {
                  calls.selectFilters.push([col2, val2])
                  return thenable({ data: opts.priorRows ?? [], error: null })
                },
              }
            },
          }
        },
        delete() {
          return {
            eq(col: string, val: unknown) {
              calls.deleteFilters.push([col, val])
              return {
                eq(col2: string, val2: unknown) {
                  calls.deleteFilters.push([col2, val2])
                  return thenable({ error: opts.deleteError ?? null })
                },
              }
            },
          }
        },
        insert(payload: unknown[]) {
          calls.insertPayloads.push(payload)
          const err = opts.insertErrors?.[insertIdx] ?? null
          insertIdx += 1
          return thenable({ error: err })
        },
      }
    },
  }
  return admin
}

const baseArgs = (newRows: BSLineRow[]) => ({
  businessId: BIZ_ID,
  tenantId: TENANT_ID,
  tenantLabel: 'Acme Pty Ltd',
  newRows,
})

describe('replaceTenantBSRows', () => {
  it('skips the swap and keeps existing rows when there are no new rows', async () => {
    const admin = makeMockAdmin({})
    const result = await replaceTenantBSRows(admin as any, baseArgs([]))

    expect(result.status).toBe('skipped_empty')
    expect(result.written).toBe(0)
    // Critically: no delete was issued — existing data is untouched.
    expect(admin.calls.deleteFilters).toEqual([])
    expect(admin.calls.insertPayloads).toEqual([])
  })

  it('deletes and inserts under the SAME business_id (id-space symmetry)', async () => {
    const admin = makeMockAdmin({ priorRows: [row('Old Bank', 1)] })
    const newRows = [row('Bank', 100), row('Debtors', 50)]
    const result = await replaceTenantBSRows(admin as any, baseArgs(newRows))

    expect(result.status).toBe('written')
    expect(result.written).toBe(2)
    // Delete scoped to (business_id = BIZ_ID, tenant_id = TENANT_ID) — not ids.all.
    expect(admin.calls.deleteFilters).toEqual([
      ['business_id', BIZ_ID],
      ['tenant_id', TENANT_ID],
    ])
    // Exactly one insert, with the new rows.
    expect(admin.calls.insertPayloads).toHaveLength(1)
    expect(admin.calls.insertPayloads[0]).toBe(newRows)
  })

  it('returns delete_failed without inserting when the delete errors', async () => {
    const admin = makeMockAdmin({ deleteError: { message: 'perm denied' } })
    const result = await replaceTenantBSRows(admin as any, baseArgs([row('Bank', 100)]))

    expect(result.status).toBe('delete_failed')
    expect(result.error).toBe('perm denied')
    // No insert attempted — the old rows are still in place.
    expect(admin.calls.insertPayloads).toEqual([])
  })

  it('restores prior rows when the insert fails after a successful delete', async () => {
    const prior = [row('Old Bank', 1), row('Old Debtors', 2)]
    const admin = makeMockAdmin({
      priorRows: prior,
      insertErrors: [{ message: 'insert boom' }, null], // main fails, restore succeeds
    })
    const result = await replaceTenantBSRows(admin as any, baseArgs([row('Bank', 100)]))

    expect(result.status).toBe('insert_failed')
    expect(result.restored).toBe(true)
    expect(result.error).toBe('insert boom')
    // Two inserts: the failed new-rows insert, then the restore of the snapshot.
    expect(admin.calls.insertPayloads).toHaveLength(2)
    expect(admin.calls.insertPayloads[1]).toBe(prior)
    // A loud error was logged.
    expect(captureMessage).toHaveBeenCalled()
  })

  it('reports insert_failed with restored=false when there were no prior rows', async () => {
    const admin = makeMockAdmin({
      priorRows: [],
      insertErrors: [{ message: 'insert boom' }],
    })
    const result = await replaceTenantBSRows(admin as any, baseArgs([row('Bank', 100)]))

    expect(result.status).toBe('insert_failed')
    expect(result.restored).toBe(false)
    // Only the one (failed) insert — nothing to restore.
    expect(admin.calls.insertPayloads).toHaveLength(1)
  })

  it('reports insert_failed with restored=false when even the restore fails', async () => {
    const prior = [row('Old Bank', 1)]
    const admin = makeMockAdmin({
      priorRows: prior,
      insertErrors: [{ message: 'insert boom' }, { message: 'restore boom' }],
    })
    const result = await replaceTenantBSRows(admin as any, baseArgs([row('Bank', 100)]))

    expect(result.status).toBe('insert_failed')
    expect(result.restored).toBe(false)
    expect(admin.calls.insertPayloads).toHaveLength(2)
    // The "BS now EMPTY" alert should have fired.
    const messages = captureMessage.mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => /BS now EMPTY/i.test(m))).toBe(true)
  })
})
