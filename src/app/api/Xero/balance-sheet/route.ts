import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { fetchXeroWithRateLimit, RateLimitDailyExceededError, XeroHttpError } from '@/lib/xero/xero-api-client'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { loadFxRates } from '@/lib/consolidation/fx'
import type { BalanceSheetCompare } from '@/app/finances/monthly-report/types'
import { buildBalanceSheetData, balanceSheetDates, type BsAccount } from '@/lib/monthly-report/balance-sheet-rows'
import { loadConsolidatedBalanceSheet } from '@/lib/monthly-report/consolidated-balance-sheet-load'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
// Room for one Retry-After wait (Xero's minute limit asks for up to 60s) on
// top of the two reports themselves.
export const maxDuration = 120

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    month: z.string().optional(),
    compare: z.string().optional(),
    cash_only: z.string().optional(),
    as_of: z.string().optional(),
  })
  .passthrough()

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

/** Parse a Xero numeric string, returning null for empty/non-numeric */
function parseAmount(val: string): number | null {
  if (!val || val.trim() === '') return null
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? null : n
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

type SingleDateResult =
  | { ok: true; report: any }
  | { ok: false; status: number; errText: string; rateLimited?: 'minute' | 'daily' }

/**
 * The BalanceSheet report as at ONE date — no periods=, no timeframe=, the
 * shape the sync uses (bs-single-period-parser.ts). The page's comparison
 * column is a second call of this, not Xero's comparative.
 *
 * Through the paced client, not a bare fetch. The pack asks this route twice
 * (mom, then yoy) and each ask is two reports, so one export is four
 * BalanceSheet calls against a per-org limit of 60 a minute that a
 * sync-all-xero crawl of the same org may already be spending. A bare fetch
 * turned the first 429 into "Xero API error" on the page; this waits out
 * Retry-After once, retries a concurrent-limit refusal, and gives a 5xx one
 * more try — no more, because someone is waiting on the export.
 */
async function fetchSingleDateBalanceSheet(
  accessToken: string,
  tenantId: string,
  date: string,
): Promise<SingleDateResult> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${date}&standardLayout=true`
  try {
    const res = await fetchXeroWithRateLimit(url, { accessToken, tenantId, maxRetries: 2 })
    const report = res.json?.Reports?.[0]
    if (!report) return { ok: false, status: 502, errText: 'Empty response from Xero' }
    return { ok: true, report }
  } catch (err) {
    if (err instanceof RateLimitDailyExceededError) {
      return { ok: false, status: 429, errText: err.message, rateLimited: 'daily' }
    }
    if (err instanceof XeroHttpError) return { ok: false, status: err.status, errText: err.body }
    const message = err instanceof Error ? err.message : String(err)
    // The client's own wording for a limit that outlasted its retry
    // ("xero 429 minute persists after retry …") and for exhausted 5xx
    // retries ("xero 503 after 2 attempts …"); a network failure has no status.
    const status = Number(/^xero (\d{3})\b/.exec(message)?.[1] ?? 502)
    return status === 429
      ? { ok: false, status, errText: message, rateLimited: 'minute' }
      : { ok: false, status, errText: message }
  }
}

/**
 * The tenant's account catalogue — AccountID → code and Class — which decides
 * where each account sits on the page (its Class: a credit card is an ASSET
 * that Xero's report files under Current Liabilities) and in what order
 * (Calxa's code order). Keyed on tenant_id, not business_id: xero_accounts
 * carries both id-spaces historically and the tenant is the one key that
 * cannot be the wrong one. A failed read returns null and the page keeps
 * Xero's order and Xero's placement — both add up to the same Net Assets, so
 * it is no reason to fail the sheet.
 */
async function loadAccountCatalogue(tenantId: string): Promise<Map<string, BsAccount> | null> {
  const { data, error } = await supabase
    .from('xero_accounts')
    .select('xero_account_id, account_code, xero_class')
    .eq('tenant_id', tenantId)
  if (error || !data) {
    Sentry.captureMessage('[BalanceSheet] account catalogue unavailable — rows keep Xero order and placement', {
      level: 'warning' as any,
      extra: { tenantId, error: error?.message },
    } as any)
    return null
  }
  return new Map(
    data.map((a: any) => [String(a.xero_account_id), { code: a.account_code ?? null, xeroClass: a.xero_class ?? null }]),
  )
}

/**
 * GET /api/Xero/balance-sheet?business_id=&month=YYYY-MM[&compare=yoy|mom]
 *
 * Fetches Xero /Reports/BalanceSheet as at the month-end and as at the
 * comparison month-end (one call each) and builds the page's rows with 4
 * columns — Current Actuals | Prior Actuals | Variance | % Variance — in
 * lib/monthly-report/balance-sheet-rows.ts.
 *
 * Phase 58.3: when `cash_only=true` is passed, returns only the bank account
 * balance summary used by the forecast Overview's Cash KPI card:
 *   { cash: number | null, currency: string, as_of: string }
 * In this mode `month` is optional (defaults to today). Bank rows are detected
 * by looking inside the Assets section for sub-sections titled "Bank" — this
 * is how Xero's standardLayout BS groups bank accounts.
 */
async function getHandler(request: NextRequest) {
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

    // One entry per ORGANISATION, not per row. The read spans both id-spaces,
    // so a single org can come back twice — a businesses-keyed row and a
    // profiles-keyed row for the same tenant (the dual-ID incident class). Per
    // row, that org's cash was summed twice below and its full sheet refused as
    // "several organisations". The tenant is the organisation; keep its first row.
    const seenTenants = new Set<string>()
    const allConns = (connections ?? []).filter((c: any) => {
      const tenant = String(c.tenant_id)
      if (seenTenants.has(tenant)) return false
      seenTenants.add(tenant)
      return true
    })
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
    // connection. A multi-tenant FULL balance sheet is the consolidated sheet
    // just below, built from the stored mirror.
    // ─────────────────────────────────────────────────────────────────────
    // The full sheet for a business Xero holds as several organisations
    // (Dragon Roofing + Easy Hail Claim; IICT's three, one of them in HKD) is
    // the consolidated sheet, built from the stored balance-sheet mirror per
    // organisation — translated, eliminated, and in the one-organisation
    // sheet's shape, so the tab, the pack, the Finalise freeze and the sent
    // copy all take it exactly as they take one organisation's. It never calls
    // Xero: the mirror is the sync's, and a pack of three organisations would
    // otherwise be six live reports against three minute limits.
    //
    // It used to refuse (409 MULTI_ORG) rather than print the first connection
    // as though it were the business; the refusals that remain are the
    // sheet's own — a missing closing rate, an organisation never synced —
    // and the pack prints them as the page's reason. The Cash KPI above sums
    // every org itself and is unaffected.
    if (!cashOnly && allConns.length > 1) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month as string)) {
        return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
      }
      let result: Awaited<ReturnType<typeof loadConsolidatedBalanceSheet>>
      try {
        result = await loadConsolidatedBalanceSheet(supabase, businessId, month as string, compare === 'mom' ? 'mom' : 'yoy', {
          connections: allConns,
        })
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'Xero/balance-sheet', stage: 'consolidated' }, extra: { businessId, month } } as any)
        return NextResponse.json(
          { error: 'the stored balance sheet could not be read — export again in a minute or two' },
          { status: 502 },
        )
      }
      if (!result.ok) {
        return NextResponse.json({ error: result.reason, code: 'CONSOLIDATED_BS_REFUSED' }, { status: 422 })
      }
      return NextResponse.json(result.data)
    }

    const connection = allConns[0]

    const tokenResult = await getValidAccessToken(connection as any, supabase)
    if (!tokenResult.success) {
      return NextResponse.json({ error: 'Xero connection expired' }, { status: 401 })
    }

    const accessToken = tokenResult.accessToken!
    const tenantId = (connection as any).tenant_id

    if (!cashOnly) {
      // The page's two columns, each from its own single-date report — see
      // balance-sheet-rows.ts for why the comparison is no longer one
      // periods=1&timeframe= call. (`month` is non-null here: validated above.)
      const dates = balanceSheetDates(month as string, compare)
      const [currentResult, priorResult] = await Promise.all([
        fetchSingleDateBalanceSheet(accessToken, tenantId, dates.current),
        fetchSingleDateBalanceSheet(accessToken, tenantId, dates.prior),
      ])
      for (const r of [currentResult, priorResult]) {
        if (!r.ok) {
          Sentry.captureMessage(`[BalanceSheet] Xero API error status=${r.status}`, { level: 'error' as any, extra: { errText: r.errText } } as any)
          // A limit is a wait, not a fault, and the page prints this sentence
          // verbatim as its reason — so say which wait it is.
          if (r.rateLimited) {
            const error = r.rateLimited === 'daily'
              ? "Xero's daily limit for this organisation is used up — try again tomorrow"
              : 'Xero is rate-limiting — try again in a minute'
            return NextResponse.json({ error, status: 429 }, { status: 429 })
          }
          return NextResponse.json({ error: 'Xero API error', status: r.status }, { status: 502 })
        }
      }

      const result = buildBalanceSheetData({
        businessId,
        compare,
        currentDate: dates.current,
        priorDate: dates.prior,
        current: (currentResult as { ok: true; report: any }).report,
        prior: (priorResult as { ok: true; report: any }).report,
        accounts: await loadAccountCatalogue(tenantId),
      })
      return NextResponse.json(result)
    }

    // Cash-only: the standard layout, so the "Bank" sub-section can be found.
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${reportDate}&periods=1&timeframe=MONTH&standardLayout=true`
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

    const cashSum = parseBankCashFromReport(report)
    return NextResponse.json({
      cash: cashSum,
      currency: ((connection as any).functional_currency || 'AUD').toUpperCase(),
      as_of: reportDate,
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/balance-sheet' }, extra: { context: "[BalanceSheet] Error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'Xero/balance-sheet',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
)
