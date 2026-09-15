/**
 * How many bank lines remain unreconciled for the report month, as the cover
 * may say it — counted from the CFO board's captured Xero badge (DD-14).
 *
 * Calxa's Distinct Directions cover says "Please note that no items remain
 * unreconciled as of this report", or how many do: a number read off Xero each
 * month (the DD monthly-report skill's reconciliation gate). The pack could
 * never print it. Generate writes unreconciled_count 0 without counting
 * anything (generate/route.ts), and the app's own check counts recorded
 * transactions, which no API can extend to uncoded bank-feed lines. The badge
 * is what the recon round captures (reconciliation_dashboard_captures) and
 * what the /cfo board judges a month by (deriveReadiness), so it is the one
 * number the cover may repeat.
 *
 * The cover counts only a verdict the board would stand behind:
 *   - every Xero organisation captured — a missing org's backlog is unknown,
 *     so a clean-looking total is a floor, not a count;
 *   - a fresh capture (the board's STALE_CAPTURE_DAYS);
 *   - taken after the report month ended in Sydney — a capture on the 31st
 *     cannot vouch for lines dated that evening;
 *   - every line dated. The board counts an account with no month split (and a
 *     badge total with no breakdown) as "could be any period, including this
 *     one" — the xero-dashboard-capture skill never posts months, and the recon
 *     round posts each badge before its date pass. That is a worst case the
 *     board flags with a "?", not a number to print as fact.
 * The count is the board's blocking lines: dated in or before the report month,
 * less recon_ignored_accounts. Anything short of that is `uncounted`, with the
 * reason, and the cover prints what it printed before (coverReconciliationLines).
 *
 * As of when. The cover pairs the sentence with its "Prepared on" date
 * (pack-prepared-on), and a settled pack keeps that date on every copy. So the
 * count is judged at the same moment: for a finalised or approved report, the
 * latest capture taken at or before it was settled, aged against that moment;
 * for a draft, the latest capture as of the export. Captures are append-only
 * and stamped by the server, so a settled pack prints the same sentence on the
 * day and a year later — a round captured after it was settled is the next
 * version's to count (re-finalising moves the settled moment).
 *
 * Reads only. The captures and monthly_report_settings key on businesses.id;
 * xero_connections.business_id holds either id-space, so the id goes through
 * the resolver first.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import {
  deriveReadiness,
  summariseDashboardCaptures,
  type CaptureRow,
  type ReportReadiness,
} from '@/lib/cfo/dashboard-capture'
import type { PackPreparedOn } from './pack-prepared-on'
import { coverReconciliationLine } from './placement-options'

type Client = { from: (table: string) => any }

export type PackReconciliation =
  | {
      status: 'counted'
      /** Badge lines that bear on the report month — see the header. */
      count: number
      /** The oldest of the latest captures, one per organisation: the honest "as of". */
      captured_at: string
    }
  | {
      status: 'uncounted'
      reason: string
      /** A database read failed — the caller's to report; the cover is unaffected. */
      readFailed?: true
    }

