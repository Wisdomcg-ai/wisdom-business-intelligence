import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { revertReportIfApproved } from '@/lib/reports/revert-report'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/**
 * GET /api/monthly-report/snapshot?business_id=xxx[&report_month=YYYY-MM]
 * - With report_month: returns a specific snapshot
 * - Without report_month: returns all snapshots for the business
 */
export async function GET(request: NextRequest) {
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
export async function POST(request: NextRequest) {
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

    const { data: snapshot, error } = await supabase
      .from('monthly_report_snapshots')
      .upsert(
        {
          business_id,
          report_month,
          fiscal_year,
          status: status || (is_draft ? 'draft' : 'final'),
          is_draft: is_draft ?? true,
          unreconciled_count: unreconciled_count || 0,
          report_data,
          summary,
          coach_notes: coach_notes || null,
          commentary: commentary || null,
          generated_by: generated_by || null,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'business_id,report_month',
          ignoreDuplicates: false,
        }
      )
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

    return NextResponse.json({ success: true, snapshot })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/snapshot' }, extra: { context: "[Snapshot] POST error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
