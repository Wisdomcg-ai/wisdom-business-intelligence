/**
 * Render a monthly pack to a PDF on disk, headless, from real prod figures —
 * the SAME pack the monthly-report page's Export PDF would produce.
 *
 * This exists because the August 2026 Urban Road pack shipped with three
 * saturated section bands, a full grid of borders, a dollar sign on every cell,
 * dozens of dormant $0 accounts and a budget column reading the wrong yardstick
 * — and nobody, me included, had ever looked at a page this service produces.
 * Every judgement about the pack's appearance had been made from source code.
 *
 *   npx tsx scripts/preview-pack.ts --business <uuid> --month 2026-08 --out /tmp/pack.pdf
 *
 * What it mirrors. The export (page.tsx: loadPdfSections → MonthlyReportPDFService)
 * loads every page's data through its routes. Each route's build now lives in a
 * shared loader under src/lib, and this script calls THOSE loaders — never a
 * copy of their logic — so the harness and the app cannot drift:
 *
 *   report + commentary  the stored snapshot, hydrated as the page hydrates it
 *   settings             report-settings-load (+ the default template, as on page load)
 *   full year            full-year-load
 *   wages                wages-detail-load (stored payslips; no live fallback)
 *   payroll grid         payroll-grid-load
 *   ratio analysis       account-actuals-load
 *   cashflow             pack-cash-model-load + pack-cash-model when the business's cash_model
 *                        is on; otherwise select-forecast + cashflow-assumptions-load +
 *                        opening-bank-load + pack-cashflow
 *   external metrics     external-metrics-load
 *   memo                 the snapshot's coach_notes
 *   money flow           money-flow-load
 *   uploaded pages       pack-inserts-load (the month's newest upload per placement), each
 *                        file read from Storage with a GET — and merged by services/pack-pdf,
 *                        the builder Export PDF and Approve & Send call
 *
 * What it cannot mirror. Three pages are built from a LIVE Xero call in the
 * app, and taking a Xero token can refresh and rotate it — a write that races
 * the refresh cron — so this script never does:
 *
 *   subscription_detail  built from what the route persisted
 *                        (subscription_vendor_actuals) through the route's own
 *                        assembler — APPROXIMATE, see subscription-detail-persisted
 *   contractor_detail    skipped (nothing persisted), unless supplied
 *   balance_sheet        the sheets an Approve & Send printed, or a FINAL
 *                        month's copy frozen at Finalise, as the app prints
 *                        them; otherwise its "couldn't be produced" reason,
 *                        unless supplied
 *
 * Any of the three can be supplied as the route's JSON response body (copy it
 * from the browser's network tab) in --payload-dir:
 *
 *   subscription-detail.json   POST /api/monthly-report/subscription-detail (subscription codes)
 *   contractor-detail.json     POST /api/monthly-report/subscription-detail (contractor codes; with
 *                              `months` for a Contractors Payment Summary placement)
 *   balance-sheet-mom.json     GET  /api/Xero/balance-sheet?compare=mom
 *   balance-sheet-yoy.json     GET  /api/Xero/balance-sheet?compare=yoy
 *   commentary.json            the commentary map (POST /api/monthly-report/commentary's
 *                              `commentary`), in place of the snapshot's — how a
 *                              commentary rule is looked at before a Regenerate
 *   insert-<widget id>.pdf     the file for that Uploaded Page placement, in place of
 *                              the month's upload — how a page is looked at before
 *                              anyone uploads it
 *
 * Nor can it mirror what the export inherits from how the page got to the
 * Export button. A headless run has no history, so it takes the clean path:
 *
 *   default template     applied here whenever one exists. The page applies it
 *                        only if settings have already loaded when the
 *                        templates resolve — it sets hasAppliedDefaultTemplate
 *                        either way, so a slow settings load exports WITHOUT it
 *                        for the rest of the visit. A warning is printed when a
 *                        default template exists.
 *   forecast periods     corrected in memory here. The app persists the
 *                        correction first and, if that update fails, runs the
 *                        cashflow on the stale periods.
 *   stale tab state      the export reuses the Full Year, subscription, wages
 *                        and cashflow data a tab already holds
 *                        (`let fyReport = fullYearReport`, `cashflowForecast ||`),
 *                        which can belong to a month viewed earlier in the
 *                        visit. This loads the requested month fresh, every time.
 *
 * Other switches:
 *
 *   --layout-file layout.json   render THIS layout instead — how a new
 *                               placement is looked at BEFORE anyone saves it
 *   --no-layout                 the legacy hard-coded page order
 *   --backfill-groups           re-read each expense line's group from TODAY's
 *                               account_mappings (what a Regenerate would give);
 *                               by default the snapshot prints as stored, as
 *                               the app's export does
 *   --no-persisted-subscriptions  skip the subscription page rather than
 *                               approximate it
 *   --settings-override '{"show_prior_year":false}'
 *                               render with these report settings changed —
 *                               how a settings change is looked at before
 *                               anyone saves it (applied to the stored
 *                               settings AND the snapshot's own copy, which is
 *                               what the statement pages read)
 *
 * Strictly read-only: every fetch the process makes — the database client's
 * included — lets only GET and HEAD leave and refuses any Xero host, and the
 * client's builders refuse every write verb and RPC by name on top. It writes
 * nothing but the PDF, and prints a page map — page → widget → where its data
 * came from — at the end.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import fs from 'fs'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createReadOnlyClient, readOnlyFetch } from '@/lib/supabase/read-only-client'

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const businessId = arg('business')
const month = arg('month')
const out = arg('out') ?? '/tmp/pack-preview.pdf'
const payloadDir = arg('payload-dir')
if (!businessId || !month || !/^\d{4}-\d{2}$/.test(month)) {
  console.error('Usage: --business <uuid> --month YYYY-MM [--out path.pdf] [--payload-dir dir] [--layout-file f | --no-layout] [--backfill-groups] [--no-persisted-subscriptions]')
  process.exit(1)
}

// ── Read-only guards ────────────────────────────────────────────────────────
// The database client's own fetch lets only GET and HEAD leave, so no write
// reaches prod whichever supabase-js door it takes; the builder-level refusals
// on top name the table when a loader tries. The global fetch gets the same
// guard, for anything that fetches on its own — a loader reaching for Xero.
const realFetch = globalThis.fetch
const admin = createReadOnlyClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey(), realFetch)
globalThis.fetch = readOnlyFetch(realFetch)

// The shared loaders keep their routes' development logging ('[WagesDetail] …',
// '[Forecast] …'). Useful in a dev server's terminal; noise over a page map.
const realLog = console.log
console.log = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && /^\[[A-Za-z][\w .-]*\]/.test(args[0])) return
  realLog(...args)
}

// ── Provenance, for the page map ────────────────────────────────────────────
type SourceStatus = 'live-built' | 'persisted' | 'payload' | 'snapshot' | 'skipped'
const sources = new Map<string, { status: SourceStatus; detail: string }>()
const note = (key: string, status: SourceStatus, detail: string) => sources.set(key, { status, detail })
const warnings: string[] = []

function readPayload(name: string): unknown | undefined {
  if (!payloadDir) return undefined
  const file = path.join(payloadDir, name)
  if (!fs.existsSync(file)) return undefined
  const body = JSON.parse(fs.readFileSync(file, 'utf8'))
  // A route body is { success, data } for the POST routes; the balance sheet is bare.
  return body && typeof body === 'object' && 'data' in body && 'success' in body ? body.data : body
}

/** Which loaded dataset a widget type prints from. */
function sourceKeyFor(type: string, config: unknown): string {
  switch (type) {
    case 'full_year_projection': case 'analysis_chart_income': case 'analysis_chart_cogs': case 'analysis_chart_expense':
    case 'chart_break_even': case 'chart_revenue_vs_expenses': case 'chart_variance_heatmap': case 'chart_team_cost_pct':
      return 'fullYear'
    case 'chart_cash_runway': case 'chart_cumulative_net_cash': case 'chart_working_capital_gap':
    case 'chart_cashflow_forecast': case 'cashflow_forecast_table':
      return 'cashflow'
    case 'subscription_detail': case 'chart_subscription_creep': return 'subscription'
    case 'contractor_detail': return 'contractor'
    case 'payroll_grid': return 'payroll'
    case 'ratio_analysis': return 'ratio'
    case 'wages_detail': case 'chart_cost_per_employee': return 'wages'
    case 'external_metric': return 'external'
    case 'memo': return 'memo'
    case 'money_flow': return 'moneyFlow'
    case 'consolidated_pl': return 'consolidated'
    case 'uploaded_insert': return 'inserts'
    case 'balance_sheet': {
      const compare = (config as { compare?: string } | undefined)?.compare === 'mom' ? 'mom' : 'yoy'
      return `balanceSheet:${compare}`
    }
    default: return 'report'
  }
}

