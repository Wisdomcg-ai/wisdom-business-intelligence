import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { revertReportIfApproved } from '@/lib/reports/revert-report'
import { periodMonthFromReportMonth, stampGeneratedFirst } from '@/lib/reports/cycle-stages'
import {
  FROZEN_BALANCE_SHEETS_KEY,
  markBalanceSheetFreezeDue,
  pnlFigures,
  readFreezeFinalisedAt,
  readFrozenBalanceSheets,
  withoutFrozenBalanceSheets,
} from '@/lib/monthly-report/balance-sheet-freeze'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): GET reads `business_id`/`report_month`; POST saves a report snapshot.
// `view=sent_balance_sheets` returns only the month's Approve & Send balance
// sheets (sentBalanceSheets below), for the export.
const SnapshotGetQuerySchema = z.object({
  business_id: z.string().optional(),
  report_month: z.string().optional(),
  view: z.literal('sent_balance_sheets').optional(),
})

// WA.6: PATCH stamps pdf_exported_at on an existing snapshot. The column has
// existed since the baseline schema and was read in three places (this route's
// list SELECT, the types, the phase-70 audit script) but written in none —
// permanently null on every row.
const SnapshotPatchSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  // WD.8: 'set_memo' writes the month's memo (coach_notes) — targeted UPDATE,
  // same narrowness rationale as mark_pdf_exported.
  // 'freeze_balance_sheets' stores the finalised month's two balance-sheet
  // comparisons into report_data (lib/monthly-report/balance-sheet-freeze.ts).
  action: z.enum(['mark_pdf_exported', 'set_memo', 'freeze_balance_sheets']),
  memo: z.string().nullable().optional(),
  balance_sheets: z.any().optional(),
})

const SnapshotPostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  fiscal_year: z.union([z.string(), z.number()]),
  status: z.string().optional(),
  is_draft: z.boolean().optional(),
  unreconciled_count: z.number().optional(),
  report_data: z.any(),
  summary: z.any(),
  coach_notes: z.string().nullable().optional(),
  commentary: z.any().optional(),
  generated_by: z.string().nullable().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/**
 * GET /api/monthly-report/snapshot?business_id=xxx[&report_month=YYYY-MM]
 * - With report_month: returns a specific snapshot
 * - With report_month and view=sent_balance_sheets: the month's sent balance sheets only
 * - Without report_month: returns all snapshots for the business
 */
async function getHandler(request: Request) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    // The module-level service-role `supabase` continues to be used for data fetching below.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const reportMonth = searchParams.get('report_month')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/snapshot',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (reportMonth && searchParams.get('view') === 'sent_balance_sheets') {
      return await sentBalanceSheets(businessId, reportMonth)
    }

    if (reportMonth) {
      const { data: snapshot, error } = await supabase
        .from('monthly_report_snapshots')
        .select('*')
        .eq('business_id', businessId)
        .eq('report_month', reportMonth)
        .maybeSingle()

      if (error) {
        Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot' }, extra: { context: "[Snapshot] Error fetching snapshot" } } as any)
        return NextResponse.json({ error: 'Failed to fetch snapshot' }, { status: 500 })
      }

      return NextResponse.json({ snapshot })
    }

    // List all snapshots
    const { data: snapshots, error } = await supabase
      .from('monthly_report_snapshots')
      .select('id, business_id, report_month, fiscal_year, status, is_draft, unreconciled_count, summary, coach_notes, generated_by, generated_at, pdf_exported_at, created_at')
      .eq('business_id', businessId)
      .order('report_month', { ascending: false })

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot' }, extra: { context: "[Snapshot] Error listing snapshots" } } as any)
      return NextResponse.json({ error: 'Failed to list snapshots' }, { status: 500 })
    }

    return NextResponse.json({ snapshots: snapshots || [] })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot' }, extra: { context: "[Snapshot] GET error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/monthly-report/snapshot
 * Save or finalise a report snapshot
 */
