import * as Sentry from '@sentry/nextjs'

/**
 * One balance-sheet row as written to xero_balance_sheet_lines.
 * Mirrors the shape the sync route builds per tenant.
 */
export interface BSLineRow {
  business_id: string
  tenant_id: string
  account_name: string
  account_code: string | null
  account_type: 'asset' | 'liability' | 'equity'
  section: string
  monthly_values: Record<string, number>
  updated_at: string
}

export type ReplaceBSStatus =
  | 'written' // delete + insert both succeeded
  | 'skipped_empty' // nothing to write — existing rows left untouched
  | 'delete_failed' // delete failed; nothing was removed
  | 'insert_failed' // delete succeeded but insert failed (see `restored`)

export interface ReplaceBSResult {
  status: ReplaceBSStatus
  written: number
  /** For 'insert_failed': true when the prior rows were re-inserted (restore ok). */
  restored?: boolean
  error?: string
}

/**
 * Replace one tenant's balance-sheet rows atomically-enough (R25 / DM-N5).
 *
 * The previous inline route logic had three correctness holes:
 *   1. It deleted across EVERY resolved id-space (`ids.all`) but re-inserted
 *      under a single `business_id` — an asymmetry that, on a partial failure,
 *      could wipe the broad set and rewrite under one space.
 *   2. It deleted even when there were ZERO new rows to write, so a transient
 *      empty/failed Xero fetch silently wiped a good balance sheet.
 *   3. On insert failure it logged a Sentry *warning* and the route still
 *      returned `success: true`, leaving the tenant's BS silently empty.
 *
 * This helper fixes all three:
 *   - **id-space symmetry:** delete + insert are both scoped to `businessId`.
 *     `xero_balance_sheet_lines.business_id` is FK-constrained to `businesses(id)`,
 *     so every row is keyed there; a profile id (the other half of the old
 *     `ids.all`) can't satisfy the FK and therefore matched nothing — narrowing
 *     the delete is behaviour-preserving.
 *   - **never wipe on empty:** when `newRows` is empty we skip the whole swap and
 *     keep the existing rows (`skipped_empty`).
 *   - **compensating restore:** we snapshot the prior rows before deleting; if the
 *     insert fails we re-insert the snapshot so the BS is never left empty, and
 *     return `insert_failed` so the caller surfaces it (no more silent success).
 *
 * Best-effort, no throw: Sentry calls are guarded; the caller decides how to
 * report a non-'written' result.
 */
export async function replaceTenantBSRows(
  supabaseAdmin: any,
  args: {
    businessId: string
    tenantId: string
    tenantLabel: string
    newRows: BSLineRow[]
  },
): Promise<ReplaceBSResult> {
  const { businessId, tenantId, tenantLabel, newRows } = args

  // Guard: never wipe existing rows when there's nothing to replace them with.
  if (newRows.length === 0) {
    return { status: 'skipped_empty', written: 0 }
  }

  // Snapshot the current rows so we can restore them if the insert fails after
  // the delete has already removed them.
  const { data: priorRows } = await supabaseAdmin
    .from('xero_balance_sheet_lines')
    .select(
      'business_id, tenant_id, account_name, account_code, account_type, section, monthly_values, updated_at',
    )
    .eq('business_id', businessId)
    .eq('tenant_id', tenantId)

  const { error: deleteError } = await supabaseAdmin
    .from('xero_balance_sheet_lines')
    .delete()
    .eq('business_id', businessId)
    .eq('tenant_id', tenantId)

  if (deleteError) {
    try {
      Sentry.captureMessage(
        `[Sync Xero BS] ${tenantLabel}: delete failed — ${deleteError.message}`,
        'warning' as any,
      )
    } catch {
      /* observability must never break the sync */
    }
    return { status: 'delete_failed', written: 0, error: deleteError.message }
  }

  const { error: insertError } = await supabaseAdmin
    .from('xero_balance_sheet_lines')
    .insert(newRows)

  if (!insertError) {
    return { status: 'written', written: newRows.length }
  }

  // Insert failed AFTER the delete — the rows are gone. Restore the snapshot so
  // we don't leave the tenant's balance sheet silently empty.
  let restored = false
  if (priorRows && priorRows.length > 0) {
    const { error: restoreError } = await supabaseAdmin
      .from('xero_balance_sheet_lines')
      .insert(priorRows)
    restored = !restoreError
    if (restoreError) {
      try {
        Sentry.captureMessage(
          `[Sync Xero BS] ${tenantLabel}: insert failed AND restore failed — BS now EMPTY — insert:"${insertError.message}" restore:"${restoreError.message}"`,
          'error' as any,
        )
      } catch {
        /* noop */
      }
      return { status: 'insert_failed', written: 0, restored: false, error: insertError.message }
    }
  }

  try {
    Sentry.captureMessage(
      `[Sync Xero BS] ${tenantLabel}: insert failed — ${insertError.message}${
        restored ? ' (prior rows restored)' : ' (no prior rows to restore)'
      }`,
      'error' as any,
    )
  } catch {
    /* noop */
  }
  return { status: 'insert_failed', written: 0, restored, error: insertError.message }
}
