import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const bizId = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
  const profileId = 'fa0a80e8-e58e-40aa-b34a-8db667d4b221'

  console.log('=== ENVISAGE DEEP DATA DIAG ===\n')

  // 1. xero_pl_lines — what historical data exists?
  console.log('--- xero_pl_lines (last year actuals source) ---')
  const { data: xeroLines } = await supabase
    .from('xero_pl_lines')
    .select('account_name, account_type, monthly_values, business_id')
    .in('business_id', [profileId, bizId])
  console.log(`Total rows: ${xeroLines?.length}`)

  const byType: Record<string, number> = {}
  const monthsSeen = new Set<string>()
  const byBizId: Record<string, number> = {}
  for (const l of xeroLines ?? []) {
    byType[l.account_type ?? 'null'] = (byType[l.account_type ?? 'null'] ?? 0) + 1
    byBizId[l.business_id] = (byBizId[l.business_id] ?? 0) + 1
    Object.keys(l.monthly_values ?? {}).forEach(m => monthsSeen.add(m))
  }
  console.log('By account_type:', byType)
  console.log('By business_id:', byBizId)
  const sortedMonths = Array.from(monthsSeen).sort()
  console.log(`Months span: ${sortedMonths[0]} → ${sortedMonths[sortedMonths.length-1]} (${sortedMonths.length} months)`)

  const revenueLines = (xeroLines ?? []).filter(l => l.account_type === 'revenue')
  console.log(`\nRevenue lines (${revenueLines.length}):`)
  for (const r of revenueLines.slice(0, 8)) {
    const total = Object.values(r.monthly_values ?? {}).reduce((a: any, b: any) => a + Number(b || 0), 0)
    const months = Object.keys(r.monthly_values ?? {}).length
    console.log(`  ${r.account_name} — ${months}m, total $${Math.round(Number(total))}`)
  }

  const cogsLines = (xeroLines ?? []).filter(l => l.account_type === 'cogs')
  console.log(`\nCOGS lines (${cogsLines.length}):`)
  for (const c of cogsLines.slice(0, 8)) {
    const total = Object.values(c.monthly_values ?? {}).reduce((a: any, b: any) => a + Number(b || 0), 0)
    const months = Object.keys(c.monthly_values ?? {}).length
    console.log(`  ${c.account_name} — ${months}m, total $${Math.round(Number(total))}`)
  }

  // Check rows with NULL account_type
  const nullType = (xeroLines ?? []).filter(l => !l.account_type)
  console.log(`\nRows with NULL account_type: ${nullType.length}`)
  for (const n of nullType.slice(0, 5)) console.log(`  ${n.account_name}`)

  // 2. FY2027 forecast (active)
  console.log('\n--- FY2027 forecast (id=9e9c3f8f) ---')
  const fy27Id = '9e9c3f8f-c9a7-4564-85ba-6b000742f169'
  const { data: fcLines } = await supabase
    .from('forecast_pl_lines')
    .select('account_name, account_type, category, actual_months, forecast_months, is_from_xero, sort_order')
    .eq('forecast_id', fy27Id)
    .order('sort_order')
  console.log(`Total forecast_pl_lines: ${fcLines?.length}`)

  const fcByCat: Record<string, number> = {}
  for (const l of fcLines ?? []) fcByCat[l.category ?? 'null'] = (fcByCat[l.category ?? 'null'] ?? 0) + 1
  console.log('By category:', fcByCat)

  let withActuals = 0, withoutActuals = 0
  const monthsInActuals = new Set<string>()
  for (const l of fcLines ?? []) {
    const am = l.actual_months ?? {}
    const keys = Object.keys(am)
    if (keys.length > 0) { withActuals++; keys.forEach(k => monthsInActuals.add(k)) }
    else withoutActuals++
  }
  console.log(`actual_months: ${withActuals}/${fcLines?.length} have it, ${withoutActuals} don't`)
  const sortedActMonths = Array.from(monthsInActuals).sort()
  if (sortedActMonths.length > 0) {
    console.log(`actual_months span: ${sortedActMonths[0]} → ${sortedActMonths[sortedActMonths.length-1]}`)
  }

  let withForecast = 0
  const monthsInForecast = new Set<string>()
  for (const l of fcLines ?? []) {
    const fm = l.forecast_months ?? {}
    const keys = Object.keys(fm)
    if (keys.length > 0) { withForecast++; keys.forEach(k => monthsInForecast.add(k)) }
  }
  console.log(`forecast_months: ${withForecast}/${fcLines?.length} have values`)
  const sortedFcMonths = Array.from(monthsInForecast).sort()
  if (sortedFcMonths.length > 0) {
    console.log(`forecast_months span: ${sortedFcMonths[0]} → ${sortedFcMonths[sortedFcMonths.length-1]}`)
  }

  // 3. FY2026 active forecast (might be the one wizard is loading)
  console.log('\n--- FY2026 active forecast (id=efff076b) ---')
  const fy26Id = 'efff076b-676d-49a6-a78a-21c521050364'
  const { data: fc26 } = await supabase
    .from('forecast_pl_lines')
    .select('account_name, category, actual_months, forecast_months, is_from_xero')
    .eq('forecast_id', fy26Id)
  console.log(`Total rows: ${fc26?.length}`)
  const cat26: Record<string, number> = {}
  for (const l of fc26 ?? []) cat26[l.category ?? 'null'] = (cat26[l.category ?? 'null'] ?? 0) + 1
  console.log('By category:', cat26)

  // 4. Forecast meta
  console.log('\n--- financial_forecasts meta ---')
  const { data: fcRows } = await supabase
    .from('financial_forecasts')
    .select('id, name, fiscal_year, is_active, is_locked, is_completed, actual_start_month, actual_end_month, last_xero_sync_at, assumptions')
    .in('business_id', [profileId, bizId])
    .order('fiscal_year', { ascending: false })
  for (const f of fcRows ?? []) {
    const ass = (f.assumptions ?? {}) as any
    const revLines = ass.revenue?.lines?.length ?? 0
    const cogsLines = ass.cogs?.lines?.length ?? 0
    const opexLines = ass.opex?.lines?.length ?? 0
    console.log(`  ${f.id.substring(0,8)} FY${f.fiscal_year} active=${f.is_active} locked=${f.is_locked} completed=${f.is_completed}`)
    console.log(`    actual range: ${f.actual_start_month} → ${f.actual_end_month}, lastSync=${f.last_xero_sync_at}`)
    console.log(`    assumptions: rev=${revLines} cogs=${cogsLines} opex=${opexLines}`)
  }

  // 5. Sample assumptions content for FY2027
  console.log('\n--- FY2027 assumptions detail ---')
  const fy27Row = (fcRows ?? []).find(f => f.id === fy27Id)
  if (fy27Row?.assumptions) {
    const a = fy27Row.assumptions as any
    if (a.revenue?.lines?.length) {
      console.log('Revenue lines:')
      for (const r of a.revenue.lines.slice(0, 5)) {
        const yr1Months = Object.keys(r.year1Monthly ?? {}).length
        const yr1Total = Object.values(r.year1Monthly ?? {}).reduce((s: any, v: any) => s + Number(v || 0), 0)
        console.log(`  ${r.accountName} priorYear=${r.priorYearTotal} yr1Months=${yr1Months} yr1Total=${Math.round(Number(yr1Total))}`)
      }
    }
    if (a.cogs?.lines?.length) {
      console.log('COGS lines:')
      for (const c of a.cogs.lines.slice(0, 5)) {
        console.log(`  ${c.accountName} priorYear=${c.priorYearTotal} behavior=${c.costBehavior} pct=${c.percentOfRevenue} fixed=${c.monthlyAmount}`)
      }
    } else {
      console.log('NO COGS LINES IN ASSUMPTIONS')
    }
  }

  // 6. xero_connections
  console.log('\n--- xero_connections ---')
  const { data: conns } = await supabase
    .from('xero_connections')
    .select('id, business_id, is_active, last_synced_at, tenant_name')
    .in('business_id', [profileId, bizId])
  for (const c of conns ?? []) {
    console.log(`  ${c.id.substring(0,8)} biz=${c.business_id.substring(0,8)} active=${c.is_active} tenant=${c.tenant_name} lastSync=${c.last_synced_at}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
