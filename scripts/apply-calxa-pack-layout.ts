/**
 * Put a client's monthly pack into the Calxa page order.
 *
 * Two fields decide the shape of the exported pack: `sections` (which widgets
 * are gated on at all) and `pdf_layout` (what goes on which page, in what
 * order). The settings UI can write the first and not the second, so this
 * writes both as a TARGETED update of the named columns only.
 *
 * That targeting is the point. POST /api/monthly-report/settings is
 * default-OVERWRITE for six fields — `sections`, the five `show_*` flags,
 * `budget_forecast_id`, `subscription_account_codes` and
 * `wages_account_names` are all rewritten with defaults when absent from the
 * body. A well-meaning "just set the layout" POST therefore blanks a client's
 * subscription account codes and re-enables every chart. An UPDATE of three
 * named columns cannot do that.
 *
 * It deliberately does NOT touch `budget_source`. Switching a client onto the
 * budget store is a separate, deliberate act with its own verification — see
 * scripts/import-xero-budget-oneshot.ts.
 *
 * Dry run (default):
 *   npx tsx scripts/apply-calxa-pack-layout.ts --business <uuid>
 * Apply:
 *   npx tsx scripts/apply-calxa-pack-layout.ts --business <uuid> --apply
 *
 * After applying: hard-reload /finances/monthly-report before exporting.
 * `loadPdfSections` reuses React state rather than refetching, so a tab opened
 * under the old settings can leak stale numbers into the PDF.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import type { PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const APPLY = process.argv.includes('--apply')
const businessId = arg('business')
if (!businessId) {
  console.error('Usage: --business <businesses.id uuid> [--apply]')
  process.exit(1)
}
const BUSINESS_ID: string = businessId

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey())

/**
 * The sections the Calxa pack needs on, and — just as important — the ones it
 * needs OFF.
 *
 * The five chart flags are not cosmetic. `syncLayoutWithSettings` appends a
 * page for every enabled section whose widget type is absent from the layout,
 * and it runs when the PDF Layout Editor is OPENED. Leaving them on means the
 * hand-built Calxa order silently grows five chart pages on the end the first
 * time anyone looks at the layout.
 */
const CALXA_SECTIONS = {
  revenue_detail: true,
  cogs_detail: true,
  opex_detail: true,
  payroll_detail: true,
  subscription_detail: true,
  balance_sheet: true,
  cashflow: true,
  trend_charts: true,
  chart_revenue_vs_expenses: false,
  chart_revenue_breakdown: false,
  chart_variance_heatmap: false,
  chart_budget_burn_rate: false,
  chart_break_even: false,
  chart_cash_runway: false,
  chart_cumulative_net_cash: false,
  chart_working_capital_gap: false,
  chart_team_cost_pct: false,
  chart_cost_per_employee: false,
  chart_subscription_creep: false,
  // `cash_basis` is deliberately absent, not false: turning it on doubles the
  // per-month Xero P&L requests for this business.
}

/** Urban Road's Xero payroll accounts. The wages page refuses to load without them. */
const WAGES_ACCOUNTS = ['Employ - Wages & Salaries', 'Employ - Superannuation']

let n = 0
const id = (p: string) => `calxa-${String(++n).padStart(2, '0')}-${p}`

function page(
  orientation: 'portrait' | 'landscape',
  type: string,
  config?: Record<string, unknown>,
) {
  const colSpan = orientation === 'landscape' ? 3 : 2
  return {
    id: id(type),
    orientation,
    widgets: [{ id: id(`w-${type}`), type, col: 0, row: 0, colSpan, rowSpan: 3, ...(config ? { config } : {}) }],
  }
}

/**
 * The Calxa pack, page for page. Numbers in the comments are the pages of the
 * July 2026 Urban Road pack this reproduces.
 *
 * Two Calxa pages have no widget yet and are simply absent rather than left as
 * empty pages: the Contractors Payment Summary (14) and the second month of the
 * payroll grid (15 shows two). An empty page renders as nothing anyway, so
 * carrying a placeholder would only make the JSON lie about what exists.
 *
 * The COGS and expense commentary (7, 11-12) are NOT separate pages: the
 * per-account commentary renders as rows inside the section table above it.
 */
