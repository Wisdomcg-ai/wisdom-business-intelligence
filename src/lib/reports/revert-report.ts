// Phase 35 D-16/D-18: Coach-initiated edits to an approved or sent report silently revert it
// to draft on save. The frozen payload written at approval time is preserved so the email
// link continues to render the version the client received.
//
// Called by save endpoints (Plan 35-07) after their own write succeeds.
// NOT called by Xero sync (D-17) — intent is coach-edit-only.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RevertResult {
  reverted: boolean
  previous_status?: string
}

export async function revertReportIfApproved(
  supabase: SupabaseClient,
  business_id: string,
  period_month: string,
): Promise<RevertResult> {
  const { data: row } = await supabase
    .from('cfo_report_status')
    .select('id, status')
    .eq('business_id', business_id)
    .eq('period_month', period_month)
    .maybeSingle()

  if (!row) return { reverted: false }
  if (row.status !== 'approved' && row.status !== 'sent') {
    return { reverted: false }
  }

  // Clear approved_at and sent_at only; frozen-snapshot columns are intentionally untouched (D-18).
  const { error } = await supabase
    .from('cfo_report_status')
    .update({
      status: 'draft',
      approved_at: null,
      sent_at: null,
    })
    .eq('id', row.id)

  if (error) {
    console.error('[revertReportIfApproved] update failed:', error)
    return { reverted: false, previous_status: row.status }
  }
  return { reverted: true, previous_status: row.status }
}
