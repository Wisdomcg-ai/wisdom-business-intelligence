/**
 * Render a monthly pack to a PDF on disk, headless, from real prod figures.
 *
 * This exists because the August 2026 Urban Road pack shipped with three
 * saturated section bands, a full grid of borders, a dollar sign on every cell,
 * dozens of dormant $0 accounts and a budget column reading the wrong yardstick
 * — and nobody, me included, had ever looked at a page this service produces.
 * Every judgement about the pack's appearance had been made from source code.
 *
 * So: pull one client's month out of prod, run the real PDF service over it,
 * write the file, and LOOK at it. No auth, no browser, no export button.
 *
 *   npx tsx scripts/preview-pack.ts --business <uuid> --month 2026-08 --out /tmp/pack.pdf
 *
 * It reads prod read-only and writes nothing but the PDF.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const businessId = arg('business')
const month = arg('month')
const out = arg('out') ?? '/tmp/pack-preview.pdf'
if (!businessId || !month) {
  console.error('Usage: --business <uuid> --month YYYY-MM [--out path.pdf]')
  process.exit(1)
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey())

/**
 * Used only until the `expense_group_order` migration is applied to prod — the
 * code deploys before the column exists, and the preview should still show the
 * page the way it will look. Matches the reference pack's heading order.
 */
const EXPENSE_GROUP_ORDER_FALLBACK = [
  'Employment Expense', 'Travel & Accommodation', 'Professional Expense',
  'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense',
  'Foreign Currency Gains and Losses', 'Bank and Other Fees', 'Other Operating Expenses',
]

async function main() {
  // jsPDF needs a DOM-ish global before the service module is imported.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { JSDOM } = (await import('jsdom' as string)) as any
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const g = globalThis as unknown as Record<string, unknown>
  g.window = dom.window as unknown
  g.document = dom.window.document
  g.navigator = dom.window.navigator
  g.HTMLCanvasElement = dom.window.HTMLCanvasElement
  g.Image = dom.window.Image

  const { data: snap } = await admin
    .from('monthly_report_snapshots')
    .select('report_data, commentary, report_month')
    .eq('business_id', businessId)
    .eq('report_month', month)
    .maybeSingle()

  if (!snap?.report_data) {
    console.error(`No stored report for ${businessId} ${month}. Generate it in the app first.`)
    process.exit(1)
  }

  const { data: biz } = await admin
    .from('businesses').select('name').eq('id', businessId).maybeSingle()

  const report = snap.report_data as Record<string, unknown>

  // Stored snapshots key `sections` by category slug; GeneratedReport wants an
  // ordered array. (That mismatch is itself a defect — Report History cannot
  // rehydrate one of these into a report — but the preview's job is to show a
  // page, so it normalises rather than refusing.)
  const SLUG_ORDER: [string, string][] = [
    ['revenue', 'Revenue'],
    ['cost_of_sales', 'Cost of Sales'],
    ['operating_expenses', 'Operating Expenses'],
    ['other_income', 'Other Income'],
    ['other_expenses', 'Other Expenses'],
  ]
  if (report.sections && !Array.isArray(report.sections)) {
    const bySlug = report.sections as Record<string, { lines?: unknown[]; subtotal?: unknown }>
    report.sections = SLUG_ORDER
      .filter(([slug]) => bySlug[slug])
      .map(([slug, category]) => ({ category, ...bySlug[slug] }))
  }
  // A stored snapshot predates whatever field is being worked on today — its
  // lines were written by the generate route as it stood when the coach clicked
  // Generate. The preview's job is to show the PAGE, so it back-fills the
  // fields the live route would now emit, from the same tables the route reads.
  // Here: the expense group each account belongs to, and the order the headings
  // run in. Nothing is written back.
  const { data: maps } = await admin
    .from('account_mappings')
    .select('xero_account_name, report_subcategory')
    .eq('business_id', businessId)
    .is('deleted_at', null)
  const groupOf = new Map<string, string | null>(
    (maps ?? []).map((m: { xero_account_name: string; report_subcategory: string | null }) =>
      [m.xero_account_name, m.report_subcategory]),
  )
  for (const sec of (report.sections ?? []) as { lines?: { account_name: string; group?: string | null }[] }[]) {
    for (const l of sec.lines ?? []) l.group = groupOf.get(l.account_name) ?? null
  }
  const { data: st } = await admin
    .from('monthly_report_settings')
    .select('expense_group_order')
    .eq('business_id', businessId)
    .maybeSingle()
  const settings = (report.settings ?? {}) as Record<string, unknown>
  settings.expense_group_order =
    (st as { expense_group_order?: string[] } | null)?.expense_group_order ?? EXPENSE_GROUP_ORDER_FALLBACK
  report.settings = settings

  console.log(`Report month ${snap.report_month}`)
  console.log(`  budget_source:        ${report.budget_source ?? '(not recorded — pre-#490 snapshot)'}`)
  console.log(`  budget_forecast_name: ${report.budget_forecast_name ?? '—'}`)
  console.log(`  has_budget:           ${report.has_budget}`)
  const sections = (report.sections ?? []) as { category: string; lines: unknown[] }[]
  for (const s of sections) console.log(`  ${s.category}: ${s.lines?.length ?? 0} lines`)

  const { MonthlyReportPDFService } = await import(
    '@/app/finances/monthly-report/services/monthly-report-pdf-service'
  )

  // (report, options) — positional, not an options bag.
  const svc = new MonthlyReportPDFService(report as never, {
    commentary: (snap.commentary ?? undefined) as never,
    businessName: biz?.name ?? 'Client',
  } as never)

  const doc = (svc as unknown as { generate: () => { output: (k: string) => ArrayBuffer } }).generate()
  fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')))
  console.log(`\nWrote ${out}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
