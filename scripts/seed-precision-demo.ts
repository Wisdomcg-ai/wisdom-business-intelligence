/**
 * Seed the "Precision Electrical Group" DEMO account (business 6cb999b5) with a
 * complete, internally-consistent $8M electrical-contractor dataset across every
 * feature, so it can be shown to a prospective client.
 *
 * Story: established commercial/industrial electrical contractor. Revenue GREW
 * 13% (7.1M -> 8.0M) but net profit FELL (755K 10.6% -> 629K 7.9%) — margin
 * slipped as they won bigger, lower-margin government/substation work + material
 * inflation, and receivables blew out to ~55 days. The coachable story.
 *
 * Read-only-safe to re-run: it deletes ONLY the tables it owns for Precision
 * first (never touches the existing subscription_budgets / quarterly_reviews).
 *
 * Run: npx tsx scripts/seed-precision-demo.ts
 */
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { encrypt } from '@/lib/utils/encryption'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/"/g, ''), (process.env.SUPABASE_SECRET_KEY || '').replace(/"/g, ''))

// --- Precision identity (from DB) ---
const BUSINESS_ID = '6cb999b5-490e-462c-9d2d-e58f4c506913'
const PROFILE_ID  = '86e9d84f-6407-4230-84cd-a858982c219e'
const OWNER_ID    = '791ce5cf-3998-4161-9f81-7a2440c618af'
const COACH_ID    = '8d214349-caa0-4935-9ad4-3ba176832ce7'
const TENANT_ID   = 'dec01dec-0000-4dec-8dec-000000000001' // stable placeholder Xero tenant id (demo)
const FY = 2026 // current fiscal year (Jul 2025 - Jun 2026)

const mFY25 = ['2024-07','2024-08','2024-09','2024-10','2024-11','2024-12','2025-01','2025-02','2025-03','2025-04','2025-05','2025-06']
const mFY26 = ['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06']
const ALL = [...mFY25, ...mFY26]
// electrical-contractor seasonality (Dec/Jan shutdown dip, Q3-Q4 ramp), sums to 12
const SEAS = [1.02,1.05,1.04,1.06,1.03,0.82,0.80,0.98,1.08,1.10,1.06,0.96]
const round2 = (n: number) => Math.round(n * 100) / 100
// distribute an annual figure across 12 months with seasonality + a tiny deterministic wobble
function monthly(annual: number, seed = 0): number[] {
  return SEAS.map((w, i) => round2((annual / 12) * w * (1 + ((((i + seed) * 37) % 7) - 3) / 200)))
}

// (code, name, type, FY2025 annual, FY2026 annual)
const PL: [string, string, 'revenue'|'cogs'|'opex', number, number][] = [
  ['200','Commercial Electrical','revenue',2800000,3200000],
  ['201','Industrial & Substation','revenue',2050000,2400000],
  ['202','Government & Infrastructure','revenue',1200000,1500000],
  ['203','Service & Maintenance','revenue',1050000,900000],
  ['300','Materials & Equipment','cogs',2250000,2600000],
  ['310','Subcontractor Costs','cogs',1420000,1700000],
  ['320','Direct Labour - Electricians','cogs',1150000,1300000],
  ['330','Plant & Equipment Hire','cogs',130000,160000],
  ['400','Administration Wages','opex',540000,620000],
  ['410','Superannuation','opex',178000,205000],
  ['420','Rent & Occupancy','opex',168000,180000],
  ['430','Motor Vehicle & Fuel','opex',140000,165000],
  ['440','Insurance','opex',105000,122000],
  ['450','Software & Subscriptions','opex',38000,52000],
  ['460','Marketing & Advertising','opex',48000,62000],
  ['470','Professional Fees','opex',45000,52000],
  ['480','Office & Administration','opex',35000,41000],
  ['490','Depreciation','opex',98000,112000],
]
const catOf = (t: string) => t === 'revenue' ? ['Revenue','Trading Income'] : t === 'cogs' ? ['Cost of Sales','Less Cost of Sales'] : ['Operating Expenses','Less Operating Expenses']
const ACCT_ID: Record<string, string> = {}; PL.forEach(([code]) => { ACCT_ID[code] = randomUUID() })

