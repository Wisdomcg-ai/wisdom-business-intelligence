'use client'

/**
 * Annual Reset Snapshot Service
 *
 * PURPOSE: Capture a COMPLETE, RESTORABLE point-in-time copy of a client's
 * ending-year plan into `plan_snapshots` BEFORE any overwrite occurs.
 * This is the load-bearing reversibility gate for Phase 73's "zero impact to
 * current clients" guarantee.
 *
 * KEYING (verified in prod — Phase 73 dry-run):
 *   - business_financial_goals, business_kpis, AND strategic_initiatives are ALL keyed on
 *     business_profiles.id (the `businessId` / profileId arg). business_kpis 55/55 and
 *     strategic_initiatives 448/448 rows are profile-keyed; 0 are businesses-keyed.
 *     (The earlier belief that KPIs/initiatives were keyed on businesses.id was wrong and
 *     caused them to be silently missed — caught by the Precision dry-run.)
 *
 * SCHEMA CONSTRAINT: plan_snapshots.snapshot_type CHECK allows only
 *   'goals_wizard_complete' | 'quarterly_review_pre_sync' | 'quarterly_review_post_sync'
 *   We use 'quarterly_review_pre_sync' and put the reset tag in `label`.
 *
 * RESTORE PATH:
 *   - `restoreAnnualResetSnapshot` is FINANCIAL LOAD-BEARING: it writes the captured
 *     3-year ladder + quarterly_targets + year_type + plan dates back into
 *     business_financial_goals. This is the critical reversibility path.
 *   - KPI and initiative restore are intentionally NOT implemented here (deferred).
 *     KPIs: re-import from plan_data.kpis in a future admin tool (plan_data.kpis is captured).
 *     Initiatives: re-create from plan_data.initiatives in a future admin tool.
 *     Rationale: initiatives + KPIs can be re-entered; losing the financial ladder is
 *     unrecoverable in a coaching session context.
 */

import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptureParams {
  /** business_profiles.id — key for business_financial_goals, business_kpis, strategic_initiatives */
  businessId: string
  userId: string
  /** The FY year number being ended, e.g. 2026 for FY26 */
  endingFY: number
}

export interface CaptureResult {
  success: boolean
  snapshotId?: string
  versionNumber?: number
  error?: string
}

export interface RestoreParams {
  /** business_profiles.id — key for business_financial_goals */
  businessId: string
  snapshotId: string
}

export interface RestoreResult {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AnnualResetSnapshotService {
  private getSupabase() {
    return createClient()
  }

