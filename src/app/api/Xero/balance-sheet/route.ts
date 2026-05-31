import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { loadFxRates } from '@/lib/consolidation/fx'
import type { BalanceSheetRow, BalanceSheetData, BalanceSheetCompare } from '@/app/finances/monthly-report/types'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/** Last day of a YYYY-MM month as YYYY-MM-DD */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

/** Format a Xero date label to "Mar 2026" style */
function formatXeroLabel(raw: string): string {
  // Xero returns e.g. "31 Mar 2026" or "31 March 2026"
  const parts = raw.trim().split(' ')
  if (parts.length >= 3) {
    const month = parts[1].slice(0, 3)
    const year = parts[parts.length - 1]
    return `${month} ${year}`
  }
  return raw
}

/** Parse a Xero numeric string, returning null for empty/non-numeric */
function parseAmount(val: string): number | null {
  if (!val || val.trim() === '') return null
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

/** Compute variance % — null when prior is 0 (display as N/A) */
function variancePct(current: number | null, prior: number | null): number | null {
  if (prior === null || prior === 0) return null
  if (current === null) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

/**
 * Map Xero section titles to Calxa-style singular labels.
 * Calxa uses "Asset", "Liability", "Equity" — not the plural form.
 */
function mapSectionTitle(xeroTitle: string): string {
  const t = xeroTitle.trim()
  if (t === 'Assets') return 'Asset'
  if (t === 'Liabilities') return 'Liability'
  if (t === 'Equity') return 'Equity'
  // Unmapped sections (pass through with "New unmapped" prefix if needed)
  return t
}

/** Map Xero SummaryRow labels to Calxa singular form */
function mapSubtotalLabel(xeroLabel: string): string {
  const t = xeroLabel.trim()
  if (t === 'Total Assets') return 'Total Asset'
  if (t === 'Total Liabilities') return 'Total Liability'
  if (t === 'Total Equity') return 'Total Equity'
  if (t === 'Net Assets') return 'Net Assets'
  return t
}

/**
 * Extract the cash position (sum of Bank account balances) from a parsed Xero
 * BalanceSheet report. Returns null when no Bank section / no rows are present.
 *
 * The standardLayout BS nests Bank accounts directly inside Assets (sub-section
 * title "Bank") OR sometimes lifts them to a top-level section also titled
 * "Bank". Handle both.
 *
 * Phase 67 follow-up — extracted from the inline cash_only branch so the
 * multi-tenant aggregation can call it once per tenant.
 */
function parseBankCashFromReport(report: any): number | null {
  let cashSum: number | null = null

  for (const row of (report.Rows ?? [])) {
    if (row.RowType !== 'Section') continue
    const sectionTitle = (row.Title ?? '').trim()
    const isAssetsLike = sectionTitle === 'Assets' || sectionTitle === 'Bank'
    if (!isAssetsLike) continue

    for (const r of (row.Rows ?? [])) {
      if (r.RowType === 'Section') {
        const innerTitle = (r.Title ?? '').trim()
        if (innerTitle === 'Bank') {
          for (const lineRow of (r.Rows ?? [])) {
            if (lineRow.RowType !== 'Row') continue
            const v = parseAmount(lineRow.Cells?.[1]?.Value ?? '')
            if (v !== null) {
              cashSum = (cashSum ?? 0) + v
            }
          }
        }
      } else if (r.RowType === 'Row' && sectionTitle === 'Bank') {
        const v = parseAmount(r.Cells?.[1]?.Value ?? '')
        if (v !== null) {
          cashSum = (cashSum ?? 0) + v
        }
      }
    }
  }

  return cashSum
}

/** Fetch the BalanceSheet report for a single tenant on a specific date. */
async function fetchBalanceSheetForTenant(
  accessToken: string,
  tenantId: string,
  reportDate: string,
  timeframe: 'MONTH' | 'YEAR',
): Promise<{ ok: true; report: any } | { ok: false; status: number; errText: string }> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${reportDate}&periods=1&timeframe=${timeframe}&standardLayout=true`
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!resp.ok) {
    const errText = await resp.text()
    return { ok: false, status: resp.status, errText }
  }
  const data = await resp.json()
  const report = data?.Reports?.[0]
  if (!report) {
    return { ok: false, status: 502, errText: 'Empty response from Xero' }
  }
  return { ok: true, report }
}

/**
 * GET /api/Xero/balance-sheet?business_id=&month=YYYY-MM[&compare=yoy|mom]
 *
 * Fetches Xero /Reports/BalanceSheet for the given month and parses it
 * into the Calxa flat-section format with 4 columns:
 *   Current Actuals | Prior Actuals | Variance | % Variance
 *
 * Phase 58.3: when `cash_only=true` is passed, returns only the bank account
 * balance summary used by the forecast Overview's Cash KPI card:
 *   { cash: number | null, currency: string, as_of: string }
 * In this mode `month` is optional (defaults to today). Bank rows are detected
 * by looking inside the Assets section for sub-sections titled "Bank" — this
 * is how Xero's standardLayout BS groups bank accounts.
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const month = searchParams.get('month') // YYYY-MM
    const compare = (searchParams.get('compare') ?? 'yoy') as BalanceSheetCompare
    const cashOnly = searchParams.get('cash_only') === 'true'
    // Optional date override for cash_only — callers viewing a past FY pass
    // the FY end date so the Cash KPI reflects 30 June of that year, not
    // today. Format: YYYY-MM-DD; ignored when cashOnly is false.
    const asOfParam = searchParams.get('as_of')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }
    if (!cashOnly && !month) {
      return NextResponse.json({ error: 'month is required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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
      'api/Xero/balance-sheet',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // Resolve Xero connections — Phase 67 follow-up: this route previously used
    // .maybeSingle() three times, which ERRORS when a business has more than one
    // active connection (consolidated multi-tenant clients like IICT). The
    // resulting null connection then 400'd as "NO_CONNECTION" even though
    // multiple connections existed. Now we load ALL active connections for the
    // business via the canonical resolveBusinessProfileIds helper.
    const ids = await resolveBusinessProfileIds(supabase, businessId)
    const { data: connections } = await supabase
      .from('xero_connections')
      .select('*')
      .in('business_id', ids.all)
      .eq('is_active', true)

    const allConns = connections ?? []
    if (allConns.length === 0) {
      return NextResponse.json({ error: 'No active Xero connection', code: 'NO_CONNECTION' }, { status: 400 })
    }

    // Cash-only mode queries Xero AS OF today by default — the Cash KPI card
    // normally shows the current bank balance, not a projected end-of-month
    // figure. Phase 65 added the `as_of` override so the past-FY view can
    // ask for "cash on 30 June 2025" instead of today's balance. The full
    // balance-sheet endpoint keeps month-end semantics for back-compat
    // with the Calxa-style monthly report.
    const today = new Date()
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const isValidAsOf = asOfParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfParam)
    const reportDate = cashOnly
      ? (isValidAsOf ? asOfParam! : todayDate)
      : lastDayOfMonth(month as string)
    const timeframe = compare === 'mom' ? 'MONTH' : 'YEAR'

    // ─────────────────────────────────────────────────────────────────────
    // Phase 67 follow-up — multi-tenant cash_only with FX translation
    // For consolidated multi-tenant businesses, fetch the bank balance per
    // tenant, FX-translate non-AUD tenants to AUD via fx_rates.closing_spot,
    // and return the sum. Single-tenant businesses fall through to the
    // existing single-tenant path below.
    // ─────────────────────────────────────────────────────────────────────
    if (cashOnly && allConns.length > 1) {
      const reportMonth = reportDate.slice(0, 7) // 'YYYY-MM'
      // Preload closing_spot rates for every distinct non-AUD pair, scoped to
      // the as_of month. Cash balances are a point-in-time stock measure, so
      // spot is more accurate than monthly-average (used for P&L).
      const rateByPair = new Map<string, number | null>()
      for (const c of allConns) {
        const ccy = ((c as any).functional_currency || 'AUD').toUpperCase()
        if (ccy === 'AUD') continue
        const pair = `${ccy}/AUD`
        if (rateByPair.has(pair)) continue
        const rates = await loadFxRates(
          supabase as unknown as Parameters<typeof loadFxRates>[0],
          pair,
          'closing_spot',
          [reportMonth],
        )
        rateByPair.set(pair, rates.get(reportMonth) ?? null)
      }

      let totalCashAUD: number | null = null
      const missingRates: string[] = []

      for (const c of allConns) {
        const tokenResult = await getValidAccessToken(c as any, supabase)
        if (!tokenResult.success || !tokenResult.accessToken) {
          Sentry.captureMessage(
            `[BalanceSheet cash_only] Token failure for tenant ${(c as any).tenant_name}: ${tokenResult.message ?? tokenResult.error}`,
            'warning' as any,
          )
          continue // skip this tenant; partial cash sum is better than 502
        }
        const bsResult = await fetchBalanceSheetForTenant(
          tokenResult.accessToken,
          (c as any).tenant_id,
          reportDate,
          'MONTH',
        )
        if (!bsResult.ok) {
          Sentry.captureMessage(
            `[BalanceSheet cash_only] Xero ${bsResult.status} for tenant ${(c as any).tenant_name}`,
            'warning' as any,
          )
          continue
        }
        const tenantCash = parseBankCashFromReport(bsResult.report)
        if (tenantCash == null) continue

        const ccy = ((c as any).functional_currency || 'AUD').toUpperCase()
        let cashAUD: number = tenantCash
        if (ccy !== 'AUD') {
          const pair = `${ccy}/AUD`
          const rate = rateByPair.get(pair) ?? null
          if (rate == null) {
            // No rate available — skip this tenant rather than corrupt the
            // sum. Surface missing-rate so the UI can warn (P4 follow-up).
            missingRates.push(`${pair}::${reportMonth}`)
            Sentry.captureMessage(
              `[BalanceSheet cash_only] Missing closing_spot rate ${pair} ${reportMonth} — skipping tenant ${(c as any).tenant_name}`,
              'warning' as any,
            )
            continue
          }
          cashAUD = tenantCash * rate
        }
        totalCashAUD = (totalCashAUD ?? 0) + cashAUD
      }

      return NextResponse.json({
        cash: totalCashAUD,
        currency: 'AUD',
        as_of: reportDate,
        ...(missingRates.length > 0 ? { missing_rates: missingRates } : {}),
      })
    }

    // ─────────────────────────────────────────────────────────────────────
    // Single-tenant path (cash_only OR full BS) — uses the first active
    // connection. For multi-tenant FULL balance sheets, callers should use
    // /api/monthly-report/consolidated-bs instead — that route runs the FX
    // engine with eliminations and proper account alignment. This route's
    // full-BS shape predates the consolidation engine and is preserved for
    // back-compat with the existing Calxa-style monthly report.
    // ─────────────────────────────────────────────────────────────────────
    const connection = allConns[0]

    const tokenResult = await getValidAccessToken(connection as any, supabase)
    if (!tokenResult.success) {
      return NextResponse.json({ error: 'Xero connection expired' }, { status: 401 })
    }

    const accessToken = tokenResult.accessToken!
    const tenantId = (connection as any).tenant_id

    // Cash-only requests don't need a comparison column — keep the standard
    // layout so we can locate the "Bank" sub-section consistently with the
    // full BS path.
    const xeroUrl = cashOnly
      ? `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${reportDate}&periods=1&timeframe=MONTH&standardLayout=true`
      : `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${reportDate}&periods=1&timeframe=${timeframe}&standardLayout=true`
    const xeroResp = await fetch(xeroUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })

    if (!xeroResp.ok) {
      const errText = await xeroResp.text()
      Sentry.captureMessage(`[BalanceSheet] Xero API error status=${xeroResp.status}`, { level: 'error' as any, extra: { errText } } as any)
      return NextResponse.json({ error: 'Xero API error', status: xeroResp.status }, { status: 502 })
    }

    const xeroData = await xeroResp.json()
    const report = xeroData?.Reports?.[0]
    if (!report) {
      return NextResponse.json({ error: 'Empty response from Xero' }, { status: 502 })
    }

    if (cashOnly) {
      const cashSum = parseBankCashFromReport(report)
      return NextResponse.json({
        cash: cashSum,
        currency: ((connection as any).functional_currency || 'AUD').toUpperCase(),
        as_of: reportDate,
      })
    }

    // Extract period labels from the Header row
    // (At this point cashOnly is false → `month` is guaranteed non-null by the
    // upfront validation, but narrow it explicitly for the type checker.)
    const headerRow = report.Rows?.find((r: any) => r.RowType === 'Header')
    const currentLabel = headerRow?.Cells?.[1]?.Value
      ? formatXeroLabel(headerRow.Cells[1].Value)
      : (month as string)
    const priorLabel = headerRow?.Cells?.[2]?.Value
      ? formatXeroLabel(headerRow.Cells[2].Value)
      : ''

    const rows: BalanceSheetRow[] = []

    for (const row of (report.Rows ?? [])) {
      if (row.RowType === 'Header') continue

      if (row.RowType === 'Section') {
        const sectionLabel = mapSectionTitle(row.Title ?? '')

        // Section header row
        rows.push({
          type: 'section_header',
          label: sectionLabel,
          current: null,
          prior: null,
          variance: null,
          variance_pct: null,
        })

        for (const inner of (row.Rows ?? [])) {
          const cells = inner.Cells ?? []
          const label = cells[0]?.Value ?? ''
          const current = parseAmount(cells[1]?.Value ?? '')
          const prior = parseAmount(cells[2]?.Value ?? '')
          const v = current !== null && prior !== null ? current - prior : null

          if (inner.RowType === 'SummaryRow') {
            rows.push({
              type: 'subtotal',
              label: mapSubtotalLabel(label),
              current,
              prior,
              variance: v,
              variance_pct: variancePct(current, prior),
            })
          } else if (inner.RowType === 'Row') {
            // Skip blank rows Xero sometimes inserts
            if (!label && current === null && prior === null) continue
            rows.push({
              type: 'line_item',
              label,
              current,
              prior,
              variance: v,
              variance_pct: variancePct(current, prior),
            })
          }
        }
      } else if (row.RowType === 'Row') {
        // Standalone rows between sections — Net Assets lives here
        const cells = row.Cells ?? []
        const label = cells[0]?.Value ?? ''
        if (!label) continue
        const current = parseAmount(cells[1]?.Value ?? '')
        const prior = parseAmount(cells[2]?.Value ?? '')
        const v = current !== null && prior !== null ? current - prior : null

        if (label === 'Net Assets') {
          rows.push({
            type: 'net_assets',
            label: 'Net Assets',
            current,
            prior,
            variance: v,
            variance_pct: variancePct(current, prior),
          })
        }
      }
    }

    // Verify the sheet balances: Net Assets should equal the equity subtotal.
    // The last subtotal in a standard BS is always the equity total, regardless
    // of how Xero labels it (AU orgs vary: "Total Equity", "Total Owner's Funds", etc.)
    // Only flag as unbalanced when we can positively confirm a mismatch —
    // if either value is missing, default to balanced (no warning).
    const netAssetsRow = rows.find(r => r.type === 'net_assets')
    const subtotals = rows.filter(r => r.type === 'subtotal')
    const totalEquityRow = subtotals.at(-1)
    const balances =
      netAssetsRow?.current == null ||
      totalEquityRow?.current == null ||
      Math.abs(netAssetsRow.current - totalEquityRow.current) < 0.01

    const result: BalanceSheetData = {
      business_id: businessId,
      report_date: reportDate,
      compare,
      current_label: currentLabel,
      prior_label: priorLabel,
      rows,
      balances: balances ?? false,
    }

    return NextResponse.json(result)
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/balance-sheet' }, extra: { context: "[BalanceSheet] Error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
