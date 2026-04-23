// Phase 35 D-19: Public read-only snapshot view rendered from cfo_report_status.snapshot_data.
// Token signed with REPORT_LINK_SECRET (see src/lib/reports/report-token.ts).
// This page is exempted from auth + onboarding checks by src/middleware.ts
// (publicRoutes + onboardingExemptRoutes both include /reports/view — Plan 35-05 Task 1).
//
// The page reads ONLY from cfo_report_status.snapshot_data — it does NOT query
// any live P&L, forecast, or metrics tables. That's the whole point of the
// snapshot: the client sees exactly what the coach approved, frozen in time
// (D-19). Live data is deliberately excluded.
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { verifyReportToken } from '@/lib/reports/report-token'
import ReportSnapshotView from './ReportSnapshotView'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface PageProps {
  params: { token: string }
}

export default async function ReportViewPage({ params }: PageProps) {
  const statusId = verifyReportToken(params.token)
  if (!statusId) {
    notFound()
  }

  const { data: row, error } = await supabase
    .from('cfo_report_status')
    .select('id, business_id, period_month, snapshot_data, snapshot_taken_at, status')
    .eq('id', statusId)
    .maybeSingle()

  if (error) {
    console.error('[report-view] supabase error:', error)
    notFound()
  }
  if (!row || !row.snapshot_data) {
    notFound()
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px' }}>
      <ReportSnapshotView
        snapshot={row.snapshot_data}
        snapshotTakenAt={row.snapshot_taken_at}
      />
    </main>
  )
}