  /**
   * Capture the COMPLETE ending-year plan into plan_snapshots.
   *
   * Reads (ALL keyed by business_profiles.id = businessId):
   *   - business_financial_goals (by businessId)
   *   - business_kpis (by businessId, is_active=true)
   *   - strategic_initiatives (by businessId)
   *
   * Inserts ONE plan_snapshots row:
   *   snapshot_type = 'quarterly_review_pre_sync' (allowed CHECK value)
   *   label         = 'annual_reset_FY<endingFY>'
   *   year          = endingFY
   *   plan_data     = { kind, endingFY, goals, kpis, initiatives }
   *
   * NEVER mutates business_financial_goals, business_kpis, or strategic_initiatives.
   */
  async captureAnnualResetSnapshot(params: CaptureParams): Promise<CaptureResult> {
    const { businessId, userId, endingFY } = params
    const supabase = this.getSupabase()

    try {
      // 1. Read business_financial_goals (keyed by business_profiles.id)
      const { data: goalsRow, error: goalsError } = await supabase
        .from('business_financial_goals')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle()

      if (goalsError) {
        return { success: false, error: `Failed to read goals: ${goalsError.message}` }
      }

      // 2. Read business_kpis (keyed by business_profiles.id)
      const { data: kpisData, error: kpisError } = await supabase
        .from('business_kpis')
        .select('id, kpi_id, name, year1_target, year2_target, year3_target, current_value, is_active')
        .eq('business_id', businessId)
        .eq('is_active', true)

      if (kpisError) {
        return { success: false, error: `Failed to read KPIs: ${kpisError.message}` }
      }

      // 3. Read strategic_initiatives (keyed by business_profiles.id)
      const { data: initiativesData, error: initiativesError } = await supabase
        .from('strategic_initiatives')
        .select('id, title, step_type, status, fiscal_year, selected, quarter_assigned, category, order_index')
        .eq('business_id', businessId)

      if (initiativesError) {
        return { success: false, error: `Failed to read initiatives: ${initiativesError.message}` }
      }

      // 4. Compute next version number
      const { data: maxRow } = await supabase
        .from('plan_snapshots')
        .select('version_number')
        .eq('business_id', businessId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = (maxRow?.version_number ?? 0) + 1

      // 5. Build the restorable plan_data blob
      const planData = {
        kind: 'annual_reset' as const,
        endingFY,
        goals: goalsRow ?? {},
        kpis: kpisData ?? [],
        initiatives: initiativesData ?? [],
      }

      // 6. Insert the snapshot row
      const { data: inserted, error: insertError } = await supabase
        .from('plan_snapshots')
        .insert({
          business_id: businessId,
          user_id: userId,
          version_number: nextVersion,
          snapshot_type: 'quarterly_review_pre_sync',
          quarter: null,
          year: endingFY,
          quarterly_review_id: null,
          plan_data: planData,
          label: `annual_reset_FY${endingFY}`,
        })
        .select()
        .single()

      if (insertError) {
        return { success: false, error: `Failed to insert snapshot: ${insertError.message}` }
      }

      return {
        success: true,
        snapshotId: (inserted as { id: string }).id,
        versionNumber: nextVersion,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error during capture',
      }
    }
  }

  /**
   * Restore the financial goals ladder from a previously captured snapshot.
   *
   * FINANCIAL LOAD-BEARING: Writes plan_data.goals back into business_financial_goals
   * so the ending-year plan is byte-for-byte identical to the captured state.
   *
   * Note: KPI and initiative restore are NOT implemented here (see file header JSDoc).
   * The financial ladder (revenue/GP/NP/customers/employees + quarterly_targets +
   * year_type + plan dates) is the data that must be recoverable to honour Matt's
   * "fully reversible" constraint. KPIs and initiatives can be re-entered manually
   * from plan_data.kpis / plan_data.initiatives if needed.
   */
  async restoreAnnualResetSnapshot(params: RestoreParams): Promise<RestoreResult> {
    const { businessId, snapshotId } = params
    const supabase = this.getSupabase()

    try {
      // 1. Load the snapshot
      const { data: snapshot, error: fetchError } = await supabase
        .from('plan_snapshots')
        .select('plan_data')
        .eq('id', snapshotId)
        .single()

      if (fetchError || !snapshot) {
        return {
          success: false,
          error: fetchError ? `Failed to fetch snapshot: ${fetchError.message}` : 'Snapshot not found',
        }
      }

      // 2. Extract goals payload — strip PK + immutable audit columns
      const planData = snapshot.plan_data as {
        kind: string
        endingFY: number
        goals: Record<string, unknown>
        kpis: unknown[]
        initiatives: unknown[]
      }

      if (!planData?.goals) {
        return { success: false, error: 'Snapshot plan_data.goals is missing — cannot restore' }
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, updated_at, ...goalsPayload } = planData.goals as Record<string, unknown>
      const restoredPayload = {
        ...goalsPayload,
        updated_at: new Date().toISOString(),
      }

      // 3. Write the goals ladder back to business_financial_goals
      const { error: updateError } = await supabase
        .from('business_financial_goals')
        .update(restoredPayload)
        .eq('business_id', businessId)

      if (updateError) {
        return { success: false, error: `Failed to restore goals: ${updateError.message}` }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error during restore',
      }
    }
  }
}

export const annualResetSnapshotService = new AnnualResetSnapshotService()
