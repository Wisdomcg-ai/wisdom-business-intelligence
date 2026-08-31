/**
 * CFO production board — report cycle stage helpers.
 *
 * The cycle record is cfo_report_status (one row per business + period month).
 * This module owns the "Generated" stage stamp and the month-key bridge
 * between monthly_report_snapshots.report_month ('YYYY-MM' text) and
 * cfo_report_status.period_month (date).
 */

type SupabaseLike = { from: (table: string) => any }

/**
 * Bridge 'YYYY-MM' → 'YYYY-MM-01' with validation. Returns null for anything
 * malformed rather than fabricating a date the DB would reject (or worse,
 * accept as a different month).
 */
export function periodMonthFromReportMonth(reportMonth: string | null | undefined): string | null {
  if (!reportMonth) return null
  const match = /^(\d{4})-(\d{2})$/.exec(reportMonth)
  if (!match) return null
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return `${reportMonth}-01`
}

/**
 * Stamp the cycle's "Generated" stage: first snapshot save for the month sets
 * generated_at; later autosaves leave it alone. Race-safe without a read —
 * an insert that ignores an existing row, then an update that only fills null.
 * Returns an error string (for the caller's Sentry invariant capture) or null.
 */
export async function stampGeneratedFirst(
  supabase: SupabaseLike,
  businessId: string,
  periodMonth: string,
  nowIso: string = new Date().toISOString(),
): Promise<string | null> {
  // Contract: NEVER throws — the stamp is non-fatal for the snapshot save, so
  // both supabase-reported errors and thrown ones (network, test stubs) come
  // back as strings for the caller's invariant capture.
  try {
    // onConflict MUST match the unique constraint (business_id, period_month).
    const { error: insertError } = await supabase.from('cfo_report_status').upsert(
      {
        business_id: businessId,
        period_month: periodMonth,
        status: 'draft',
        generated_at: nowIso,
      },
      { onConflict: 'business_id,period_month', ignoreDuplicates: true },
    )
    if (insertError) return `cfo_report_status generated_at insert failed: ${insertError.message}`

    const { error: updateError } = await supabase
      .from('cfo_report_status')
      .update({ generated_at: nowIso })
      .eq('business_id', businessId)
      .eq('period_month', periodMonth)
      .is('generated_at', null)
    if (updateError) return `cfo_report_status generated_at fill failed: ${updateError.message}`

    return null
  } catch (err) {
    return `cfo_report_status generated_at stamp threw: ${err instanceof Error ? err.message : String(err)}`
  }
}