/** "2026-09" for a moment, in Sydney, where every coach and every report month is. */
function sydneyMonth(iso: string): string | null {
  const at = new Date(iso)
  if (!Number.isFinite(at.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit' }).formatToParts(at)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  return year && month ? `${year}-${month}` : null
}

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * The board's verdict for the month, read as a count the cover may print — or
 * why not. `settled` is the report's settled moment when the readiness was
 * judged at it (see the header), so the reason says so.
 */
export function packReconciliationFromReadiness(
  readiness: ReportReadiness,
  reportMonth: string,
  settled: PackPreparedOn | null = null,
): PackReconciliation {
  if (readiness.state === 'never' || !readiness.captured_at) {
    return {
      status: 'uncounted',
      reason: settled
        ? `the recon round had not captured this business's Xero badges when this report was ${settled.basis}`
        : "the recon round has not captured this business's Xero badges",
    }
  }
  if (readiness.state === 'stale') {
    const days = readiness.capture_age_days ?? 'too many'
    return {
      status: 'uncounted',
      reason: settled
        ? `the latest Xero badge capture was ${days} days old when this report was ${settled.basis}`
        : `the latest Xero badge capture is ${days} days old`,
    }
  }
  // 'blocked' outranks 'partial' on the board, so ask about coverage directly.
  if (readiness.state === 'partial' || readiness.uncaptured_tenants > 0) {
    return {
      status: 'uncounted',
      reason: `not every Xero organisation of this business ${settled ? `had a badge capture when this report was ${settled.basis}` : 'has a badge capture'}`,
    }
  }
  const capturedIn = sydneyMonth(readiness.captured_at)
  if (!capturedIn || capturedIn <= reportMonth) {
    return { status: 'uncounted', reason: `the latest Xero badge capture was taken before ${monthName(reportMonth)} ended` }
  }
  if (readiness.possibly_blocking > 0) {
    const n = readiness.possibly_blocking
    return {
      status: 'uncounted',
      reason: `${n} ${n === 1 ? 'item' : 'items'} in the latest Xero badge capture ${n === 1 ? 'has' : 'have'} no month split, so how many belong to ${monthName(reportMonth)} or earlier is unknown`,
    }
  }
  return {
    status: 'counted',
    count: readiness.blocking,
    captured_at: readiness.captured_at,
  }
}

/**
 * The organisations a capture is expected for, as the board decides them
 * (cfo/board/route.ts): every active connection's tenant; for a business with
 * no connection rows at all, its badge-only manual_tenant_key. Where the board
 * substitutes an unmatchable key, this returns nothing, and the loader says so.
 */
export function expectedCaptureTenants(
  connections: readonly { tenant_id: string | null; is_active: boolean | null }[],
  manualTenantKey: unknown,
): string[] {
  if (connections.length === 0) {
    const key = typeof manualTenantKey === 'string' ? manualTenantKey.trim() : ''
    return key ? [key] : []
  }
  return [...new Set(connections.filter((c) => c.is_active && c.tenant_id).map((c) => c.tenant_id as string))]
}

/** True when some cover placement asks for the badge — the only time the export reads it. */
export function layoutWantsBadgeReconciliation(widgets: readonly { type: string; config?: unknown }[]): boolean {
  return widgets.some((w) => w.type === 'cover_page' && coverReconciliationLine(w.config) === 'xero_badge')
}

const readFailure = (what: string): PackReconciliation => ({
  status: 'uncounted',
  reason: `the ${what} could not be read`,
  readFailed: true,
})

/**
 * `preparedOn` is the cover's own date source (loadPackPreparedOn), which the
 * caller has already read: a settled report counts as of that moment, a draft
 * (null) as of `now`. It is required so no export can leave it out.
 */
export async function loadPackReconciliation(
  supabase: Client,
  businessId: string,
  reportMonth: string,
  preparedOn: PackPreparedOn | null,
  now: Date = new Date(),
): Promise<PackReconciliation> {
  const settledAt = preparedOn ? new Date(preparedOn.at) : null
  if (settledAt && !Number.isFinite(settledAt.getTime())) {
    return { status: 'uncounted', reason: 'the moment this report was settled could not be read' }
  }
  try {
    const ids = await resolveBusinessProfileIds(supabase, businessId)

    const { data: connections, error: connErr } = await supabase
      .from('xero_connections')
      .select('tenant_id, is_active')
      .in('business_id', ids.all)
    if (connErr) return readFailure('Xero connections')

    const { data: settings, error: settingsErr } = await supabase
      .from('monthly_report_settings')
      .select('recon_ignored_accounts, manual_tenant_key')
      .eq('business_id', ids.businessId)
      .maybeSingle()
    if (settingsErr) return readFailure('report settings')

    const tenants = expectedCaptureTenants(connections ?? [], settings?.manual_tenant_key)
    if (tenants.length === 0) {
      return { status: 'uncounted', reason: 'this business has no active Xero organisation to match a badge capture to' }
    }

    // The latest capture of each organisation, one row each — for a settled
    // report, the latest taken by the moment it was settled. Captures are
    // append-only, so a capped read across the business would return whichever
    // organisation was captured most often, not the latest of every one.
    const rows: CaptureRow[] = []
    for (const tenant of tenants) {
      let query = supabase
        .from('reconciliation_dashboard_captures')
        .select('business_id, tenant_id, captured_at, total_count, accounts, method, notes')
        .eq('business_id', ids.businessId)
        .eq('tenant_id', tenant)
      if (settledAt) query = query.lte('captured_at', settledAt.toISOString())
      const { data, error } = await query.order('captured_at', { ascending: false }).limit(1)
      if (error) return readFailure('Xero badge captures')
      rows.push(...((data ?? []) as CaptureRow[]))
    }

    const ignored = Array.isArray(settings?.recon_ignored_accounts)
      ? (settings.recon_ignored_accounts as unknown[]).filter((n): n is string => typeof n === 'string')
      : []
    const asOf = settledAt ?? now
    const readiness = deriveReadiness(summariseDashboardCaptures(rows, tenants), ignored, reportMonth, asOf.toISOString())
    return packReconciliationFromReadiness(readiness, reportMonth, preparedOn)
  } catch {
    return readFailure('Xero badge captures')
  }
}
