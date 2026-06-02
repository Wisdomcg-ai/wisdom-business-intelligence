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
