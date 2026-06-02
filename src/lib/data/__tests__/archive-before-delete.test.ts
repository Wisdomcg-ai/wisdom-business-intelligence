import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  archiveBeforeDelete,
  archiveBusinessBeforeDelete,
  deleteArchiveRow,
  type ChildSpec,
} from '../archive-before-delete'

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

// ─── archiveBusinessBeforeDelete (generic, dual-ID) ──────────────────────────

interface BizCfg {
  business: Record<string, unknown> | null
  businessErr?: { message: string } | null
  profiles?: Record<string, unknown>[]
  profilesErr?: { message: string } | null
  fkByParent: Record<string, Array<{ child_table: string; child_column: string }>>
  rpcErr?: { message: string } | null
  childRows?: Record<string, unknown[]>
  childErr?: Record<string, { message: string }>
}

function makeBizAdmin(cfg: BizCfg): { admin: SupabaseClient; captured: { archiveRow?: Record<string, unknown> } } {
  const captured: { archiveRow?: Record<string, unknown> } = {}
  const admin = {
    from(table: string) {
      if (table === 'deleted_records_archive') {
        return {
          insert(row: Record<string, unknown>) {
            captured.archiveRow = row
            return { select: () => ({ single: async () => ({ data: { id: 'biz-arc-1' }, error: null }) }) }
          },
          delete: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      return {
        select: () => ({
          eq: (_col: string, _val: string) => {
            const res =
              table === 'businesses'
                ? { data: cfg.business, error: cfg.businessErr ?? null }
                : { data: cfg.profiles ?? [], error: cfg.profilesErr ?? null }
            return { maybeSingle: async () => res, then: (r: (v: unknown) => void) => r(res) }
          },
          in: (_col: string, _ids: string[]) => {
            const res = { data: cfg.childRows?.[table] ?? [], error: cfg.childErr?.[table] ?? null }
            return { then: (r: (v: unknown) => void) => r(res) }
          },
        }),
      }
    },
    rpc: (_name: string, args: { parent_table: string }) =>
      Promise.resolve({ data: cfg.fkByParent[args.parent_table] ?? [], error: cfg.rpcErr ?? null }),
  } as unknown as SupabaseClient
  return { admin, captured }
}

describe('archiveBusinessBeforeDelete (dual-ID)', () => {
  it('snapshots business + profiles + direct children + profile children', async () => {
    const { admin, captured } = makeBizAdmin({
      business: { id: 'biz-1', name: 'Acme' },
      profiles: [{ id: 'prof-1', business_id: 'biz-1' }],
      fkByParent: {
        businesses: [{ child_table: 'coaching_sessions', child_column: 'business_id' }],
        business_profiles: [{ child_table: 'xero_pl_lines', child_column: 'business_id' }],
      },
      childRows: {
        coaching_sessions: [{ id: 's1' }, { id: 's2' }],
        xero_pl_lines: [{ id: 'pl1' }],
      },
    })

    const res = await archiveBusinessBeforeDelete({ admin, businessId: 'biz-1', deletedBy: 'admin-1' })

    expect(res).toEqual({ ok: true, archiveId: 'biz-arc-1' })
    const payload = captured.archiveRow?.payload as {
      parent: unknown
      business_profiles: unknown[]
      children: Record<string, unknown[]>
      profile_children: Record<string, unknown[]>
    }
    expect(payload.parent).toEqual({ id: 'biz-1', name: 'Acme' })
    expect(payload.business_profiles).toHaveLength(1)
    expect(payload.children['coaching_sessions.business_id']).toHaveLength(2)
    expect(payload.profile_children['xero_pl_lines.business_id']).toHaveLength(1)
    expect(captured.archiveRow?.entity_type).toBe('business')
    expect(captured.archiveRow?.entity_id).toBe('biz-1')
  })

  it('returns ok:false when the business is not found', async () => {
    const { admin } = makeBizAdmin({ business: null, fkByParent: {} })
    const res = await archiveBusinessBeforeDelete({ admin, businessId: 'missing', deletedBy: 'admin-1' })
    expect(res.ok).toBe(false)
  })

  it('returns ok:false when fk_children_of (rpc) fails', async () => {
    const { admin } = makeBizAdmin({
      business: { id: 'biz-1' },
      profiles: [],
      fkByParent: { businesses: [] },
      rpcErr: { message: 'rpc down' },
    })
    const res = await archiveBusinessBeforeDelete({ admin, businessId: 'biz-1', deletedBy: 'admin-1' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/fk_children_of/)
  })
})