async function postHandler(request: Request) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    // The module-level service-role `supabase` continues to be used for data fetching below.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_id,
      report_month,
      fiscal_year,
      status,
      is_draft,
      unreconciled_count,
      report_data,
      summary,
      coach_notes,
      commentary,
      generated_by,
    } = body

    if (!business_id || !report_month || !fiscal_year || !report_data || !summary) {
      return NextResponse.json(
        { error: 'business_id, report_month, fiscal_year, report_data, and summary are required' },
        { status: 400 }
      )
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/snapshot',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // WD.8 — coach_notes now carries the month's memo, and the routine
    // regenerate path never sends it. Including `coach_notes: null` in the
    // upsert would WIPE a saved memo on every regenerate (PostgREST upsert
    // updates every column present in the payload). Omit the key entirely
    // unless the caller explicitly provided it — an absent key preserves,
    // an explicit null clears.
    const rowStatus = status || (is_draft ? 'draft' : 'final')
    const savedAt = new Date().toISOString()
    const row: Record<string, unknown> = {
      business_id,
      report_month,
      fiscal_year,
      status: rowStatus,
      is_draft: is_draft ?? true,
      unreconciled_count: unreconciled_count || 0,
      // A save replaces the report, and a freeze describes the report it was
      // taken from — so a save never carries one (the page's in-memory report
      // still holds whatever freeze it was loaded with). A Finalise instead
      // records a freeze as OWED, stamped with this finalise's time: the freeze
      // itself runs in the browser and can die with the tab, and the marker is
      // what lets the next export see that and recover. Only the
      // freeze_balance_sheets PATCH writes the sheets; see balance-sheet-freeze.ts.
      report_data: markBalanceSheetFreezeDue(withoutFrozenBalanceSheets(report_data), rowStatus, report_month, savedAt),
      summary,
      generated_by: generated_by || null,
      generated_at: savedAt,
      updated_at: savedAt,
    }
    if (coach_notes !== undefined) {
      row.coach_notes = coach_notes || null
    }
    // Same rule for commentary — an absent key preserves, an explicit null
    // clears. This used to be an unconditional `commentary: commentary || null`,
    // which meant any save that did not happen to carry commentary BLANKED a
    // month of coach notes. Clearing every note is still expressible: the UI
    // sends `{}` (or a note map with empty strings), never `undefined`.
    if (commentary !== undefined) {
      row.commentary = commentary || null
    }
    const { data: snapshot, error } = await supabase
      .from('monthly_report_snapshots')
      .upsert(row, {
        onConflict: 'business_id,report_month',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot' }, extra: { context: "[Snapshot] Error saving snapshot" } } as any)
      return NextResponse.json({ error: error.message || 'Failed to save snapshot' }, { status: 500 })
    }

    // Phase 35 D-16: Silently revert an approved or sent report to draft after a coach edit.
    // Preserves snapshot_data (D-18) so the client's already-sent email link keeps working.
    // period_month is `${report_month}-01` (cfo_report_status uses date, monthly_report_snapshots uses YYYY-MM).
    try {
      const periodMonth = `${report_month}-01`
      await revertReportIfApproved(supabase, business_id, periodMonth)
    } catch (revertErr) {
      // Do not fail the save if revert tracking fails — log and continue.
      Sentry.captureException(revertErr, { tags: { route: 'monthly-report/snapshot' }, extra: { context: "[monthly-report/snapshot] revertReportIfApproved failed" } } as any)
    }

    // CFO production board: the first snapshot save for a month sets the
    // cycle's "Generated" stage on cfo_report_status; autosaves after the
    // first leave it alone. Non-fatal for the save, but never silent.
    const cyclePeriodMonth = periodMonthFromReportMonth(report_month)
    if (cyclePeriodMonth) {
      const stampError = await stampGeneratedFirst(supabase, business_id, cyclePeriodMonth)
      if (stampError) {
        Sentry.captureMessage(stampError, {
          level: 'error',
          tags: { route: 'monthly-report/snapshot', invariant: 'generated_stage_stamp_failed' },
          extra: { context: '[Snapshot] generated_at stamp failed', business_id, report_month },
        } as any)
      }
    }

    return NextResponse.json({ success: true, snapshot })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot' }, extra: { context: "[Snapshot] POST error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/monthly-report/snapshot
 * { business_id, report_month, action: 'mark_pdf_exported' }
 *
 * Stamps pdf_exported_at = now on the month's snapshot. Deliberately narrow —
 * it never touches report_data/status, so exporting a PDF of a FINAL month
 * cannot downgrade or rewrite it (unlike routing this through the POST upsert).
 * A missing row returns updated:false rather than an error: a PDF can be
 * exported from in-memory state that was never persisted (pre-WA.6 reports).
 */
async function patchHandler(request: Request) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { business_id, report_month, action, memo, balance_sheets } = await request.json()

    // withSchema is observe-mode (VALID-05a) — it logs mismatches but does not
    // block, so the handler enforces its own contract.
    if (
      (action !== 'mark_pdf_exported' && action !== 'set_memo' && action !== 'freeze_balance_sheets') ||
      !business_id ||
      !report_month
    ) {
      return NextResponse.json(
        { error: "business_id, report_month and action 'mark_pdf_exported' | 'set_memo' | 'freeze_balance_sheets' are required" },
        { status: 400 },
      )
    }
    if (action === 'set_memo' && memo !== null && typeof memo !== 'string') {
      return NextResponse.json({ error: 'memo must be a string or null' }, { status: 400 })
    }

    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/snapshot',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29-pattern hard gate — the module-level client is service-role.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (action === 'freeze_balance_sheets') {
      return await freezeBalanceSheets(business_id, report_month, balance_sheets)
    }

    const now = new Date().toISOString()
    const patch =
      action === 'set_memo'
        ? { coach_notes: (typeof memo === 'string' && memo.trim() !== '' ? memo : null), updated_at: now }
        : { pdf_exported_at: now, updated_at: now }
    const { data, error } = await supabase
      .from('monthly_report_snapshots')
      .update(patch)
      .eq('business_id', business_id)
      .eq('report_month', report_month)
      .select('id')

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot', invariant: action === 'set_memo' ? 'memo-save' : 'pdf-exported-stamp' }, extra: { business_id, report_month } } as any)
      return NextResponse.json({ error: action === 'set_memo' ? 'Failed to save memo' : 'Failed to record PDF export' }, { status: 500 })
    }

    if (action === 'set_memo') {
      // updated:false = no snapshot row yet — the caller tells the coach to
      // generate the report first rather than silently losing the memo.
      return NextResponse.json({ success: true, updated: (data?.length ?? 0) > 0 })
    }
    return NextResponse.json({ success: true, updated: (data?.length ?? 0) > 0, pdf_exported_at: now })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot' }, extra: { context: '[Snapshot] PATCH error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * { action: 'freeze_balance_sheets', balance_sheets: { mom, yoy } }
 *
 * Stores a FINALISED month's two balance-sheet comparisons into its
 * report_data, so its exports print the sheet as it was signed off instead of
 * asking Xero again (balance-sheet-freeze.ts has the why).
 *
 * report_data is one jsonb blob, so this is a read-modify-write, and it is
 * guarded on both ends of that window:
 *   - status = 'final'. A month unfinalised between the Finalise and this
 *     call is a draft again, and drafts are never frozen — updated:false.
 *   - the finalise it belongs to. The Finalise save stamped the freeze as owed
 *     with its own time; the write matches only that stamp. An unfinalise →
 *     edit → re-finalise inside the window replaces the stamp, so this freeze
 *     stands down instead of writing the old report_data back over the new —
 *     updated:false; the re-finalise freezes for itself.
 *     It is deliberately NOT updated_at. Export (pdf_exported_at) and a memo
 *     edit (coach_notes) both bump updated_at without touching report_data,
 *     and Finalise → Export is the normal flow — so an updated_at guard made
 *     the freeze lose a race that was never a conflict, and it never retried.
 * A final month with no stamp was finalised before freezing existed and owes
 * no freeze: it exports live, as it always has.
 * updated:false is an answer, not an error: the caller counts it under the
 * balance-sheet-freeze invariant and the month exports live.
 */