async function main() {
  // jsPDF needs a DOM-ish global before the service module is imported.
  const { JSDOM } = (await import('jsdom' as string)) as any
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const g = globalThis as unknown as Record<string, unknown>
  g.window = dom.window as unknown
  g.document = dom.window.document
  g.navigator = dom.window.navigator
  g.HTMLCanvasElement = dom.window.HTMLCanvasElement
  g.Image = dom.window.Image

  const bizId = businessId!
  const reportMonth = month!

  // ── Report + commentary + memo: the stored snapshot, as the page loads it ──
  const { data: snap, error: snapErr } = await admin
    .from('monthly_report_snapshots')
    .select('report_data, commentary, report_month, coach_notes, status, generated_at')
    .eq('business_id', bizId)
    .eq('report_month', reportMonth)
    .maybeSingle()
  if (snapErr) throw snapErr
  if (!snap?.report_data) {
    console.error(`No stored report for ${bizId} ${reportMonth}. Generate it in the app first.`)
    process.exit(1)
  }
  const { data: biz } = await admin.from('businesses').select('name').eq('id', bizId).maybeSingle()

  const { deserializeReportSections } = await import('@/app/finances/monthly-report/utils/snapshot-serializer')
  const report: Record<string, any> = { ...(snap.report_data as Record<string, unknown>) }
  report.sections = deserializeReportSections(report.sections ?? [])
  note('report', 'snapshot', `stored snapshot (${snap.status ?? 'no status'}), hydrated as the page loads it`)

  // The snapshot's lines carry the group each account had when Generate ran.
  // Say when today's mappings would print a different heading; change nothing
  // unless asked.
  const { data: maps } = await admin
    .from('account_mappings')
    .select('xero_account_name, report_subcategory')
    .eq('business_id', bizId)
    .is('deleted_at', null)
  const groupOf = new Map<string, string | null>(
    (maps ?? []).map((m: { xero_account_name: string; report_subcategory: string | null }) => [m.xero_account_name, m.report_subcategory]),
  )
  const drifted: string[] = []
  for (const sec of report.sections as { lines?: { account_name: string; group?: string | null }[] }[]) {
    for (const l of sec.lines ?? []) {
      const today = groupOf.get(l.account_name) ?? null
      if ((l.group ?? null) !== today) {
        drifted.push(`${l.account_name}: ${l.group ?? '(none)'} → ${today ?? '(none)'}`)
        if (flag('backfill-groups')) l.group = today
      }
    }
  }
  if (drifted.length > 0) {
    warnings.push(
      `${drifted.length} expense line(s) carry a group that today's account_mappings would change` +
        (flag('backfill-groups') ? ' — BACKFILLED (--backfill-groups)' : ' — printed as stored; Regenerate in the app, or pass --backfill-groups') +
        `:\n      ${drifted.join('\n      ')}`,
    )
  }

  // ── Settings, as the page holds them at export ──
  const { loadReportSettings, loadReportTemplates } = await import('@/lib/monthly-report/report-settings-load')
  const { settingsWithDefaultTemplate } = await import('@/app/finances/monthly-report/utils/template-settings')
  const stored = await loadReportSettings(admin, bizId)
  const templated = settingsWithDefaultTemplate(stored.settings, await loadReportTemplates(admin, bizId))
  const settings = templated.settings
  if (templated.template) {
    warnings.push(
      `default template "${templated.template.name}" was applied, but the app applies it only when settings load before ` +
        'the templates do (page.tsx) — an export can go out on the stored settings instead; check both',
    )
  }
  const settingsOverride = arg('settings-override')
  if (settingsOverride) {
    const patch = JSON.parse(settingsOverride) as Record<string, unknown>
    Object.assign(settings, patch)
    report.settings = { ...(report.settings ?? {}), ...patch }
    warnings.push(`settings overridden for this render only: ${settingsOverride}`)
  }
  // The bank set both bank-reading loaders use, from these settings rather
  // than a second read of the row, so --settings-override '{"bank_account_ids":[…]}'
  // shows a bank choice before anyone saves it.
  const { parseBankAccountIds } = await import('@/lib/monthly-report/opening-bank')
  const bankAccountIds = parseBankAccountIds(settings.bank_account_ids)
  const { getFiscalYearForMonth } = await import('@/app/finances/monthly-report/services/monthly-report-service')
  const fiscalYear = getFiscalYearForMonth(reportMonth)

  let pdfLayout: { pages: { widgets?: { type: string; config?: unknown }[] }[] } | null = null
  const layoutFile = arg('layout-file')
  if (layoutFile) pdfLayout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'))
  else if (!flag('no-layout')) pdfLayout = (settings.pdf_layout as typeof pdfLayout) ?? null

  console.log(`Report month ${snap.report_month} (FY${fiscalYear})`)
  console.log(`  budget_source:        ${report.budget_source ?? '(not recorded — pre-#490 snapshot)'}`)
  console.log(`  settings:             ${stored.is_default ? 'defaults (no row)' : 'stored row'}${templated.template ? `, default template "${templated.template.name}" applied` : ''}`)
  console.log(`  layout:               ${layoutFile ? layoutFile : pdfLayout ? `${flag('no-layout') ? '' : 'stored, '}${pdfLayout.pages.length} pages` : 'none (legacy page order)'}`)
  for (const s of report.sections as { category: string; lines?: unknown[] }[]) console.log(`  ${s.category}: ${s.lines?.length ?? 0} lines`)

  const layoutTypes = new Set((pdfLayout?.pages ?? []).flatMap((p) => (p.widgets ?? []).map((w) => w.type)))
  const sections = (settings.sections ?? {}) as unknown as Record<string, boolean>

  // ── loadPdfSections, block by block, in its order ──
  const eager: Record<string, any> = {}

  // Full Year
  const { loadFullYearReport } = await import('@/lib/monthly-report/full-year-load')
  const fy = await loadFullYearReport(admin, { business_id: bizId, fiscal_year: fiscalYear, report_month: reportMonth })
  if (fy.ok) {
    eager.fullYearReport = fy.report
    note('fullYear', 'live-built', `full-year-load, FY${fiscalYear}, actuals to ${reportMonth}`)
  } else {
    note('fullYear', 'skipped', `full-year-load failed: ${fy.error}`)
  }

  // Subscriptions (live Xero in the app)
  const subCodes: string[] = settings.subscription_account_codes || []
  const { loadPersistedSubscriptionCrawl } = await import('@/lib/monthly-report/subscription-detail-persisted')
  const { assembleSubscriptionDetail, emptySubscriptionDetail } = await import('@/lib/monthly-report/subscription-detail-build')
  const { resolveXeroConnections } = await import('@/lib/business/resolveXeroBusinessId')
  const { connections } = await resolveXeroConnections(admin, bizId)
  const hasConnection = (connections ?? []).length > 0
  if (!sections.subscription_detail) {
    note('subscription', 'skipped', 'settings.sections.subscription_detail is off — the app loads nothing')
  } else if (subCodes.length === 0) {
    note('subscription', 'skipped', 'no subscription_account_codes — the app loads nothing')
  } else {
    const payload = readPayload('subscription-detail.json')
    if (payload) {
      eager.subscriptionDetail = payload
      note('subscription', 'payload', `${payloadDir}/subscription-detail.json`)
    } else if (!hasConnection) {
      eager.subscriptionDetail = emptySubscriptionDetail(reportMonth)
      note('subscription', 'live-built', 'no active Xero connection — the route answers empty')
    } else if (flag('no-persisted-subscriptions')) {
      note('subscription', 'skipped', 'needs live Xero; --no-persisted-subscriptions given and no payload')
    } else {
      const { crawl, notes } = await loadPersistedSubscriptionCrawl(admin, { business_id: bizId, report_month: reportMonth, account_codes: subCodes })
      const assembled = await assembleSubscriptionDetail(admin, { business_id: bizId, report_month: reportMonth, account_codes: subCodes }, crawl)
      eager.subscriptionDetail = assembled.data
      note('subscription', 'persisted',
        `APPROXIMATE — vendor rows from subscription_vendor_actuals (current: ${notes.current_source}, prior: ${notes.prior_source}) ` +
        'through the route\'s own assembler; account totals, budgets and leakage are the route\'s. ' +
        'The stored amounts are GROSS document amounts — the default page\'s own figures — with no net-of-GST statement figures, ' +
        'so a placement on the calxa layout (or basis net) prints gross here, and says so, where the app prints net; its Unallocated row is more negative than the app\'s')
      if (notes.unassigned.length > 0) {
        warnings.push(`subscription: ${notes.unassigned.length} vendor(s) with no budget row, so no known account — placed on ${notes.unassigned[0].placed_on}:\n      ` +
          notes.unassigned.map((u) => `${u.vendor_name} ${u.amount.toFixed(2)}`).join('\n      '))
      }
      if (notes.excluded_stale.length > 0) {
        warnings.push(`subscription: ${notes.excluded_stale.length} stale persisted row(s) excluded (older write batch than the newest for that month):\n      ` +
          notes.excluded_stale.map((s) => `${s.month} ${s.vendor_name} ${s.amount.toFixed(2)} (written ${s.updated_at})`).join('\n      '))
      }
    }
  }

  // Contractors (live Xero in the app; nothing persisted)
  const contractorCodes: string[] = settings.contractor_account_codes || []
  if (contractorCodes.length === 0) {
    note('contractor', 'skipped', 'no contractor_account_codes — the app loads nothing')
  } else {
    const payload = readPayload('contractor-detail.json')
    if (payload) {
      const { rollUpContractors, contractorLoadReason } = await import('@/lib/monthly-report/contractor-rollup')
      const rolled = rollUpContractors(payload as any)
      if (rolled.contractors.length > 0) {
        eager.contractorDetail = rolled
        // The route's answer itself, for a placement on the 'calxa' layout —
        // which prints its months only if the payload carries them (`months`).
        eager.contractorDetailReport = payload
      }
      // The app's own wording, from the payload's own `complete` — a payload
      // saved before the route reported it is could-not-confirm, not empty.
      eager.contractorDetailReason = contractorLoadReason(payload as any, rolled.contractors.length)
      note('contractor', rolled.contractors.length > 0 ? 'payload' : 'skipped',
        `${payloadDir}/contractor-detail.json${rolled.contractors.length > 0 ? '' : ' (no contractors — the app omits the data too)'}`)
    } else {
      note('contractor', 'skipped', 'needs a live Xero crawl and nothing is persisted for contractor accounts — supply contractor-detail.json via --payload-dir')
    }
  }

  // Payroll grid
  if (sections.payroll_detail) {
    const { loadPayrollGrid } = await import('@/lib/monthly-report/payroll-grid-load')
    const { payrollWindowForLayout } = await import('@/lib/monthly-report/payroll-grid-config')
    const payrollMonths = payrollWindowForLayout((pdfLayout?.pages ?? []).flatMap((p) => p.widgets ?? []), reportMonth)
    const grid = await loadPayrollGrid(admin, { business_id: bizId, report_month: reportMonth, fiscal_year: fiscalYear, months: payrollMonths })
    if (grid.data) {
      eager.payrollGrid = grid.data
      note('payroll', 'live-built', `payroll-grid-load, ${payrollMonths} month(s) (stored payslips + resolved wages budget)`)
    } else {
      eager.payrollGridReason = grid.reason
      note('payroll', 'live-built', `payroll-grid-load: no grid — ${grid.reason} (the page prints it)`)
    }
  } else {
    note('payroll', 'skipped', 'settings.sections.payroll_detail is off — the app loads nothing')
  }

  // Ratio Analysis — end_month is the REPORT's month.
  const ratioWidgets = (pdfLayout?.pages ?? []).flatMap((p) => p.widgets ?? []).filter((w) => w.type === 'ratio_analysis')
  if (ratioWidgets.length > 0) {
    const { parseRatioAnalysisConfig, requiredWindow } = await import('@/lib/monthly-report/ratio-table')
    const { loadAccountActuals } = await import('@/lib/monthly-report/account-actuals-load')
    const configs = ratioWidgets.map((w) => parseRatioAnalysisConfig(w.config)).flatMap((r) => (r.ok ? [r.config] : []))
    if (configs.length === 0) {
      eager.accountActuals = { data: null, reason: 'no placement has a valid configuration' }
      note('ratio', 'live-built', 'no placement has a valid configuration (the page prints why)')
    } else {
      const window = requiredWindow(configs)
      const result = await loadAccountActuals(admin, bizId, snap.report_month, window.months, window.codes)
      eager.accountActuals = 'unavailable_reason' in result ? { data: null, reason: result.unavailable_reason } : { data: result.data }
      note('ratio', 'live-built', `account-actuals-load, ${window.months} months, codes ${window.codes.join(',') || '(totals only)'}` +
        ('unavailable_reason' in result ? ` — UNAVAILABLE: ${result.unavailable_reason}` : ''))
    }
  }

  // Wages detail
  const wagesNames: string[] = settings.wages_account_names || []
  if (sections.payroll_detail && wagesNames.length > 0) {
    const { loadWagesDetail } = await import('@/lib/monthly-report/wages-detail-load')
    const wages = await loadWagesDetail(admin, {
      business_id: bizId,
      report_month: reportMonth,
      fiscal_year: fiscalYear,
      wages_account_names: wagesNames,
      budget_forecast_id: settings.budget_forecast_id || undefined,
      // The per-employee Budget reads the Payroll Report roster of the layout
      // being rendered — the page sends the one it prints — so a --layout-file
      // roster is looked at before anyone saves it, and --no-layout reads none.
      pdf_layout: pdfLayout,
    })
    eager.wagesDetail = wages.data
    if (wages.live_fallback === 'skipped_no_fetcher') {
      note('wages', 'persisted', 'wages-detail-load — nothing stored for this business, and the app\'s LIVE payroll fallback was not run: employee rows missing')
    } else {
      note('wages', 'live-built', 'wages-detail-load (stored payslips)')
    }
  } else {
    note('wages', 'skipped', sections.payroll_detail ? 'no wages_account_names — the app loads nothing' : 'settings.sections.payroll_detail is off — the app loads nothing')
  }

  // Cashflow, cash model v2 — the business's cash_model from these settings,
  // so --settings-override '{"cash_model":{…}}' renders the model before
  // anyone saves it. Off (no cash_model, or the column not yet migrated)
  // falls through to the v1 block below, exactly as the app does.
  const { parseCashModelConfig } = await import('@/lib/monthly-report/cash-model-config')
  const { loadPackCashModel } = await import('@/lib/monthly-report/pack-cash-model-load')
  const cashModelLoad = await loadPackCashModel(admin, bizId, reportMonth, {
    config: parseCashModelConfig(settings.cash_model),
    bankAccountIds,
  })
  if (cashModelLoad.status !== 'off') {
    const { buildPackCashModel } = await import('@/lib/monthly-report/pack-cash-model')
    const model = cashModelLoad.status === 'ready'
      ? buildPackCashModel({ fullYear: eager.fullYearReport, reportMonth, config: cashModelLoad.config, inputs: cashModelLoad.inputs })
      : cashModelLoad
    if (model.status === 'ready') {
      eager.cashflowForecast = model.cashflow
      eager.cashflowBasis = model.basis
      for (const w of model.warnings) warnings.push(`cash model: ${w}`)
      const ties = model.reconciliation.map((r) => `${r.month} net ${r.net_movement.toFixed(2)} = bank ${r.bank_delta.toFixed(2)}`).join(', ')
      note('cashflow', 'live-built',
        `cash model v2 (stored mirrors + approved budget${settingsOverride?.includes('cash_model') ? ', cash_model from --settings-override' : ''}): ${ties}; ` +
        `budget from ${model.cashflow.cash_model?.first_forecast_month ?? '(none)'} at debtors ${model.cashflow.cash_model?.dso_days} / creditors ${model.cashflow.cash_model?.dpo_days} days`)
    } else {
      eager.cashflowReason = model.reason
      note('cashflow', 'live-built', `cash model v2 REFUSED — the pack prints: ${model.reason}`)
    }
  }

  // Cashflow — the forecast is picked by the CLOCK (getForecastFiscalYear), as
  // in the app.
  if (cashModelLoad.status === 'off') {
    const { getForecastFiscalYear } = await import('@/app/finances/forecast/utils/fiscal-year')
    const { pickForecast, forecastPeriodsFor } = await import('@/lib/forecast/select-forecast')
    const { resolveBusinessProfileIds } = await import('@/lib/business/resolveBusinessProfileIds')
    const { loadCashflowAssumptions } = await import('@/lib/forecast/cashflow-assumptions-load')
    const { loadOpeningBank } = await import('@/lib/monthly-report/opening-bank-load')
    const { buildPackCashflowForecast, packCashflowPlLines } = await import('@/lib/monthly-report/pack-cashflow')
    const forecastFY = getForecastFiscalYear()
    const ids = await resolveBusinessProfileIds(admin, bizId)
    const { data: existing, error: fcErr } = await admin
      .from('financial_forecasts')
      .select('*')
      .in('business_id', [...new Set([bizId, ids.profileId].filter(Boolean))])
      .eq('fiscal_year', forecastFY)
      .order('updated_at', { ascending: false })
      .limit(10)
    if (fcErr) throw fcErr
    const forecast = pickForecast(existing)
    if (!forecast) {
      note('cashflow', 'skipped', `no FY${forecastFY} forecast — the app would CREATE an empty shell here (a write); no cashflow either way`)
    } else {
      // The app persists a period correction and then uses the corrected row
      // (or, if the update fails, the stale one); here the correction is
      // applied in memory only.
      const { periods, needsUpdate } = forecastPeriodsFor(forecast, forecastFY)
      if (needsUpdate) {
        Object.assign(forecast, { fiscal_year: forecastFY, ...Object.fromEntries(
          ['baseline_start_month', 'baseline_end_month', 'actual_start_month', 'actual_end_month', 'forecast_start_month', 'forecast_end_month']
            .map((k) => [k, (periods as Record<string, unknown>)[k]]),
        ) })
      }
      const { data: forecastLines, error: linesErr } = await admin
        .from('forecast_pl_lines').select('*').eq('forecast_id', forecast.id).order('sort_order', { ascending: true })
      if (linesErr) throw linesErr
      if (packCashflowPlLines(eager.fullYearReport, reportMonth, forecastLines ?? []).length === 0) {
        note('cashflow', 'skipped', 'no P&L lines to run the engine on — the app shows no cashflow')
      } else {
        const saved = await loadCashflowAssumptions(admin, forecast.id)
        const opening = await loadOpeningBank(admin, bizId, reportMonth, { bankAccountIds })
        const cf = buildPackCashflowForecast({
          fullYear: eager.fullYearReport, reportMonth, forecast, forecastLines: forecastLines ?? [],
          savedAssumptions: saved?.cashflow ?? null, opening,
        })
        if (cf) {
          eager.cashflowForecast = cf
          // Read before calling July's receipts a double count (an earlier
          // render of this harness did, wrongly): the engine has no month
          // before the first to spill from, so it stands in for collections of
          // the opening debtors with a copy of the first month's own sales, and
          // the same for COGS. Over the year that is not an overstatement —
          // the last month's sales spill past the end — but the first month's
          // cash is a proxy, not the real 30 June balances.
          warnings.push(`cashflow: ${cf.months?.[0]?.month ?? 'the first month'}'s receipts and COGS payments are the engine's DSO/DPO ` +
            'stand-in for collecting opening debtors and paying opening creditors (a copy of that month\'s own sales and COGS), ' +
            'not the real opening balances, which the pack zeroes — a proxy, not a double count, whatever the basis line calls the month')
        }
        note('cashflow', cf ? 'live-built' : 'skipped',
          `pack-cashflow on forecast "${forecast.name ?? forecast.id}" (FY${forecastFY}${needsUpdate ? ', periods corrected in memory' : ''}), ` +
          `opening ${opening.status === 'read' ? `${opening.amount} at ${opening.asAt}` : `unavailable (${opening.reason})`}`)
      }
    }
    const { packCashflowBasisFor } = await import('@/lib/monthly-report/pack-cashflow')
    eager.cashflowBasis = packCashflowBasisFor(eager.fullYearReport, reportMonth, eager.cashflowForecast)
  }

  // External metrics
  {
    const { loadExternalMetricSeries } = await import('@/lib/monthly-report/external-metrics-load')
    const series = (await loadExternalMetricSeries(admin, bizId, reportMonth)).filter((s) => (s.values || []).length > 0)
    eager.externalMetrics = series
    note('external', 'live-built', `external-metrics-load, ${series.length} series with values`)
  }

  // Memo
  if (typeof snap.coach_notes === 'string' && snap.coach_notes.trim() !== '') {
    eager.memo = snap.coach_notes
    note('memo', 'snapshot', 'snapshot coach_notes')
  } else {
    note('memo', 'skipped', 'no coach_notes on the snapshot — the page is dropped, as in the app')
  }

  // Money flow
  {
    const { loadMoneyFlow } = await import('@/lib/monthly-report/money-flow-load')
    eager.moneyFlow = (await loadMoneyFlow(admin, bizId, reportMonth, { bankAccountIds })).flow
    note('moneyFlow', 'live-built', `money-flow-load (stored balance-sheet mirror + P&L), bank ${bankAccountIds ? `= ${bankAccountIds.length} chosen account(s)` : "= section 'Bank'"}`)
  }

  // Uploaded pages. The read-only client refuses Storage outright, so a file is
  // read with a plain GET on the Storage API — the global fetch here, which
  // lets nothing else leave.
  let insertSources: import('@/lib/monthly-report/pack-inserts').PackInsertSources | undefined
  {
    const { insertPlacements, REPORT_INSERTS_BUCKET } = await import('@/lib/monthly-report/pack-inserts')
    const placements = insertPlacements(pdfLayout as never)
    if (placements.length === 0) {
      note('inserts', 'skipped', 'the layout places no uploaded page — the app loads nothing')
    } else {
      const { loadPackInsertRecords, insertSourcesFromRecords } = await import('@/lib/monthly-report/pack-inserts-load')
      const records = await loadPackInsertRecords(admin, bizId, reportMonth)
      const key = getSupabaseSecretKey()
      insertSources = await insertSourcesFromRecords(pdfLayout as never, records, async (record) => {
        const objectPath = record.storage_path.split('/').map(encodeURIComponent).join('/')
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${REPORT_INSERTS_BUCKET}/${objectPath}`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        })
        if (!res.ok) throw new Error(`storage GET ${res.status}`)
        return new Uint8Array(await res.arrayBuffer())
      })
      const described: string[] = []
      let fromPayload = false
      for (const placement of placements) {
        const file = payloadDir ? path.join(payloadDir, `insert-${placement.widgetId}.pdf`) : null
        if (file && fs.existsSync(file)) {
          insertSources[placement.widgetId] = { status: 'file', bytes: new Uint8Array(fs.readFileSync(file)), filename: path.basename(file) }
          described.push(`${placement.label}: ${file}`)
          fromPayload = true
          continue
        }
        const src = insertSources[placement.widgetId]
        described.push(`${placement.label}: ${src.status === 'file' ? `upload ${src.filename}` : src.status === 'missing' ? 'nothing uploaded — the page prints a notice' : `could not check — ${src.reason}`}`)
      }
      note('inserts', fromPayload ? 'payload' : records.status === 'ok' ? 'persisted' : 'skipped',
        `pack-inserts-load${records.status === 'unavailable' ? ` (${records.reason})` : ''} — ${described.join('; ')}`)
    }
  }

  // Consolidated — a coach/admin view for consolidation parents.
  {
    const { count } = await admin
      .from('xero_connections')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', bizId)
      .eq('is_active', true)
      .eq('include_in_consolidation', true)
    if ((count ?? 0) >= 2) {
      note('consolidated', 'skipped', 'consolidation parent — the consolidated P&L is not reproduced by this harness')
      warnings.push('this business is a consolidation parent: the app would ALSO use the consolidated report, which this harness does not build')
    } else {
      note('consolidated', 'skipped', 'not a consolidation parent — the app loads nothing')
    }
  }

  // Balance sheets, in the export's order: the copy the month's Approve & Send
  // printed (while this is the report that was sent, and not reopened); then a
  // finalised month's frozen copy; otherwise live Xero in the app, so a payload
  // or the reason here.
  const wantsBalanceSheet = !!sections.balance_sheet || layoutTypes.has('balance_sheet')
  const { frozenBalanceSheetSources, sentBalanceSheetSources, pnlFigures, FROZEN_BALANCE_SHEETS_KEY } = await import('@/lib/monthly-report/balance-sheet-freeze')
  let sentSheets: ReturnType<typeof sentBalanceSheetSources> = null
  if (wantsBalanceSheet) {
    const { data: sent, error: sentErr } = await admin
      .from('cfo_report_status')
      .select(`frozen:snapshot_data->${FROZEN_BALANCE_SHEETS_KEY}, report:snapshot_data->report`)
      .eq('business_id', bizId)
      .eq('period_month', `${reportMonth}-01`)
      .maybeSingle()
    if (sentErr) throw sentErr
    sentSheets = sentBalanceSheetSources(sent ? { frozen: sent.frozen, report: pnlFigures(sent.report) } : null, report, reportMonth)
  }
  const frozenSheets = wantsBalanceSheet && !sentSheets ? frozenBalanceSheetSources(snap, reportMonth) : null
  if (sentSheets) {
    eager.balanceSheets = sentSheets
    note('balanceSheet:mom', 'snapshot', 'the sheet the Approve & Send PDF printed (cfo_report_status.snapshot_data)')
    note('balanceSheet:yoy', 'snapshot', 'the sheet the Approve & Send PDF printed (cfo_report_status.snapshot_data)')
  } else if (frozenSheets) {
    eager.balanceSheets = frozenSheets
    note('balanceSheet:mom', 'snapshot', 'frozen into the final snapshot at Finalise')
    note('balanceSheet:yoy', 'snapshot', 'frozen into the final snapshot at Finalise')
  } else if (wantsBalanceSheet) {
    eager.balanceSheets = {}
    for (const compare of ['mom', 'yoy'] as const) {
      const payload = readPayload(`balance-sheet-${compare}.json`)
      if (payload) {
        eager.balanceSheets[compare] = { data: payload }
        note(`balanceSheet:${compare}`, 'payload', `${payloadDir}/balance-sheet-${compare}.json`)
      } else {
        eager.balanceSheets[compare] = { data: null, reason: 'the preview harness does not call Xero — supply the balance sheet with --payload-dir' }
        note(`balanceSheet:${compare}`, 'skipped', `needs a live Xero report — supply balance-sheet-${compare}.json via --payload-dir (the page prints the reason)`)
      }
    }
  }

  // Budget provenance for the cover
  if (settings.budget_forecast_id) {
    const { data: fc } = await admin
      .from('financial_forecasts').select('superannuation_rate, actual_end_month').eq('id', settings.budget_forecast_id).maybeSingle()
    if (fc) {
      eager.budgetSuperRate = fc.superannuation_rate ?? null
      eager.budgetActualEndMonth = fc.actual_end_month ?? null
    }
  }
  eager.budgetBackfilled = !!eager.budgetActualEndMonth && String(snap.report_month) <= String(eager.budgetActualEndMonth)

  // ── Render, recording which widget each page came from ──
  const { buildPackPdf } = await import('@/app/finances/monthly-report/services/pack-pdf')
  const { loadPackEntityName } = await import('@/lib/monthly-report/pack-entity-name')
  const commentaryPayload = readPayload('commentary.json') as Record<string, unknown> | undefined
  if (commentaryPayload) {
    const body = (commentaryPayload.commentary ?? commentaryPayload) as Record<string, unknown>
    warnings.push(`commentary taken from ${path.join(payloadDir!, 'commentary.json')} (${Object.keys(body).length} accounts), not the snapshot`)
  }
  const commentaryForPack = commentaryPayload
    ? ((commentaryPayload.commentary ?? commentaryPayload) as never)
    : ((snap.commentary ?? undefined) as never)
  const { loadPackPreparedOn } = await import('@/lib/monthly-report/pack-prepared-on')
  const preparedOn = await loadPackPreparedOn(admin, bizId, reportMonth, { status: snap.status, generated_at: snap.generated_at })
  console.log(`  prepared on:          ${preparedOn ? `${preparedOn.at} (${preparedOn.basis})` : 'export date (not finalised or approved)'}`)
  console.log(`  pack logo:            ${(settings.pack_logo as { kind?: string } | null | undefined)?.kind ?? 'wisdombi (no setting)'}`)
  type Placed = { type: string; config?: unknown }
  const starts: { page: number; type: string; key: string; placeholder: boolean }[] = []
  // The export's own builder: jsPDF, then any uploaded pages merged in. Page
  // numbers are unchanged by the merge, so the map below reads off jsPDF's pass.
  const pack = await buildPackPdf(report as never, {
    commentary: commentaryForPack,
    ...eager,
    businessName: biz?.name ?? undefined,
    entityName: await loadPackEntityName(admin, bizId),
    preparedOn,
    packLogo: settings.pack_logo ?? null,
    sections: settings.sections,
    pdfLayout,
  } as never, insertSources, {
    beforeGenerate: (service) => {
      // A merge that fails draws the pack a second time; map that pass.
      starts.length = 0
      const svcAny = service as any
      const originalRender = svcAny.renderWidget.bind(service)
      svcAny.renderWidget = (widget: Placed, box: unknown) => {
        const page = svcAny.doc.getNumberOfPages()
        starts.push({ page, type: widget.type, key: sourceKeyFor(widget.type, widget.config), placeholder: !svcAny.hasDataForWidget(widget.type) })
        return originalRender(widget, box)
      }
    },
  })
  const svc = pack.service
  const svcAny = svc as any
  fs.writeFileSync(out, Buffer.from(pack.bytes))
  const pageCount = pack.doc.getNumberOfPages()
  for (const placed of pack.inserts) {
    if (placed.state.status !== 'ready') warnings.push(`uploaded page "${placed.label}": ${placed.state.status === 'missing' ? 'nothing uploaded for this month — the pack prints a notice in its place' : `can't be added — ${placed.state.reason}`}`)
  }

  // What the pack printed in place of a commentary setting it could not read,
  // the accounts a commentary block left off for want of any text, and the
  // accounts where a vendor_cap had nothing to redraw from. None is printed in
  // the pack; all are the coach's to act on.
  const { commentaryPlacementProblems, describeCommentaryPlacementProblem } =
    await import('@/app/finances/monthly-report/services/commentary-placement')
  for (const p of commentaryPlacementProblems(pdfLayout as never)) warnings.push(`commentary setting: ${describeCommentaryPlacementProblem(p)}`)
  for (const g of (svc.commentaryGaps ?? []) as { widgetId: string | null; account: string; actual: number; reason: string }[]) {
    const amount = `$${Math.round(Math.abs(g.actual)).toLocaleString('en-AU')}`
    warnings.push(`commentary: ${g.account} (${amount}) has no bullet under ${g.widgetId ?? 'the statement'} — ${g.reason === 'not_drafted' ? 'never drafted (Regenerate commentary)' : 'empty draft and no coach note'}`)
  }
  for (const g of (svc.commentaryCapsIgnored ?? []) as { widgetId: string | null; account: string; reason: string }[]) {
    warnings.push(`commentary: ${g.account} under ${g.widgetId ?? 'the statement'} printed its stored draft, not the vendor_cap — ${g.reason === 'drafted_before_split' ? 'drafted before draft_facts (Regenerate commentary)' : 'no suppliers stored to redraw from'}`)
  }

  // ── Report ──
  if (warnings.length > 0) {
    console.log('\nWarnings')
    for (const w of warnings) console.log(`  - ${w}`)
  }

  if (pdfLayout && starts.length > 0) {
    const dropped = (pdfLayout.pages ?? [])
      .map((p, i) => ({ i: i + 1, types: (p.widgets ?? []).map((w) => w.type) }))
      .filter((p) => p.types.length > 0 && p.types.every((t) => !svcAny.hasDataForWidget(t)))
    if (dropped.length > 0) {
      console.log('\nLayout pages dropped (every widget reported no data — pagesWithContent, as in the app)')
      for (const d of dropped) {
        const key = sourceKeyFor(d.types[0], undefined)
        console.log(`  layout page ${d.i}: ${d.types.join(' + ')} — ${sources.get(key)?.detail ?? 'no data'}`)
      }
    }

    console.log(`\nPage map — ${pageCount} pages`)
    const rows: string[] = []
    for (let p = 1; p <= pageCount; p++) {
      const onPage = starts.filter((s) => s.page === p)
      const carried = onPage.length === 0 ? [...starts].reverse().find((s) => s.page < p) : undefined
      const entries = onPage.length > 0 ? onPage : carried ? [carried] : []
      const label = entries.map((s) => {
        const src = sources.get(s.key)
        let tag = s.placeholder ? 'PLACEHOLDER "Data not available"' : src ? `${src.status}: ${src.detail}` : 'report'
        // A widget whose data was not loaded but which the service still
        // draws (hasDataForWidget has no case for it) prints an empty page —
        // exactly what the app's export prints when that load fails.
        // (Nor an uploaded page: with no file it prints its own notice.)
        if (!s.placeholder && src?.status === 'skipped' && !s.key.startsWith('balanceSheet') && s.key !== 'inserts' && onPage.length > 0) {
          tag += ' [DRAWN WITHOUT DATA — blank, as the app prints it when this load fails]'
        }
        return `${s.type}${onPage.length === 0 ? ' (continued)' : ''} — ${tag}`
      }).join(' | ')
      rows.push(`  ${String(p).padStart(2)}  ${label}`)
    }
    console.log(rows.join('\n'))
  } else {
    console.log(`\n${pageCount} pages (legacy page order — no widget map)`)
  }

  console.log('\nData sources')
  for (const [key, s] of sources) console.log(`  ${key.padEnd(18)} ${s.status.padEnd(10)} ${s.detail}`)

  console.log(`\nWrote ${out}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
