'use client'

/**
 * Annual Reset Service — Phase 73 Plan 02
 *
 * PURPOSE: Orchestrate the full rollover of a finished plan year into a fresh new-year plan.
 *
 * OPERATION ORDER (safety-first):
 *   1. SELF-READ the prior business_financial_goals row (no priorRow param — reads itself)
 *   2. Derive endingFY from priorRow.year1_end_date
 *   3. captureAnnualResetSnapshot — ABORT with zero writes if snapshot fails
 *   4. Build rolled ladder (computeRolledLadder) + rolled dates (computeRolledPlanDates)
 *   5. UPDATE business_financial_goals with rolled payload (year_type preserved)
 *   6. Carry-forward UPDATE on strategic_initiatives (incomplete → not_started, selected=false)
 *   7. Return { success, snapshotId, newFY, carriedForwardCount }
 *
 * KEYING (verified in prod — Phase 73 dry-run):
 *   - business_financial_goals AND strategic_initiatives are BOTH keyed on
 *     business_profiles.id (= businessId param). strategic_initiatives 448/448 rows are
 *     profile-keyed (and FK-constrained to business_profiles); 0 are businesses-keyed.
 *
 * NO SCHEMA MIGRATION: all writes use existing columns.
 */

import { createClient } from '@/lib/supabase/client'
import { annualResetSnapshotService } from './annual-reset-snapshot-service'
import { computeRolledLadder, computeRolledPlanDates, applyFinancialActuals, type RolledLadder } from '../utils/rollover-math'
import { getFiscalYear } from '@/lib/utils/fiscal-year-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecuteResetParams {
  /** business_profiles.id — key for business_financial_goals + strategic_initiatives */
  businessId: string
  userId: string
  /** Fiscal year start month (1-12; 7 = AU FY, 1 = CY) */
  yearStartMonth: number
}

export interface ExecuteResetResult {
  success: boolean
  snapshotId?: string
  newFY?: number
  carriedForwardCount?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD using **local** date parts (not UTC).
 * This avoids the common UTC-shift bug on machines in positive-offset timezones
 * (e.g. AEST = UTC+10) where `new Date(2026, 6, 1).toISOString()` returns
 * "2026-06-30T14:00:00.000Z".
 */
function toLocalDateString(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// Incomplete initiative statuses (per plan spec)
// ---------------------------------------------------------------------------

const INCOMPLETE_STATUSES = ['not_started', 'in_progress', 'on_hold'] as const

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AnnualResetService {
  private getSupabase() {
    return createClient()
  }

  /**
   * Execute the annual plan rollover for a single business.
   *
   * Takes NO priorRow parameter — the service reads the prior
   * business_financial_goals row itself via:
   *   .from('business_financial_goals').select('*').eq('business_id', businessId).maybeSingle()
   *
   * @param params - { businessId, userId, yearStartMonth }
   * @returns ExecuteResetResult
   */
  async executeAnnualReset(params: ExecuteResetParams): Promise<ExecuteResetResult> {
    const { businessId, userId, yearStartMonth } = params
    const supabase = this.getSupabase()

    // ── Step 1: SELF-READ the prior business_financial_goals row ──────────────
    const { data: priorRow, error: readError } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()

    if (readError) {
      return { success: false, error: `Failed to read prior goals: ${readError.message}` }
    }
    if (!priorRow) {
      return { success: false, error: 'No prior goals row found — cannot perform rollover' }
    }

    // ── Step 2: Derive endingFY from priorRow.year1_end_date ──────────────────
    const year1EndDateStr = priorRow.year1_end_date as string | null
    if (!year1EndDateStr) {
      return { success: false, error: 'Prior goals row has no year1_end_date — cannot derive ending FY' }
    }
    // Parse the date-only column ('YYYY-MM-DD') from explicit calendar parts in
    // LOCAL space. `new Date(year1EndDateStr)` would parse as UTC midnight, which
    // a negative-offset host then reads back as the PREVIOUS day via the local
    // getters below (dayAfter/getFiscalYear), shifting the derived FY by one and
    // seeding/snapshotting the wrong year. Local-from-parts matches the
    // local-space arithmetic in computeRolledPlanDates + toLocalDateString.
    const [pY, pM, pD] = year1EndDateStr.slice(0, 10).split('-').map(Number)
    const priorYear1EndDate = new Date(pY, (pM ?? 1) - 1, pD ?? 1)
    if (!pY || !pM || !pD || isNaN(priorYear1EndDate.getTime())) {
      return { success: false, error: `Invalid year1_end_date: ${year1EndDateStr}` }
    }
    // Derive the new FY from the day after the prior year end
    const dayAfterEnd = new Date(priorYear1EndDate)
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1)
    const newFY = getFiscalYear(dayAfterEnd, yearStartMonth)
    const endingFY = newFY - 1

    // ── Step 3: Capture snapshot BEFORE any write ─────────────────────────────
    const snapshotResult = await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId,
      userId,
      endingFY,
    })

    if (!snapshotResult.success) {
      return {
        success: false,
        error: `Snapshot failed — aborting reset: ${snapshotResult.error ?? 'unknown'}`,
      }
    }

    const snapshotId = snapshotResult.snapshotId