async function freezeBalanceSheets(businessId: string, reportMonth: string, sheets: unknown) {
  const now = new Date().toISOString()
  const validated = readFrozenBalanceSheets(
    { ...(sheets && typeof sheets === 'object' ? sheets : {}), frozen_at: now, report_month: reportMonth },
    reportMonth,
  )
  if (!validated) {
    return NextResponse.json(
      { error: 'balance_sheets must carry a whole mom and yoy balance sheet for report_month' },
      { status: 400 },
    )
  }

  const { data: snap, error: readError } = await supabase
    .from('monthly_report_snapshots')
    .select('status, report_data')
    .eq('business_id', businessId)
    .eq('report_month', reportMonth)
    .maybeSingle()
  if (readError) {
    Sentry.captureException(readError, { tags: { route: 'monthly-report/snapshot', invariant: 'balance-sheet-freeze' }, extra: { businessId, reportMonth, stage: 'read' } } as any)
    return NextResponse.json({ error: 'Failed to freeze the balance sheet' }, { status: 500 })
  }
  if (!snap || snap.status !== 'final') {
    return NextResponse.json({ success: true, updated: false, reason: 'not_final' })
  }
  const finalisedAt = readFreezeFinalisedAt(snap.report_data, reportMonth)
  if (!finalisedAt) {
    return NextResponse.json({ success: true, updated: false, reason: 'no_freeze_owed' })
  }

  // The finalise time comes from the stored stamp, never from the request.
  const frozen = { ...validated, finalised_at: finalisedAt }
  const reportData = snap.report_data && typeof snap.report_data === 'object' ? snap.report_data : {}
  const { data, error } = await supabase
    .from('monthly_report_snapshots')
    .update({ report_data: { ...reportData, [FROZEN_BALANCE_SHEETS_KEY]: frozen }, updated_at: now })
    .eq('business_id', businessId)
    .eq('report_month', reportMonth)
    .eq('status', 'final')
    .eq(`report_data->${FROZEN_BALANCE_SHEETS_KEY}->>finalised_at`, finalisedAt)
    .select('id')
  if (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot', invariant: 'balance-sheet-freeze' }, extra: { businessId, reportMonth, stage: 'write' } } as any)
    return NextResponse.json({ error: 'Failed to freeze the balance sheet' }, { status: 500 })
  }
  const updated = (data?.length ?? 0) > 0
  return NextResponse.json({ success: true, updated, ...(updated ? { frozen_at: now } : { reason: 'refinalised' }) })
}

