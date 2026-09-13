import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { resolveBudget, budgetLineKey } from '@/lib/budgets/resolve-budget'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { createForecastReadService } from '@/lib/services/forecast-read-service'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import {
  calcVariance,
  buildSubtotal,
  mapTypeToCategory,
  getMonthRange,
  getNextMonth,
  getPriorYearMonth,
  deriveProfitRows,
  type ReportLine,
} from '@/lib/monthly-report/shared'
import { compareStatementLines, looksLikeWizardCode, realStatementCodes, statementAccountCode } from '@/lib/monthly-report/statement-order'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): POST generates a Budget vs Actual report for a month.
const GeneratePostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  fiscal_year: z.union([z.string(), z.number()]).optional(),
  force_draft: z.boolean().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/**
 * POST /api/monthly-report/generate
 * Generates a Budget vs Actual report for a given month
 */
async function postHandler(request: Request) {
  try {
    // Auth check
    const authSupabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, report_month, fiscal_year, force_draft } = body

    if (!business_id || !report_month || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id, report_month, and fiscal_year are required' },
        { status: 400 }
      )
    }

    // Rate limit: 20 reports per hour per user
    const rateLimit = await checkRateLimit(
      createRateLimitKey('report-generate', user.id),
      RATE_LIMIT_CONFIGS.report
    )
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 }
      )
    }

    // Verify the user may see this business. Use the canonical helper: the
    // inline owner/assigned-coach check this replaces admitted neither
    // super_admins nor business_users members, so generating a client's
    // monthly report 403'd for anyone but that client's own coach (found on
    // Urban Road, 8 Sep 2026 — the platform owner could not run the report).
    // The helper also handles the dual-ID space.
    const hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authSupabase,        // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/generate',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // 1. Load settings
    const { data: settingsRow } = await supabase
      .from('monthly_report_settings')
      .select('*')
      .eq('business_id', business_id)
      .maybeSingle()

    const settings = settingsRow || {
      business_id,
      sections: {
        revenue_detail: true, cogs_detail: true, opex_detail: true,
        payroll_detail: false, subscription_detail: false,
        balance_sheet: false, cashflow: false, trend_charts: true,
      },
      show_prior_year: true,
      show_ytd: true,
      show_unspent_budget: true,
      show_budget_next_month: true,
      show_budget_annual_total: true,
      budget_forecast_id: null,
      budget_source: 'forecast',
    }

    // 2. Load account mappings
    const { data: mappings, error: mappingsErr } = await supabase
      .from('account_mappings')
      .select('*')
      .eq('business_id', business_id)

    if (mappingsErr) {
      Sentry.captureException(mappingsErr, { tags: { route: 'monthly-report/generate' }, extra: { context: "[Report Generate] Error loading mappings" } } as any)
      return NextResponse.json({ error: 'Failed to load account mappings' }, { status: 500 })
    }

    if (!mappings || mappings.length === 0) {
      return NextResponse.json(
        { error: 'No account mappings found. Please set up account mappings first.', code: 'NO_MAPPINGS' },
        { status: 400 }
      )
    }

    // 3. Determine the budget.
    //
    // The source lives behind resolveBudget() so it can become a real budget
    // object (budget_versions/budget_lines) without this route noticing. Today
    // it still resolves a forecast, by exactly the cascade that used to be
    // inline here — see src/lib/budgets/resolve-budget.ts and
    // .planning/BUDGET-STORE-PLAN.md.

    // Fetched here, not in the resolver: this same row supplies yearStartMonth
    // below, and two reads could disagree.
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('id, fiscal_year_start')
      .eq('business_id', business_id)
      .maybeSingle()

    const yearStartMonth: number = profile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
    // Hoisted above resolveBudget: the report reads four windows out of the
    // budget (the month, YTD, the annual total, next month), so the resolver
    // needs every month it will be asked about — not just the anchor.
    const allFYMonths = generateFiscalMonthKeys(fiscal_year, yearStartMonth)

    const resolvedBudget = await resolveBudget(supabase, {
      businessId: business_id,
      profileId: profile?.id ?? null,
      fiscalYear: fiscal_year,
      reportMonth: report_month,
      months: allFYMonths,
      // Read positively. Most businesses have no settings row at all, so this
      // arrives undefined rather than 'forecast'; a `!== 'forecast'` test would
      // switch every one of them onto the budget store.
      budgetSource: settings.budget_source === 'budget_version' ? 'budget_version' : 'forecast',
      pin: { budgetForecastId: settings.budget_forecast_id },
    })

    const budgetPLLines: any[] = resolvedBudget.lines
    // 'none' is the only no-budget state, and it already covers "resolved a
    // forecast that had zero lines" — the honest no-budget banner depends on it.
    const hasBudget = resolvedBudget.source !== 'none'
    const budgetForecastName: string | undefined = resolvedBudget.label ?? undefined

    // 4. Load xero_pl_lines (actuals).
    //    Phase 44 D-13 — route through ForecastReadService when an active forecast
    //    exists for (business_id, fiscal_year). The service does long→wide
    //    aggregation across tenants and asserts the D-18 freshness invariant.
    //    Fall back to a direct xero_pl_lines_wide_compat read only when no active
    //    forecast exists (e.g. very new business).
    const ids = await resolveBusinessProfileIds(supabase, business_id)
    let xeroLines: { account_code: string | null; account_name: string; account_type: string; section: string; monthly_values: Record<string, number> }[] = []

    // The active forecast for actuals routing is independent of `budgetForecast`
    // (which may be a custom non-active forecast via settings.budget_forecast_id).
    const { data: actualsForecast } = await supabase
      .from('financial_forecasts')
      .select('id')
      .in('business_id', ids.all)
      .eq('fiscal_year', fiscal_year)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // D-44.2-03 quality gate — non-blocking; UI banner consumes. Set on
    // both code paths below.
    let dataQuality: { data_quality: string; per_tenant_quality: any[] } = {
      data_quality: 'no_sync',
      per_tenant_quality: [],
    }

    if (actualsForecast?.id) {
      // D-13 path. D-18 invariant violations propagate to the outer catch.
      const composite = await createForecastReadService(supabase).getMonthlyComposite(actualsForecast.id)
      xeroLines = composite.rows.map(r => ({
        // Null on the multi-currency branch — the consolidation engine groups
        // on its own alignment key and drops the code. That is a MISSING key,
        // not a coded account whose code is blank, and the match cascade below
        // falls through to the name tiers exactly as it always did.
        account_code: r.account_code ?? null,
        account_name: r.account_name,
        account_type: r.account_type,
        section: '',
        monthly_values: r.monthly_values,
      }))
      dataQuality = {
        data_quality: composite.data_quality,
        per_tenant_quality: composite.per_tenant_quality,
      }
    } else {
      // Fallback: no active forecast → read raw Xero rows.
      const { data: rawXeroLines, error: xeroErr } = await supabase
        .from('xero_pl_lines_wide_compat')
        .select('account_code, account_name, account_type, section, monthly_values')
        .in('business_id', ids.all)

      if (xeroErr) {
        Sentry.captureException(xeroErr, { tags: { route: 'monthly-report/generate' }, extra: { context: "[Report Generate] Error loading xero_pl_lines" } } as any)
        return NextResponse.json({ error: 'Failed to load Xero actuals' }, { status: 500 })
      }

      // Deduplicate (legacy paths only — service path is already pre-deduplicated).
      const xeroDedup = new Map<string, { account_code: string | null; account_name: string; account_type: string; section: string; monthly_values: Record<string, number> }>()
      for (const row of (rawXeroLines || [])) {
        const existing = xeroDedup.get(row.account_name)
        if (existing) {
          existing.monthly_values = { ...existing.monthly_values, ...row.monthly_values }
          // This legacy path collapses on the NAME, so a merged row can be two
          // different Xero accounts. Whichever code arrived first would then
          // claim the merged row's whole budget. Drop the code instead: an
          // account we cannot identify falls through to the name tiers, which
          // is what this path did before codes existed. Do not "pick one".
          if ((existing.account_code ?? null) !== (row.account_code ?? null)) existing.account_code = null
        } else {
          xeroDedup.set(row.account_name, { ...row, account_code: row.account_code ?? null })
        }
      }
      xeroLines = Array.from(xeroDedup.values())

      if (rawXeroLines && rawXeroLines.length !== xeroLines.length) {
        Sentry.captureMessage(`[Report Generate] Deduplicated xero_pl_lines: ${rawXeroLines.length} rows → ${xeroLines.length} unique accounts`, 'warning' as any)
      }
      // D-44.2-03 quality gate — fallback path; compute via public wrapper.
      const fallbackQuality = await createForecastReadService(supabase).getDataQualityForBusiness(ids.all)
      dataQuality = {
        data_quality: fallbackQuality.data_quality,
        per_tenant_quality: fallbackQuality.per_tenant_quality,
      }
    }

    // 5. Build lookup maps
    const mappingByXeroName = new Map<string, any>()
    for (const m of mappings) {
      mappingByXeroName.set(m.xero_account_name, m)
    }

    // The Xero codes this business actually uses, for statement ORDER. Only a
    // code the actuals or the Xero-sourced mappings vouch for is put on a line:
    // a budget line's own code can be a forecast wizard's ('opex-28' is on
    // Urban Road's Foreign Currency Gains and Losses), and sorting by that
    // would print the row somewhere meaningless. See statement-order.ts.
    //
    // The budget lines' codes count too — but ONLY when they came from the
    // budget store. budget_lines is imported from Xero's Budgets API, so those
    // are Xero codes, and a budgeted-but-never-posted account with no mapping
    // has no other source for one. On the forecast path the lines carry no code
    // today (resolve-budget does not select it) and, if they ever do, it can be
    // a wizard's, so the forecast path adds nothing.
    const realCodes = realStatementCodes([
      ...(xeroLines || []).map(x => x.account_code),
      ...mappings.map((m: any) => m.xero_account_code),
      ...(resolvedBudget.source === 'budget_version'
        ? budgetPLLines.map((bl: any) => bl.account_code).filter((c: string | null) => !looksLikeWizardCode(c))
        : []),
    ])

    // Budget lines lookup by various keys
    const budgetById = new Map<string, any>()
    for (const bl of budgetPLLines) {
      budgetById.set(bl.id, bl)
    }
    // Fuzzy lookup handles "Wages & Salaries" vs "Salaries & Wages" etc.
    const findBudgetByName = buildFuzzyLookup(budgetPLLines, (bl) => bl.account_name)

    // Budget lines by Xero account code — the only key that is literally the
    // same string on both sides of the comparison. Empty for every client on
    // the forecast path, because forecast_pl_lines has no code column; that is
    // what makes the code tier below inert there rather than merely unlikely.
    // First writer wins, mirroring buildFuzzyLookup, so a duplicated code
    // cannot flip which line is matched depending on read order.
    const budgetByCode = new Map<string, any>()
    for (const bl of budgetPLLines) {
      const code = String(bl.account_code ?? '').trim().toLowerCase()
      if (!code) continue
      if (!budgetByCode.has(code)) budgetByCode.set(code, bl)
    }

    // FY range — parameterized by business fiscal_year_start (computed above,
    // because resolveBudget needs the same list).
    const fyStart = allFYMonths[0]
    const fyEnd = allFYMonths[allFYMonths.length - 1]
    const ytdMonths = getMonthRange(fyStart, report_month)
    const priorYearMonth = getPriorYearMonth(report_month)
    const nextMonth = getNextMonth(report_month)

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Report Generate] Data loaded:', {
        xeroLines: xeroLines?.length || 0,
        budgetPLLines: budgetPLLines.length,
        mappings: mappings.length,
        mappingsWithForecastLink: mappings.filter((m: any) => m.forecast_pl_line_id).length,
        report_month,
        fiscal_year,
        yearStartMonth,
        fyStart,
        fyEnd,
        sampleXeroMonths: xeroLines?.[0]?.monthly_values ? Object.keys(xeroLines[0].monthly_values).slice(0, 5) : [],
        sampleBudgetMonths: budgetPLLines[0]?.forecast_months ? Object.keys(budgetPLLines[0].forecast_months).slice(0, 5) : [],
      })
    }

    // Track which budget lines were matched (for budget-only section later)
    const matchedBudgetLineIds = new Set<string>()
    // Also track the IDENTITY of each matched budget line — its code, or its
    // name when it has none (budgetLineKey). Handles duplicate forecast lines
    // that share a name but have different IDs, without which the budget-only
    // pass re-emits the same account a second time. It must be the SAME key the
    // resolver grouped on: keyed on the name here while the resolver groups on
    // the code, a genuine second account that shares a name is suppressed and
    // its whole annual budget vanishes from the subtotal.
    const matchedBudgetLineKeys = new Set<string>()
    // Track which budget lines have already had their budget values assigned to a Xero line.
    // This prevents the same forecast line's budget from being counted multiple times when
    // multiple Xero accounts fuzzy-match to the same forecast line.
    const claimedBudgetLineIds = new Set<string>()
    const matchLog: {
      xero: string
      budget: string | null
      method: string
      budgetClaimed: boolean
      /** Present only when a pin and the account code named different lines. */
      codeWouldHaveMatched?: string
    }[] = []

    // 6. Process each Xero actual line
    const categoryLines: Record<string, ReportLine[]> = {
      'Revenue': [],
      'Cost of Sales': [],
      'Operating Expenses': [],
      'Other Income': [],
      'Other Expenses': [],
    }

    for (const xero of (xeroLines || [])) {
      const mapping = mappingByXeroName.get(xero.account_name)
      const category = mapping?.report_category || mapTypeToCategory(xero.account_type)
      const isRevenue = category === 'Revenue' || category === 'Other Income'
      const monthlyValues: Record<string, number> = xero.monthly_values || {}

      // Non-cash items — show actuals only, no budget
      const lowerName = xero.account_name.toLowerCase()
      const excludeFromBudget = lowerName.includes('depreciation') || lowerName.includes('amortisation') || lowerName.includes('amortization')

      // Find matching budget line.
      // Tiers: the coach's pin → the account code → the mapping name → the
      // fuzzy name match. Two identities and then two guesses.
      let budgetLine: any = null
      let matchMethod = 'none'
      /**
       * The budget line the CODE would have chosen, when a pin chose a
       * different one. Null whenever they agree or only one of them answered.
       * Recorded rather than resolved: the pin wins, and a reader needs to be
       * able to find out that the two disagreed — otherwise the only symptom
       * is a budget figure that looks perfectly ordinary against the wrong
       * account.
       */
      let codeDisagreedWithPin: string | null = null
      if (!excludeFromBudget) {
        // The actuals row's own code, the mapping's second. The row's code is
        // the FACT — what Xero posted — while account_mappings carries a copy,
        // so where the two can disagree the fact wins. The mapping is consulted
        // only when the row has no code at all, which is the real state of
        // Xero's synthetic report-only lines: they arrive with a blank code and
        // can be given one nowhere else.
        const xeroCode = String(xero.account_code ?? mapping?.xero_account_code ?? '').trim().toLowerCase()
        const byCode = xeroCode ? budgetByCode.get(xeroCode) : undefined

        // -- Tier 0: the coach's pin ---------------------------------------
        // A pin is a human being saying which budget line this account IS.
        // The code is an identity the two sides happen to share, which is a
        // very good inference and still an inference. When a person has stated
        // the answer, an inference does not get to overrule them — it gets to
        // be recorded as disagreeing with them.
        if (mapping?.forecast_pl_line_id) {
          budgetLine = budgetById.get(mapping.forecast_pl_line_id)
          if (budgetLine) {
            matchMethod = 'forecast_pl_line_id'
            if (byCode && byCode.id !== budgetLine.id) {
              codeDisagreedWithPin = byCode.account_name ?? null
            }
          }
        }

        // -- Tier 1: the account code --------------------------------------
        // Above the name tiers because it is an identity rather than a guess.
        // Names diverge across the two sides for ordinary bookkeeping reasons
        // (Urban Road's P&L "Foreign Currency Gains and Losses" against its
        // budget's "Foreign Currency Loss/Gain") and the fuzzy lookup then
        // fails silently, printing the account twice: once with the actual and
        // a $0 budget, once budget-only with a $0 actual.
        //
        // Inert wherever the budget lines carry no codes — the resolver does
        // not select forecast_pl_lines.account_code, so budgetByCode is empty
        // on the forecast path and every client not on the budget store falls
        // straight through to the tiers below and behaves exactly as before.
        if (!budgetLine && byCode) {
          budgetLine = byCode
          matchMethod = 'account_code'
        }
        if (!budgetLine && mapping?.forecast_pl_line_name) {
          budgetLine = findBudgetByName(mapping.forecast_pl_line_name)
          if (budgetLine) matchMethod = 'forecast_pl_line_name'
        }
        if (!budgetLine) {
          budgetLine = findBudgetByName(xero.account_name)
          if (budgetLine) matchMethod = 'name_fallback'
        }
      }

      // Every tier lands here, the code tier included. The double-claim guard
      // below and the budget-only pass are both driven off these two sets, so a
      // tier that matched without registering here would have its line re-emitted
      // as a duplicate budget-only row: the account printed twice, once with the
      // actual and a $0 budget and once with the budget and a $0 actual, each
      // carrying a per-row variance that is a fact about nothing. The section
      // subtotal survives that (it sums both halves back together) — what does
      // not survive is a reader trying to tie the account list to Xero.
      if (budgetLine) {
        matchedBudgetLineIds.add(budgetLine.id)
        matchedBudgetLineKeys.add(budgetLineKey(budgetLine))
      }

      // Prevent double-counting: if this budget line's values were already assigned
      // to another Xero account, this Xero line gets actuals only (budget = 0).
      const budgetAlreadyClaimed = budgetLine && claimedBudgetLineIds.has(budgetLine.id)
      if (budgetLine && !budgetAlreadyClaimed) {
        claimedBudgetLineIds.add(budgetLine.id)
      }

      matchLog.push({
        xero: xero.account_name,
        budget: budgetLine?.account_name || null,
        method: matchMethod,
        budgetClaimed: !budgetAlreadyClaimed,
        ...(codeDisagreedWithPin ? { codeWouldHaveMatched: codeDisagreedWithPin } : {}),
      })

      if (budgetAlreadyClaimed) {
        Sentry.captureMessage(`[Report Generate] Budget line "${budgetLine.account_name}" already claimed — skipping budget for Xero account "${xero.account_name}"`, 'warning' as any)
      }

      // Only use budget values if this is the first Xero account to claim this budget line
      const budgetMonths: Record<string, number> = (budgetLine && !budgetAlreadyClaimed) ? (budgetLine.forecast_months || {}) : {}

      // Monthly values
      const actual = monthlyValues[report_month] || 0
      const budget = budgetMonths[report_month] || 0
      const { amount: varAmt, percent: varPct } = calcVariance(actual, budget, isRevenue)

      // YTD
      const ytdActual = ytdMonths.reduce((s, m) => s + (monthlyValues[m] || 0), 0)
      const ytdBudget = ytdMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)
      const { amount: ytdVarAmt, percent: ytdVarPct } = calcVariance(ytdActual, ytdBudget, isRevenue)

      // Annual total (full FY from budget)
      const budgetAnnualTotal = allFYMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)

      // Unspent budget
      const unspentBudget = budgetAnnualTotal - ytdActual

      // Budget next month
      const budgetNextMonth = budgetMonths[nextMonth] || 0

      // Prior year
      const priorYear = monthlyValues[priorYearMonth] !== undefined ? (monthlyValues[priorYearMonth] || 0) : null

      const line: ReportLine = {
        account_name: xero.account_name,
        xero_account_name: xero.account_name,
        group: mapping?.report_subcategory ?? null,
        // The row's own code first — the fact — then the mapping's. Close to the
        // match cascade above but not identical: the cascade uses
        // `xero.account_code ?? mapping.xero_account_code`, so a blank-string row
        // code never reaches the mapping there, while statementAccountCode trims
        // '' to nothing and falls through to it. For ORDER that is the better
        // answer. Carried as Xero spells it (not the lower-cased match key)
        // because it is what the section sorts on.
        account_code: statementAccountCode([xero.account_code, mapping?.xero_account_code], realCodes),
        is_budget_only: false,
        actual,
        budget,
        variance_amount: varAmt,
        variance_percent: varPct,
        ytd_actual: ytdActual,
        ytd_budget: ytdBudget,
        ytd_variance_amount: ytdVarAmt,
        ytd_variance_percent: ytdVarPct,
        unspent_budget: unspentBudget,
        budget_next_month: budgetNextMonth,
        budget_annual_total: budgetAnnualTotal,
        prior_year: priorYear,
      }

      if (categoryLines[category]) {
        categoryLines[category].push(line)
      } else {
        categoryLines['Operating Expenses'].push(line)
      }
    }

    // 7. Add budget-only lines (budget accounts with no matching Xero actual).
    // Tracked by IDENTITY — the account code, or the name when there is none —
    // so two rows for one account cannot both add their budget.
    const addedBudgetOnlyKeys = new Set<string>()
    if (hasBudget) {
      for (const bl of budgetPLLines) {
        if (matchedBudgetLineIds.has(bl.id)) continue

        // Skip if a budget line with this same IDENTITY was already matched to a
        // Xero account or already added as budget-only (handles duplicate
        // forecast_pl_lines rows). Identity, not name: two accounts that share a
        // name but carry different codes are two accounts, and suppressing the
        // second would delete a real budget from the subtotal rather than
        // deduplicate a phantom.
        const blKey = budgetLineKey(bl)
        if (matchedBudgetLineKeys.has(blKey)) continue
        if (addedBudgetOnlyKeys.has(blKey)) continue
        addedBudgetOnlyKeys.add(blKey)

        const budgetMonths: Record<string, number> = bl.forecast_months || {}
        const category = bl.category || 'Operating Expenses'
        const isRevenue = category === 'Revenue' || category === 'Other Income'

        const budget = budgetMonths[report_month] || 0
        const ytdBudget = ytdMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)
        const budgetAnnualTotal = allFYMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)
        const budgetNextMonth = budgetMonths[nextMonth] || 0

        // Skip lines with zero budget everywhere
        if (budgetAnnualTotal === 0 && budget === 0) continue

        const { amount: varAmt, percent: varPct } = calcVariance(0, budget, isRevenue)
        const { amount: ytdVarAmt, percent: ytdVarPct } = calcVariance(0, ytdBudget, isRevenue)

        const line: ReportLine = {
          account_name: bl.account_name,
          xero_account_name: null,
          // A budget-only line has no Xero account behind it, so its group has
          // to come from the name the budget uses. Matched the same way the
          // rest of the row is: by the mapping the name resolves to, if any.
          group: mappingByXeroName.get(bl.account_name)?.report_subcategory ?? null,
          // The line's own code only if it is a real Xero code — on the forecast
          // path it can be a wizard code — else the code of the mapping its
          // name resolves to, else none.
          account_code: statementAccountCode(
            [bl.account_code, mappingByXeroName.get(bl.account_name)?.xero_account_code],
            realCodes,
          ),
          is_budget_only: true,
          actual: 0,
          budget,
          variance_amount: varAmt,
          variance_percent: varPct,
          ytd_actual: 0,
          ytd_budget: ytdBudget,
          ytd_variance_amount: ytdVarAmt,
          ytd_variance_percent: ytdVarPct,
          unspent_budget: budgetAnnualTotal,
          budget_next_month: budgetNextMonth,
          budget_annual_total: budgetAnnualTotal,
          prior_year: null,
        }

        if (categoryLines[category]) {
          categoryLines[category].push(line)
        } else {
          categoryLines['Operating Expenses'].push(line)
        }
      }
    }

    // 8. Build sections with subtotals
    const sectionOrder = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses']
    const sections = sectionOrder
      .filter(cat => categoryLines[cat] && categoryLines[cat].length > 0)
      .map(cat => {
        // Xero account-code order, compared as text, codeless lines A-Z after —
        // the order the reference pack prints. See statement-order.ts for why
        // text and not numeric. The Full Year route uses the same comparator.
        const lines = categoryLines[cat].sort(compareStatementLines)
        const isRev = cat === 'Revenue' || cat === 'Other Income'
        const subtotal = buildSubtotal(lines, `Total ${cat}`)
        // Calculate subtotal variance percent
        subtotal.variance_percent = subtotal.budget !== 0
          ? (subtotal.variance_amount / Math.abs(subtotal.budget)) * 100 : 0
        subtotal.ytd_variance_percent = subtotal.ytd_budget !== 0
          ? (subtotal.ytd_variance_amount / Math.abs(subtotal.ytd_budget)) * 100 : 0

        return { category: cat, lines, subtotal }
      })

    // 9/10. Profit rows + summary — WA.1: single canonical derivation.
    // Gross Profit = Revenue − COGS (trading only); Operating Profit = GP −
    // OpEx; Other Income and Other Expenses enter once, at Net Profit. The old
    // inline math folded Other Income into revenue and Other Expenses into
    // opex, inflating GP/GP% on every report whose chart had those sections.
    // See deriveProfitRows in @/lib/monthly-report/shared for the full account.
    const revSection = sections.find(s => s.category === 'Revenue')
    const cogsSection = sections.find(s => s.category === 'Cost of Sales')
    const opexSection = sections.find(s => s.category === 'Operating Expenses')
    const otherIncSection = sections.find(s => s.category === 'Other Income')
    const otherExpSection = sections.find(s => s.category === 'Other Expenses')

    const derived = deriveProfitRows({
      revenue: revSection?.subtotal,
      cogs: cogsSection?.subtotal,
      opex: opexSection?.subtotal,
      otherIncome: otherIncSection?.subtotal,
      otherExpenses: otherExpSection?.subtotal,
      hasBudget,
    })
    const { summary } = derived
    const gpRow = derived.gross_profit_row
    const opRow = derived.operating_profit_row
    const npRow = derived.net_profit_row

    // Debug: log match results
    const matched = matchLog.filter(m => m.method !== 'none')
    const unmatched = matchLog.filter(m => m.method === 'none')
    const duplicateBudgetMatches = matchLog.filter(m => m.method !== 'none' && !m.budgetClaimed)
    // A pin and an account code naming different budget lines is not an error —
    // the pin is honoured — but it means one of the two is stale, and nothing
    // else on the page will ever say so.
    const pinCodeDisagreements = matchLog.filter(m => m.codeWouldHaveMatched)
    const unmatchedBudgetLines = budgetPLLines.filter(bl => !matchedBudgetLineIds.has(bl.id))
    const skippedByIdentity = unmatchedBudgetLines.filter(bl => matchedBudgetLineKeys.has(budgetLineKey(bl)))

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Report Generate] Matching results:', {
        xeroAccountsTotal: matchLog.length,
        matchedToBudget: matched.length,
        unmatchedXero: unmatched.length,
        unmatchedBudgetLines: unmatchedBudgetLines.length,
        budgetDuplicatesBlocked: duplicateBudgetMatches.length,
        pinCodeDisagreements: pinCodeDisagreements.length,
        budgetOnlySkippedByIdentity: skippedByIdentity.length,
        budgetOnlyAdded: addedBudgetOnlyKeys.size,
        matchMethods: {
          account_code: matched.filter(m => m.method === 'account_code').length,
          forecast_pl_line_id: matched.filter(m => m.method === 'forecast_pl_line_id').length,
          forecast_pl_line_name: matched.filter(m => m.method === 'forecast_pl_line_name').length,
          name_fallback: matched.filter(m => m.method === 'name_fallback').length,
        },
        budgetOnlySkippedNames: skippedByIdentity.map(bl => bl.account_name),
        unmatchedXeroSample: unmatched.slice(0, 10).map(m => m.xero),
        unmatchedBudgetSample: unmatchedBudgetLines.filter(bl => !matchedBudgetLineKeys.has(budgetLineKey(bl))).slice(0, 10).map((bl: any) => bl.account_name),
      })
    }

    const report = {
      business_id,
      report_month,
      fiscal_year,
      settings,
      sections,
      summary,
      gross_profit_row: gpRow,
      operating_profit_row: opRow,
      net_profit_row: npRow,
      is_draft: force_draft || false,
      unreconciled_count: 0,
      has_budget: hasBudget,
      budget_forecast_name: budgetForecastName,
      budget_forecast_id: resolvedBudget.forecastId,
      // Provenance: which budget version produced these variances, and — when
      // there are none — why, so the banner can say it instead of leaving a
      // blank column that reads as $0.
      budget_version_id: resolvedBudget.versionId,
      budget_source: resolvedBudget.source,
      no_budget_reason: resolvedBudget.noBudgetReason,
    }

    return NextResponse.json({
      success: true,
      report,
      data_quality: dataQuality.data_quality,
      per_tenant_quality: dataQuality.per_tenant_quality,
      _debug: {
        xero_accounts: matchLog.length,
        budget_lines: budgetPLLines.length,
        matched: matched.length,
        pin_code_disagreements: pinCodeDisagreements.map(m => ({
          xero: m.xero,
          pinned: m.budget,
          code_would_have_matched: m.codeWouldHaveMatched,
        })),
        unmatched_xero: unmatched.map(m => m.xero),
        unmatched_budget: unmatchedBudgetLines.map((bl: any) => bl.account_name),
        match_detail: matchLog,
      }
    })

  } catch (error: any) {
    const message = String(error?.message ?? error)
    const isInvariant = message.includes('INVARIANT VIOLATED')
    Sentry.captureException(error, { tags: { route: 'monthly-report/generate' }, extra: { context: "[Report Generate] Error" } } as any)
    return NextResponse.json(
      {
        error: isInvariant ? message : 'Failed to generate report',
        invariant_violation: isInvariant || undefined,
      },
      { status: 500 },
    )
  }
}

export const POST = withSchema('monthly-report/generate', GeneratePostSchema, postHandler)