const CALXA_LAYOUT: PDFLayout = {
  version: 1,
  pages: [
    page('portrait', 'cover_page'),                                        // 1
    page('portrait', 'executive_summary'),                                 // 2
    page('landscape', 'analysis_chart_income'),                            // 3
    page('landscape', 'budget_vs_actual', { section: 'income' }),          // 4
    page('landscape', 'analysis_chart_cogs'),                              // 5
    page('landscape', 'budget_vs_actual', { section: 'cogs' }),            // 6 (+7 commentary rows)
    page('portrait', 'external_metric', { series_key: 'cogs_inputs' }),    // 8
    page('landscape', 'analysis_chart_expense'),                           // 9
    page('landscape', 'budget_vs_actual', { section: 'expense' }),         // 10 (+11-12 commentary rows)
    page('portrait', 'memo'),                                              // 12 (the written page)
    page('portrait', 'subscription_detail'),                               // 13
    page('portrait', 'wages_detail'),                                      // 15
    page('landscape', 'full_year_projection'),                             // 16-18
    page('portrait', 'balance_sheet', { compare: 'mom' }),                 // 19-20
    page('portrait', 'balance_sheet', { compare: 'yoy' }),                 // 21-22
    page('landscape', 'chart_cashflow_forecast'),                          // 23
    page('landscape', 'cashflow_forecast_table'),                          // 24-26
    page('portrait', 'money_flow'),                                        // 27
  ],
} as PDFLayout

async function main() {
  const { data: before, error } = await admin
    .from('monthly_report_settings')
    .select('business_id, sections, wages_account_names, subscription_account_codes, budget_source, pdf_layout')
    .eq('business_id', BUSINESS_ID)
    .maybeSingle()

  if (error) { console.error(`Could not read settings: ${error.message}`); process.exit(1) }
  if (!before) { console.error(`No monthly_report_settings row for ${BUSINESS_ID}. Open Report Settings once to create it.`); process.exit(1) }

  console.log(`\n=== CURRENT ===`)
  console.log(`  budget_source:              ${before.budget_source}`)
  console.log(`  wages_account_names:        ${JSON.stringify(before.wages_account_names)}`)
  console.log(`  subscription_account_codes: ${JSON.stringify(before.subscription_account_codes)}  (not touched)`)
  console.log(`  pdf_layout:                 ${before.pdf_layout ? `${(before.pdf_layout as any).pages?.length ?? '?'} pages` : 'NULL (default order)'}`)

  const cur = (before.sections ?? {}) as Record<string, boolean>
  const changes = Object.entries(CALXA_SECTIONS).filter(([k, v]) => cur[k] !== v)
  console.log(`\n=== SECTION CHANGES (${changes.length}) ===`)
  for (const [k, v] of changes) console.log(`  ${k.padEnd(28)} ${String(cur[k] ?? 'unset').padStart(6)} -> ${String(v)}`)
  if (changes.length === 0) console.log('  none')

  console.log(`\n=== PAGE ORDER (${CALXA_LAYOUT.pages.length}) ===`)
  CALXA_LAYOUT.pages.forEach((p, i) => {
    const w = p.widgets[0] as any
    const cfg = w.config ? ` ${JSON.stringify(w.config)}` : ''
    console.log(`  ${String(i + 1).padStart(2)}. ${p.orientation.padEnd(9)} ${w.type}${cfg}`)
  })
  console.log(`\n  NOT IN THIS LAYOUT — no widget exists yet: contractors summary (Calxa 14),`)
  console.log(`  and wages_detail covers ONE month where Calxa 15 shows two.`)

  if (before.budget_source !== 'budget_version') {
    console.log(`\n  NOTE: budget_source is '${before.budget_source}'. This script does not change it.`)
    console.log(`  Until it is 'budget_version' the pack is measured against a forecast, not the approved budget.`)
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply.`)
    return
  }

  const { error: upErr } = await admin
    .from('monthly_report_settings')
    .update({
      sections: { ...cur, ...CALXA_SECTIONS },
      wages_account_names: WAGES_ACCOUNTS,
      pdf_layout: CALXA_LAYOUT,
    })
    .eq('business_id', BUSINESS_ID)

  if (upErr) { console.error(`Update failed: ${upErr.message}`); process.exit(1) }

  const { data: after } = await admin
    .from('monthly_report_settings')
    .select('pdf_layout, wages_account_names, subscription_account_codes')
    .eq('business_id', BUSINESS_ID)
    .maybeSingle()

  const pages = (after?.pdf_layout as any)?.pages?.length ?? 0
  console.log(`\nAPPLIED. pdf_layout now holds ${pages} pages; wages accounts ${JSON.stringify(after?.wages_account_names)};`)
  console.log(`subscription codes still ${JSON.stringify(after?.subscription_account_codes)}.`)
  console.log(`\nHard-reload /finances/monthly-report, regenerate the month, then export and check the page ORDER —`)
  console.log(`generateFromLayout falls back to the legacy order on any throw, so a plausible page count proves nothing.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