/**
 * { view: 'sent_balance_sheets' } — the balance sheets the month's Approve &
 * Send printed, which the approval keeps in cfo_report_status.snapshot_data
 * (lib/monthly-report/balance-sheet-freeze.ts has the why), and the P&L figures
 * of the report they were sent beside, so the export can tell whether the
 * report on screen is still that report.
 *
 * Read here, service-role behind this route's access checks, rather than from
 * the browser: cfo_report_status's RLS admits the assigned coach and super
 * admins only, and every viewer's export of a sent month must print what was
 * sent. The copy goes back as stored — the export validates it — and the
 * report goes back as its figures only, not the whole sent report.
 * `sent_balance_sheets: null` when the month was never sent, or sent before
 * copies were kept.
 */
async function sentBalanceSheets(businessId: string, reportMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(reportMonth)) {
    return NextResponse.json({ error: 'report_month must be YYYY-MM' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('cfo_report_status')
    .select(`frozen:snapshot_data->${FROZEN_BALANCE_SHEETS_KEY}, report:snapshot_data->report`)
    .eq('business_id', businessId)
    .eq('period_month', `${reportMonth}-01`)
    .maybeSingle()
  if (error) {
    Sentry.captureException(error, {
      tags: { route: 'monthly-report/snapshot', invariant: 'balance-sheet-freeze', stage: 'export_read_sent' },
      extra: { businessId, reportMonth },
    } as any)
    return NextResponse.json({ error: 'Failed to read the sent balance sheet' }, { status: 500 })
  }
  const frozen = (data as { frozen?: unknown } | null)?.frozen
  return NextResponse.json({
    sent_balance_sheets: frozen ? { frozen, report: pnlFigures((data as { report?: unknown }).report) } : null,
  })
}

export const GET = withQuerySchema('monthly-report/snapshot', SnapshotGetQuerySchema, getHandler)
export const POST = withSchema('monthly-report/snapshot', SnapshotPostSchema, postHandler)
export const PATCH = withSchema('monthly-report/snapshot', SnapshotPatchSchema, patchHandler)
