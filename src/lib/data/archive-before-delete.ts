/**
 * R27 — snapshot a record (and its cascade-deleted children) into
 * `deleted_records_archive` BEFORE a hard delete, so the deletion is
 * recoverable without a full-database point-in-time restore.
 *
 * Contract: archive FIRST, then delete. If archiving fails, the caller MUST
 * abort the delete — never hard-delete without a recoverable snapshot.
 *
 * Reads use a service-role client so the snapshot captures every child row
 * regardless of RLS.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChildSpec {
  /** Child table name. */
  table: string
  /** FK column on the child table that points at the parent id. */
  fk: string
}

export type ArchiveOutcome =
  | { ok: true; archiveId: string }
  | { ok: false; error: string }

/**
 * The ON DELETE CASCADE children of `financial_forecasts` (verified against
 * baseline_schema.sql). SET NULL relations (forecast_audit_log, report
 * templates, parent_forecast_id) are intentionally excluded — those rows
 * survive the delete, so they don't need archiving.
 */
export const FORECAST_CASCADE_CHILDREN: ChildSpec[] = [
  { table: 'cashflow_account_profiles', fk: 'forecast_id' },
  { table: 'cashflow_assumptions', fk: 'forecast_id' },
  { table: 'cashflow_settings', fk: 'forecast_id' },
  { table: 'forecast_employees', fk: 'forecast_id' },
  { table: 'forecast_payroll_summary', fk: 'forecast_id' },
  { table: 'forecast_pl_lines', fk: 'forecast_id' },
  { table: 'forecast_decisions', fk: 'forecast_id' },
  { table: 'forecast_investments', fk: 'forecast_id' },
  { table: 'forecast_scenarios', fk: 'base_forecast_id' },
  { table: 'forecast_wizard_sessions', fk: 'forecast_id' },
  { table: 'forecast_years', fk: 'forecast_id' },
]

/**
 * Snapshot `parent` + all rows of each child table (where `fk = entityId`) into
 * `deleted_records_archive`. Returns the archive row id on success.
 */
export async function archiveBeforeDelete(params: {
  admin: SupabaseClient
  entityType: 'forecast' | 'business'
  entityId: string
  businessId?: string | null
  deletedBy: string
  parent: Record<string, unknown>
  children: ChildSpec[]
}): Promise<ArchiveOutcome> {
  const childData: Record<string, unknown[]> = {}

  for (const { table, fk } of params.children) {
    const { data, error } = await params.admin.from(table).select('*').eq(fk, params.entityId)
    if (error) {
      return { ok: false, error: `archive: failed reading ${table}.${fk}: ${error.message}` }
    }
    childData[table] = data ?? []
  }

  const { data: inserted, error: insErr } = await params.admin
    .from('deleted_records_archive')
    .insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      business_id: params.businessId ?? null,
      deleted_by: params.deletedBy,
      payload: { parent: params.parent, children: childData },
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    return { ok: false, error: `archive: insert failed: ${insErr?.message ?? 'no row returned'}` }
  }
  return { ok: true, archiveId: (inserted as { id: string }).id }
}

/** Best-effort removal of an archive row (used when the subsequent delete fails). */
export async function deleteArchiveRow(admin: SupabaseClient, archiveId: string): Promise<void> {
  try {
    await admin.from('deleted_records_archive').delete().eq('id', archiveId)
  } catch {
    /* best-effort cleanup — a stray archive row is harmless */
  }
}

// ─── Generic business archive (R27 business-delete path) ─────────────────────

type CollectOutcome =
  | { ok: true; data: Record<string, unknown[]> }
  | { ok: false; error: string }

/**
 * Snapshot every FK-child row of `parentTable(parentColumn) IN ids`, discovering
 * the child tables at runtime via the `fk_children_of` SQL function. Rows are
 * keyed `"<table>.<column>"` to disambiguate tables that reference the parent
 * through more than one FK column.
 */
async function collectChildren(
  admin: SupabaseClient,
  parentTable: string,
  parentColumn: string,
  ids: string[],
): Promise<CollectOutcome> {
  if (ids.length === 0) return { ok: true, data: {} }

  const { data: fks, error } = await admin.rpc('fk_children_of', {
    parent_table: parentTable,
    parent_column: parentColumn,
  })
  if (error) return { ok: false, error: `fk_children_of(${parentTable}.${parentColumn}): ${error.message}` }

  const result: Record<string, unknown[]> = {}
  for (const fk of (fks ?? []) as Array<{ child_table: string; child_column: string }>) {
    // Never archive the archive table itself.
    if (fk.child_table === 'deleted_records_archive') continue
    const { data: rows, error: selErr } = await admin
      .from(fk.child_table)
      .select('*')
      .in(fk.child_column, ids)
    if (selErr) {
      return { ok: false, error: `collect ${fk.child_table}.${fk.child_column}: ${selErr.message}` }
    }
    if (rows && rows.length) result[`${fk.child_table}.${fk.child_column}`] = rows
  }
  return { ok: true, data: result }
}

/**
 * Snapshot a business and EVERYTHING that cascade-deletes with it — across the
 * dual-ID system — into `deleted_records_archive`, BEFORE the hard delete.
 *
 * Captures: the businesses row, its business_profiles rows, every direct FK
 * child of businesses(id), and every FK child of business_profiles(id) (the
 * money/line tables keyed to the profile id, which cascade two levels). If any
 * step fails the whole archive fails and the caller MUST abort the delete.
 */
export async function archiveBusinessBeforeDelete(params: {
  admin: SupabaseClient
  businessId: string
  deletedBy: string
}): Promise<ArchiveOutcome> {
  const { admin, businessId, deletedBy } = params

  const { data: business, error: bizErr } = await admin
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .maybeSingle()
  if (bizErr) return { ok: false, error: `archive(business): load business: ${bizErr.message}` }
  if (!business) return { ok: false, error: 'archive(business): business not found' }

  const { data: profiles, error: profErr } = await admin
    .from('business_profiles')
    .select('*')
    .eq('business_id', businessId)
  if (profErr) return { ok: false, error: `archive(business): load profiles: ${profErr.message}` }
  const profileIds = (profiles ?? []).map((p) => (p as { id: string }).id).filter(Boolean)

  const direct = await collectChildren(admin, 'businesses', 'id', [businessId])
  if (!direct.ok) return direct

  const profileChildren = await collectChildren(admin, 'business_profiles', 'id', profileIds)
  if (!profileChildren.ok) return profileChildren

  const { data: inserted, error: insErr } = await admin
    .from('deleted_records_archive')
    .insert({
      entity_type: 'business',
      entity_id: businessId,
      business_id: businessId,
      deleted_by: deletedBy,
      payload: {
        parent: business,
        business_profiles: profiles ?? [],
        children: direct.data,
        profile_children: profileChildren.data,
      },
    })
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { ok: false, error: `archive(business): insert failed: ${insErr?.message ?? 'no row returned'}` }
  }
  return { ok: true, archiveId: (inserted as { id: string }).id }
}