async function run(label: string, fn: () => Promise<any>) {
  try { const n = await fn(); console.log(`  ✓ ${label}${n != null ? ` (${n})` : ''}`) }
  catch (e: any) { console.log(`  ✗ ${label}: ${e?.message || e}`) }
}

async function main() {
  console.log('DB:', new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/"/g,'')).host)
  console.log('Seeding Precision Electrical Group demo...\n')

  // ---------- CLEANUP (only tables this script owns) ----------
  console.log('Cleanup (idempotent):')
  await run('xero_pl_lines', async () => { await sb.from('xero_pl_lines').delete().eq('business_id', PROFILE_ID); await sb.from('xero_pl_lines').delete().eq('business_id', BUSINESS_ID) })
  await run('xero_balance_sheet_lines', async () => { await sb.from('xero_balance_sheet_lines').delete().eq('business_id', PROFILE_ID); await sb.from('xero_balance_sheet_lines').delete().eq('business_id', BUSINESS_ID) })
  await run('account_mappings', async () => { await sb.from('account_mappings').delete().eq('business_id', BUSINESS_ID); await sb.from('account_mappings').delete().eq('business_id', PROFILE_ID) })
  await run('monthly_report_settings', async () => { await sb.from('monthly_report_settings').delete().eq('business_id', BUSINESS_ID); await sb.from('monthly_report_settings').delete().eq('business_id', PROFILE_ID) })
  await run('forecast_pl_lines+forecasts', async () => {
    const { data: fs } = await sb.from('financial_forecasts').select('id').in('business_id', [PROFILE_ID, BUSINESS_ID])
    if (fs?.length) await sb.from('forecast_pl_lines').delete().in('forecast_id', fs.map(f => f.id))
    await sb.from('financial_forecasts').delete().in('business_id', [PROFILE_ID, BUSINESS_ID])
  })
  await run('business_kpis', async () => { await sb.from('business_kpis').delete().eq('business_id', PROFILE_ID); await sb.from('business_kpis').delete().eq('business_id', BUSINESS_ID) })
  await run('swot', async () => {
    const { data: sw } = await sb.from('swot_analyses').select('id').or(`business_id.eq.${OWNER_ID},business_id.eq.${BUSINESS_ID},user_id.eq.${OWNER_ID}`)
    if (sw?.length) await sb.from('swot_items').delete().in('swot_analysis_id', sw.map(s => s.id))
    await sb.from('swot_analyses').delete().or(`business_id.eq.${OWNER_ID},business_id.eq.${BUSINESS_ID}`)
  })
  await run('strategy_data', async () => { await sb.from('strategy_data').delete().eq('user_id', OWNER_ID) })
  await run('assessments', async () => { await sb.from('assessments').delete().eq('user_id', OWNER_ID) })
  await run('vision_targets', async () => { await sb.from('vision_targets').delete().eq('business_id', PROFILE_ID); await sb.from('vision_targets').delete().eq('business_id', BUSINESS_ID) })
  await run('annual_targets', async () => { await sb.from('annual_targets').delete().eq('business_id', BUSINESS_ID); await sb.from('annual_targets').delete().eq('business_id', PROFILE_ID) })
  await run('strategic_initiatives', async () => { await sb.from('strategic_initiatives').delete().eq('business_id', PROFILE_ID); await sb.from('strategic_initiatives').delete().eq('business_id', BUSINESS_ID) })
  await run('xero_connections(demo)', async () => { await sb.from('xero_connections').delete().eq('business_id', BUSINESS_ID).eq('tenant_id', TENANT_ID) })

  // ---------- 1. XERO CONNECTION (placeholder, INACTIVE) ----------
  // MUST be is_active=false: the sync-all-xero cron fetches live Xero for every
  // ACTIVE connection, so an active demo connection with fake tokens 401s every
  // run (Sentry noise). The monthly report reads actuals from stored
  // xero_pl_lines via the fallback path — it does NOT need an active connection —
  // so inactive is both safe and correct. The row exists only to name the
  // tenant_id the P&L/BS rows reference.
  console.log('\nFinancials:')
  await run('xero_connection', async () => {
    const farFuture = new Date('2027-06-30T00:00:00Z').toISOString()
    const { error } = await sb.from('xero_connections').insert({
      business_id: BUSINESS_ID, user_id: OWNER_ID,
      access_token: encrypt('demo-access-token'), refresh_token: encrypt('demo-refresh-token'),
      expires_at: farFuture, tenant_id: TENANT_ID, tenant_name: 'Precision Electrical Group',
      is_active: false, last_synced_at: new Date().toISOString(),
      display_name: 'Precision Electrical Group', functional_currency: 'AUD',
    })
    if (error) throw error
  })

  // ---------- 2. XERO P&L LINES (long) ----------
  await run('xero_pl_lines', async () => {
    const rows: any[] = []
    for (const [code, name, type, a25, a26] of PL) {
      const v25 = monthly(a25, code.charCodeAt(0)), v26 = monthly(a26, code.charCodeAt(1))
      ALL.forEach((pm, i) => {
        const amount = i < 12 ? v25[i] : v26[i - 12]
        rows.push({ business_id: PROFILE_ID, tenant_id: TENANT_ID, account_id: ACCT_ID[code], account_code: code, account_name: name, account_type: type, section: null, period_month: `${pm}-01`, amount, basis: 'accruals', source: 'demo' })
      })
    }
    const { error } = await sb.from('xero_pl_lines').insert(rows)
    if (error) throw error
    return rows.length
  })

  // ---------- 3. BALANCE SHEET (wide monthly_values) ----------
  await run('xero_balance_sheet_lines', async () => {
    // (code, name, type, section, start balance FY25 open, end balance FY26 close) — grows over 24 months
    const BS: [string,string,string,string,number,number][] = [
      ['610','Business Cheque Account','asset','Bank',95000,182000],
      ['620','Trade Debtors','asset','Current Assets',920000,1210000],
      ['630','Work in Progress & Retentions','asset','Current Assets',430000,610000],
      ['640','Inventory - Materials','asset','Current Assets',180000,255000],
      ['710','Plant & Equipment (net)','asset','Fixed Assets',760000,905000],
      ['720','Motor Vehicles (net)','asset','Fixed Assets',380000,450000],
      ['810','Trade Creditors','liability','Current Liabilities',640000,850000],
      ['820','GST / BAS Payable','liability','Current Liabilities',132000,178000],
      ['830','Employee Provisions','liability','Current Liabilities',168000,222000],
      ['840','Equipment Finance','liability','Non-current Liabilities',480000,548000],
      ['850','Credit Cards','liability','Current Liabilities',41000,58000],
      ['910','Retained Earnings','equity','Equity',1004000,1456000], // close set so A = L + E balances at year-end
      ['920','Owner Capital','equity','Equity',300000,300000],
    ]
    const rows = BS.map(([code,name,type,section,open,close]) => {
      const mv: Record<string, number> = {}
      ALL.forEach((pm, i) => { mv[pm] = round2(open + (close - open) * (i / (ALL.length - 1)) * (1 + ((i*29)%5-2)/300)) })
      return { business_id: BUSINESS_ID, tenant_id: TENANT_ID, account_code: code, account_name: name, account_type: type, section, monthly_values: mv }
    })
    const { error } = await sb.from('xero_balance_sheet_lines').insert(rows)
    if (error) throw error
    return rows.length
  })

  // ---------- 4. ACCOUNT MAPPINGS (dual-keyed: business + profile) ----------
  await run('account_mappings', async () => {
    const mk = (bizId: string) => PL.map(([code, name, type]) => { const [cat, sub] = catOf(type); return { business_id: bizId, xero_account_code: code, xero_account_name: name, xero_account_type: type, report_category: cat, report_subcategory: sub, is_auto_mapped: false, is_confirmed: true, mapped_by: COACH_ID } })
    const { error } = await sb.from('account_mappings').insert(mk(BUSINESS_ID))
    if (error) throw error
    return PL.length
  })

  // ---------- 5. BUDGET FORECAST (inactive -> report uses stored actuals via fallback) ----------
  let forecastId = ''
  await run('financial_forecasts', async () => {
    const revGoal = 8600000
    const { data, error } = await sb.from('financial_forecasts').insert({
      business_id: PROFILE_ID, user_id: OWNER_ID, name: 'FY2026 Budget', description: 'Board-approved FY26 budget',
      fiscal_year: FY, year_type: 'FY', is_active: false, forecast_type: 'forecast', version_number: 1,
      actual_start_month: '2025-07', actual_end_month: '2026-06', forecast_start_month: '2025-07', forecast_end_month: '2026-06',
      revenue_goal: revGoal, gross_profit_goal: round2(revGoal * 0.30), net_profit_goal: round2(revGoal * 0.095),
      cogs_percentage: 0.70, superannuation_rate: 0.12, tenant_id: TENANT_ID,
    }).select('id').single()
    if (error) throw error
    forecastId = data.id
  })
  await run('forecast_pl_lines (budget)', async () => {
    if (!forecastId) throw new Error('no forecast id')
    // budget = slightly more ambitious than actuals (higher margin target)
    const rows = PL.map(([code, name, type, , a26]) => {
      const budgetAnnual = type === 'revenue' ? a26 * 1.075 : type === 'cogs' ? a26 * 0.99 : a26 * 0.98
      const fm: Record<string, number> = {}; const vals = monthly(budgetAnnual, code.charCodeAt(0))
      mFY26.forEach((pm, i) => { fm[pm] = vals[i] })
      const [cat, sub] = catOf(type)
      return { forecast_id: forecastId, account_code: code, account_name: name, account_type: type, category: cat, subcategory: sub, forecast_months: fm, actual_months: {}, is_manual: true, is_from_xero: false }
    })
    const { error } = await sb.from('forecast_pl_lines').insert(rows)
    if (error) throw error
    return rows.length
  })

  // ---------- 6. MONTHLY REPORT SETTINGS (dual-keyed) ----------
  await run('monthly_report_settings', async () => {
    // WA.7 — this used to write an invented sections schema ({pl, kpis,
    // commentary, ...}) that nothing reads. The app's ReportSections keys are
    // {revenue_detail, cogs_detail, ..., chart_*}; with the old shape every
    // flag the monthly report checks was undefined, so all section gating read
    // false — on the one account used for prospect demos.
    const mk = (bizId: string) => ({
      business_id: bizId,
      sections: {
        revenue_detail: true, cogs_detail: true, opex_detail: true,
        payroll_detail: true, subscription_detail: true,
        balance_sheet: true, cashflow: true, trend_charts: true,
        chart_revenue_vs_expenses: true, chart_revenue_breakdown: true,
        chart_variance_heatmap: true, chart_budget_burn_rate: true,
        chart_break_even: true,
        chart_cash_runway: false, chart_cumulative_net_cash: false,
        chart_working_capital_gap: false, chart_team_cost_pct: false,
        chart_cost_per_employee: false, chart_subscription_creep: false,
      },
      show_prior_year: true, show_ytd: true, show_unspent_budget: true,
      budget_forecast_id: forecastId || null,
      subscription_account_codes: ['450'],
      wages_account_names: ['Administration Wages','Direct Labour - Electricians','Superannuation'],
    })
    const { error } = await sb.from('monthly_report_settings').insert(mk(BUSINESS_ID))
    if (error) throw error
    return 1
  })

  // ---------- 7. BUSINESS KPIs (profile-keyed) ----------
  console.log('\nStrategy & operating features:')
  await run('business_kpis', async () => {
    const kpis = [
      ['Monthly Revenue','financial','$',720000,667000],
      ['Gross Margin','financial','%',30,28],
      ['Net Profit Margin','financial','%',9.5,7.9],
      ['Work in Progress','operations','$',500000,610000],
      ['Debtor Days (DSO)','financial','days',45,55],
      ['Quote Win Rate','sales','%',38,34],
      ['Average Project Value','sales','$',48000,52000],
      ['Labour Utilisation','people','%',82,78],
      ['Safety Incidents (LTI)','operations','number',0,1],
      ['Rework / Defect Rate','operations','%',2.5,3.4],
    ] as const
    const rows = kpis.map(([name, category, unit, target, current]) => ({ business_id: PROFILE_ID, business_profile_id: PROFILE_ID, kpi_id: randomUUID(), user_id: OWNER_ID, name, friendly_name: name, category, unit, target_value: target, current_value: current, frequency: 'monthly', is_active: true, why_it_matters: 'Tracked monthly with your coach.' }))
    const { error } = await sb.from('business_kpis').insert(rows)
    if (error) throw error
    return rows.length
  })

  // ---------- 8. SWOT (owner-keyed) ----------
  await run('swot', async () => {
    const { data: an, error } = await sb.from('swot_analyses').insert({ business_id: OWNER_ID, user_id: OWNER_ID, created_by: OWNER_ID, type: 'quarterly', quarter: 1, year: FY, title: `Q1 FY${FY} SWOT — Precision Electrical`, status: 'in-progress' }).select('id').single()
    if (error) throw error
    const items = [
      ['strength','Strong industrial reputation','Preferred contractor for 3 substation/infrastructure programs'],
      ['strength','Licensed, safety-accredited team','40+ staff, ISO 45001, strong compliance record'],
      ['strength','SimPRO job management','Real-time job costing and scheduling across all crews'],
      ['strength','Recurring maintenance base','$0.9M/yr service contracts underpin cashflow'],
      ['weakness','Slipping gross margin','GM fell 30%→28% chasing large lower-margin govt work'],
      ['weakness','Stretched receivables','Debtor days blew out to ~55 — cash is tight'],
      ['weakness','Estimating consistency','Quote win rate down; margin lost at tender stage'],
      ['weakness','Key-person reliance','Two senior PMs carry most large-project knowledge'],
      ['opportunity','Renewables & EV infrastructure','Grid upgrade + EV charging demand accelerating'],
      ['opportunity','Preventative maintenance upsell','Convert project clients to recurring contracts'],
      ['opportunity','Margin recovery on tenders','Disciplined pricing could add 2-3 pts of GP'],
      ['opportunity','Government panel arrangements','Standing-offer panels for repeatable work'],
      ['threat','Material & copper price inflation','Input costs volatile, eroding fixed-price jobs'],
      ['threat','Skilled-labour shortage','Hard to hire licensed electricians and estimators'],
      ['threat','Large-contractor competition','National players bidding aggressively on govt work'],
      ['threat','Interest rates on equipment finance','Higher finance cost on plant/vehicle fleet'],
    ] as const
    const rows = items.map(([category, title, description], i) => ({ swot_analysis_id: an.id, category, title, description, priority_order: (i % 4) + 1, status: 'active', created_by: OWNER_ID }))
    const { error: e2 } = await sb.from('swot_items').insert(rows)
    if (e2) throw e2
    return rows.length
  })

  // ---------- 9. STRATEGY (vision/mission/values) ----------
  await run('strategy_data', async () => {
    const { error } = await sb.from('strategy_data').insert({ user_id: OWNER_ID, business_id: BUSINESS_ID, vision_mission: {
      vision: "To be South-East Queensland's most trusted commercial and industrial electrical contractor — the first call for complex, safety-critical infrastructure by 2029.",
      mission: 'We deliver safe, high-quality electrical solutions on time and on budget, powered by skilled people and disciplined project management.',
      purpose: 'Powering the infrastructure our communities rely on.',
      brand_promise: 'Done safely. Done right. Done on time.',
      core_values: [
        { title: 'Safety First', description: 'Everyone goes home safe, every day.' },
        { title: 'Do It Right', description: 'Quality workmanship and no shortcuts.' },
        { title: 'Own It', description: 'We take responsibility from quote to handover.' },
        { title: 'Straight Talk', description: 'Honest pricing and clear communication.' },
        { title: 'Better Every Job', description: 'We learn and improve continuously.' },
      ],
    } })
    if (error) throw error
  })

  // ---------- 10. ASSESSMENT (8-engine) ----------
  await run('assessments', async () => {
    const { error } = await sb.from('assessments').insert({ user_id: OWNER_ID, status: 'completed', percentage: 64, total_score: 205, total_max: 320, health_status: 'STABLE', completed_at: new Date(Date.now() - 20*864e5).toISOString(),
      attract_score: 26, attract_max: 40, convert_score: 22, convert_max: 40, deliver_score: 32, deliver_max: 40, people_score: 27, people_max: 40, systems_score: 28, systems_max: 40, finance_score: 22, finance_max: 40, leadership_score: 27, leadership_max: 40, time_score: 21, time_max: 40 })
    if (error) throw error
  })

  // ---------- 11. VISION + ANNUAL TARGETS ----------
  await run('vision_targets', async () => {
    const { error } = await sb.from('vision_targets').insert({ business_id: PROFILE_ID, user_id: OWNER_ID, timeframe: '3_year', title: '3-Year Vision', description: '$12M revenue, 32% GP, 40+ crew, SEQ market leader in industrial electrical', target_value: 12000000, target_metric: 'revenue',
      kpis: [ { name: 'Revenue', target: 12000000, unit: '$' }, { name: 'Gross Margin', target: 32, unit: '%' }, { name: 'Net Margin', target: 12, unit: '%' }, { name: 'Team Size', target: 55, unit: 'people' } ] })
    if (error) throw error
  })
  await run('annual_targets', async () => {
    const { error } = await sb.from('annual_targets').insert({ business_id: BUSINESS_ID, user_id: OWNER_ID, year: FY, revenue_target: 8600000, gross_profit_target: 2580000, net_profit_target: 817000, notes: 'Recover margin to 30% while growing revenue 7.5%.' })
    if (error) throw error
  })

  // ---------- 12. STRATEGIC INITIATIVES (profile-keyed) ----------
  await run('strategic_initiatives', async () => {
    const inits = [
      ['Tender margin discipline','Introduce a minimum-GP gate and estimator peer-review on all quotes >$50K','profitability','high','q1'],
      ['Cashflow & debtor collection','Weekly debtor run, deposit-on-order for large jobs, tighten retentions tracking','finance','high','q1'],
      ['Recurring maintenance drive','Convert 15 project clients to annual preventative-maintenance contracts','growth','medium','q2'],
      ['Estimator hire & systemise','Recruit a senior estimator and document the estimating playbook in SimPRO','people','high','q2'],
      ['EV & renewables capability','Build accreditation + capability for EV charging and solar/battery infrastructure','growth','medium','q3'],
      ['Project-manager development','Formal PM development plan to reduce key-person reliance','people','medium','q3'],
    ] as const
    const rows = inits.map(([title, description, category, priority, step], i) => ({ business_id: PROFILE_ID, user_id: OWNER_ID, title, description, category, priority, step_type: step, source: step, timeline: step.toUpperCase(), selected: true, order_index: i, status: i < 2 ? 'in_progress' : 'not_started', fiscal_year: FY, why: 'Directly addresses the margin + cash story.', progress_percentage: i === 0 ? 40 : i === 1 ? 25 : 0 }))
    const { error } = await sb.from('strategic_initiatives').insert(rows)
    if (error) throw error
    return rows.length
  })

  console.log('\nDone. Business:', BUSINESS_ID, '| Profile:', PROFILE_ID)
}
main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1) })
