/**
 * The date on the cover: "Prepared on 11 August 2026".
 *
 * The cover printed the moment of EXPORT. A pack finalised on the 11th and
 * re-downloaded on the 20th to attach to an email then claimed to have been
 * prepared on the 20th, and two copies of the same approved pack carried two
 * different dates. Matt's decision (14 Sep 2026): a finalised, approved or sent
 * report is dated when it was settled; only a draft is dated when it was
 * exported, because a draft has no other date that is true of it.
 *
 * Where "settled" is recorded:
 *   1. monthly_report_snapshots, status 'final' → generated_at. The snapshot
 *      POST stamps generated_at on every save, and every writer names its
 *      status: auto-save and Generate write 'draft', only Finalise writes
 *      'final', and auto-save stops once a month is final. So on a final row
 *      generated_at is the moment it was finalised — re-finalising after an
 *      unfinalise moves it, which is right, because that is a new version.
 *   2. cfo_report_status, status 'approved' or 'sent' → snapshot_taken_at,
 *      else approved_at. Approve & Send freezes the pack there without
 *      necessarily finalising the monthly snapshot. A coach edit afterwards
 *      reverts that row to draft (revertReportIfApproved), so a stale approval
 *      cannot date a changed pack.
 *
 * Fail-open: no settled row, an unreadable timestamp or a failed read → null,
 * and the cover prints the export date as it always has. It makes no claim
 * about finalisation either way — the date is simply the day it was produced.
 *
 * Reads only. Both tables key on businesses.id (monthly_report_snapshots
 * FKs businesses; cfo_report_status is businesses-space by its migration), so
 * the id goes through the resolver before the cycle read.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'

type Client = { from: (table: string) => any }

export interface PackPreparedOn {
  /** ISO timestamp the report was settled. */
  at: string
  basis: 'finalised' | 'approved'
}

export interface PackPreparedOnSources {
  snapshot?: { status?: string | null; generated_at?: string | null } | null
  cycle?: { status?: string | null; approved_at?: string | null; snapshot_taken_at?: string | null } | null
}

const valid = (ts: string | null | undefined): ts is string =>
  typeof ts === 'string' && ts.trim() !== '' && Number.isFinite(Date.parse(ts))

export function resolvePackPreparedOn(src: PackPreparedOnSources): PackPreparedOn | null {
  if (src.snapshot?.status === 'final' && valid(src.snapshot.generated_at)) {
    return { at: src.snapshot.generated_at, basis: 'finalised' }
  }
  const cycle = src.cycle
  if (cycle && (cycle.status === 'approved' || cycle.status === 'sent')) {
    const at = valid(cycle.snapshot_taken_at) ? cycle.snapshot_taken_at : valid(cycle.approved_at) ? cycle.approved_at : null
    if (at) return { at, basis: 'approved' }
  }
  return null
}

/**
 * The cover's date, in the words Calxa prints: "11 August 2026". In
 * Australia/Sydney rather than the machine's zone — every coach is in
 * Australia, a finalise at 21:30 UTC is the next morning there, and the
 * preview harness and a server must print the same day the browser does.
 */
export function formatPackPreparedOn(preparedOn: PackPreparedOn | null | undefined, now: Date = new Date()): string {
  const when = preparedOn ? new Date(preparedOn.at) : now
  return when.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })
}

/**
 * `snapshot` is the month's snapshot row the caller has already read (the
 * export reads it for the memo, the harness for the report), so it is not
 * fetched twice. Only the cycle row is read here.
 */
export async function loadPackPreparedOn(
  supabase: Client,
  businessId: string,
  reportMonth: string,
  snapshot: PackPreparedOnSources['snapshot'],
): Promise<PackPreparedOn | null> {
  const fromSnapshot = resolvePackPreparedOn({ snapshot })
  if (fromSnapshot) return fromSnapshot
  try {
    const ids = await resolveBusinessProfileIds(supabase, businessId)
    const { data, error } = await supabase
      .from('cfo_report_status')
      .select('status, approved_at, snapshot_taken_at')
      .eq('business_id', ids.businessId)
      .eq('period_month', `${reportMonth}-01`)
      .maybeSingle()
    if (error) return null
    return resolvePackPreparedOn({ cycle: data })
  } catch {
    return null
  }
}