    // ── Step 4: Build the rolled payload ──────────────────────────────────────
    const yearType = (priorRow.year_type as 'FY' | 'CY') ?? 'FY'

    // 4a. Rolled ladder (D3 shift): new_current = prior_year1 (last year's TARGET)
    let rolledLadder = computeRolledLadder(priorRow as Record<string, unknown>)

    // 4a-bis. Option B ("B-with-fallback"): override the financial *_current
    // values with the real just-finished-FY actuals when a COMPLETE FY exists
    // in Xero. Fail-closed — any miss/partial/error leaves the D3 (prior-target)
    // value untouched, and this never aborts the rollover. Runs AFTER the
    // snapshot (Step 3) so reversibility is preserved; mutates only the
    // in-memory payload, never the live row before the snapshot.
    rolledLadder = await this.seedFinancialActuals(rolledLadder, businessId, endingFY, yearStartMonth)

    // 4b. Rolled plan dates
    const { planStartDate, year1EndDate, planEndDate } = computeRolledPlanDates(
      priorYear1EndDate,
      yearType,
      yearStartMonth,
    )

    // 4c. Compose the full goals update payload
    const goalsPayload = {
      ...rolledLadder,

      // Rolled plan dates — use local-date formatting to avoid UTC-shift on
      // machines in positive-offset timezones (e.g. AEST = UTC+10).
      plan_start_date: toLocalDateString(planStartDate),
      year1_end_date: toLocalDateString(year1EndDate),
      plan_end_date: toLocalDateString(planEndDate),

      // quarterly_targets cleared — wizard's Step4 even-split defaults apply for new year
      quarterly_targets: {},

      // Reset extended-period fields to standard clean-year values
      is_extended_period: false,
      year1_months: 12,
      current_year_remaining_months: 0,

      // Preserve year_type from prior row
      year_type: yearType,

      updated_at: new Date().toISOString(),
    }

    // ── Step 5: UPDATE business_financial_goals ───────────────────────────────
    const { error: updateError } = await supabase
      .from('business_financial_goals')
      .update(goalsPayload)
      .eq('business_id', businessId)

    if (updateError) {
      return {
        success: false,
        error: `Goals update failed: ${updateError.message}. Snapshot ${snapshotId} exists for restore.`,
      }
    }

    // ── Step 6: Carry-forward incomplete initiatives ──────────────────────────
    // Query incomplete initiatives keyed on business_profiles.id (businessId)
    const { data: incompleteRows, error: fetchInitError } = await supabase
      .from('strategic_initiatives')
      .select('id')
      .in('status', INCOMPLETE_STATUSES)
      .eq('business_id', businessId)

    let carriedForwardCount = 0

    if (fetchInitError) {
      // Non-fatal: log but don't fail the reset — snapshot + goals are already written
      console.error('[AnnualResetService] Failed to fetch incomplete initiatives:', fetchInitError.message)
    } else if (incompleteRows && incompleteRows.length > 0) {
      const { error: initUpdateError } = await supabase
        .from('strategic_initiatives')
        .update({
          status: 'not_started',
          selected: false,
          fiscal_year: newFY,
          updated_at: new Date().toISOString(),
        })
        .in('id', incompleteRows.map((r: { id: string }) => r.id))
        .eq('business_id', businessId)

      if (initUpdateError) {
        console.error('[AnnualResetService] Failed to carry forward initiatives:', initUpdateError.message)
      } else {
        carriedForwardCount = incompleteRows.length
      }
    }

    return {
      success: true,
      snapshotId,
      newFY,
      carriedForwardCount,
    }
  }

  /**
   * Option B seeding: fetch the just-finished FY's real financial actuals and
   * override the financial `*_current` ladder values. Fail-closed — any error,
   * missing/partial data, or non-usable response leaves the D3 ladder untouched
   * so a Xero hiccup never changes (or aborts) the rollover.
   *
   * `businessId` is the business_profiles.id; the reset-actuals route resolves
   * dual IDs internally. `cache: 'no-store'` because a reset is a one-shot
   * mutation that must read live Xero data, never a cached response.
   */
  private async seedFinancialActuals(
    ladder: RolledLadder,
    businessId: string,
    endingFY: number,
    yearStartMonth: number,
  ): Promise<RolledLadder> {
    // Bound the fetch — it sits on the page-load reset critical path, so a slow
    // query or stalled connection must not hang the rollover (and the whole
    // /goals page) indefinitely. On timeout the abort throws → caught → keep D3.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(
        `/api/goals/reset-actuals?business_id=${encodeURIComponent(businessId)}` +
          `&fiscal_year=${endingFY}&year_start_month=${yearStartMonth}`,
        { cache: 'no-store', signal: controller.signal },
      )
      if (!res.ok) return ladder

      const json = await res.json()
      if (!json?.usable || !json?.actuals) return ladder

      return applyFinancialActuals(ladder, {
        usable: true,
        revenue: Number(json.actuals.revenue),
        gross_profit: Number(json.actuals.gross_profit),
        net_profit: Number(json.actuals.net_profit),
      })
    } catch (err) {
      console.error(
        '[AnnualResetService] financial actuals seed skipped (keeping D3):',
        (err as Error)?.message,
      )
      return ladder
    } finally {
      clearTimeout(timeout)
    }
  }
}

export const annualResetService = new AnnualResetService()
