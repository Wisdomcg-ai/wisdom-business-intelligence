import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { archiveBeforeDelete, deleteArchiveRow, type ChildSpec } from '../archive-before-delete'

/**
 * Fake service-role client. `childRows` maps table → rows (or an error);
 * `insertResult` controls the archive insert; `captured` records the inserted row.
 */
function makeAdmin(opts: {
  childRows: Record<string, { data: unknown[] | null; error: { message: string } | null }>
  insertResult: { data: { id: string } | null; error: { message: string } | null }
  captured?: { row?: Record<string, unknown>; deletedId?: string }
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'deleted_records_archive') {
        return {
          insert(row: Record<string, unknown>) {
            if (opts.captured) opts.captured.row = row
            return { select: () => ({ single: async () => opts.insertResult }) }
          },
          delete() {
            return {
              eq: async (_col: string, id: string) => {
                if (opts.captured) opts.captured.deletedId = id
                return { error: null }
              },
            }
          },
        }
      }
      return {
        select: () => ({
          eq: async (_col: string, _val: string) =>
            opts.childRows[table] ?? { data: [], error: null },
        }),
      }
    },
  } as unknown as SupabaseClient
}

const CHILDREN: ChildSpec[] = [
  { table: 'forecast_pl_lines', fk: 'forecast_id' },
  { table: 'forecast_years', fk: 'forecast_id' },
]

describe('archiveBeforeDelete', () => {
  it('snapshots parent + children and returns the archive id', async () => {
    const captured: { row?: Record<string, unknown> } = {}
    const admin = makeAdmin({
      childRows: {
        forecast_pl_lines: { data: [{ id: 'pl1' }, { id: 'pl2' }], error: null },
        forecast_years: { data: [{ id: 'y1' }], error: null },
      },
      insertResult: { data: { id: 'arc-1' }, error: null },
      captured,
    })

    const res = await archiveBeforeDelete({
      admin,
      entityType: 'forecast',
      entityId: 'fc-1',
      businessId: 'biz-1',
      deletedBy: 'user-1',
      parent: { id: 'fc-1', name: 'Q1' },
      children: CHILDREN,
    })

    expect(res).toEqual({ ok: true, archiveId: 'arc-1' })
    const payload = captured.row?.payload as { parent: unknown; children: Record<string, unknown[]> }
    expect(payload.parent).toEqual({ id: 'fc-1', name: 'Q1' })
    expect(payload.children.forecast_pl_lines).toHaveLength(2)
    expect(payload.children.forecast_years).toHaveLength(1)
    expect(captured.row?.entity_type).toBe('forecast')
    expect(captured.row?.entity_id).toBe('fc-1')
    expect(captured.row?.deleted_by).toBe('user-1')
  })

  it('returns ok:false (and does NOT insert) when a child read fails', async () => {
    const captured: { row?: Record<string, unknown> } = {}
    const admin = makeAdmin({
      childRows: {
        forecast_pl_lines: { data: null, error: { message: 'boom' } },
      },
      insertResult: { data: { id: 'arc-x' }, error: null },
      captured,
    })

    const res = await archiveBeforeDelete({
      admin,
      entityType: 'forecast',
      entityId: 'fc-1',
      deletedBy: 'user-1',
      parent: { id: 'fc-1' },
      children: CHILDREN,
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/forecast_pl_lines/)
    expect(captured.row).toBeUndefined() // aborted before insert
  })

  it('returns ok:false when the archive insert fails', async () => {
    const admin = makeAdmin({
      childRows: { forecast_pl_lines: { data: [], error: null }, forecast_years: { data: [], error: null } },
      insertResult: { data: null, error: { message: 'insert blew up' } },
    })

    const res = await archiveBeforeDelete({
      admin,
      entityType: 'forecast',
      entityId: 'fc-1',
      deletedBy: 'user-1',
      parent: { id: 'fc-1' },
      children: CHILDREN,
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/insert/)
  })

  it('deleteArchiveRow issues a delete for the given id', async () => {
    const captured: { deletedId?: string } = {}
    const admin = makeAdmin({
      childRows: {},
      insertResult: { data: { id: 'arc-1' }, error: null },
      captured,
    })
    await deleteArchiveRow(admin, 'arc-1')
    expect(captured.deletedId).toBe('arc-1')
  })
})
