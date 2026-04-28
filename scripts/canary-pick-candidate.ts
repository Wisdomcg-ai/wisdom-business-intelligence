/**
 * Surface candidate forecasts for the 44.1-05 canary.
 * Read-only.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Get forecasts with at least 1 forecast_pl_lines row
  const { data: forecasts, error } = await supabase
    .from('financial_forecasts')
    .select('id, business_id, fiscal_year, name, year_type, is_completed, is_locked, is_active, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Forecasts query failed:', error)
    process.exit(1)
  }

  console.log(`Found ${forecasts?.length ?? 0} active forecasts\n`)

  const enriched: any[] = []
  for (const f of forecasts ?? []) {
    // Resolve business name
    const { data: bp } = await supabase
      .from('business_profiles')
      .select('id, business_name')
      .eq('id', f.business_id)
      .maybeSingle()

    // Count pl_lines for this forecast
    const { count: totalCount } = await supabase
      .from('forecast_pl_lines')
      .select('*', { count: 'exact', head: true })
      .eq('forecast_id', f.id)

    const { count: manualCount } = await supabase
      .from('forecast_pl_lines')
      .select('*', { count: 'exact', head: true })
      .eq('forecast_id', f.id)
      .eq('is_manual', true)

    enriched.push({
      forecast_id: f.id,
      business_name: bp?.business_name ?? '<unknown>',
      fiscal_year: f.fiscal_year,
      year_type: f.year_type,
      pl_lines_total: totalCount ?? 0,
      pl_lines_manual: manualCount ?? 0,
      is_locked: f.is_locked,
      updated_at: f.updated_at,
    })
  }

  // Sort by pl_lines_total desc — richest forecast is the best canary candidate
  enriched.sort((a, b) => b.pl_lines_total - a.pl_lines_total)

  console.log('=== Candidates (sorted by row count desc) ===\n')
  for (const c of enriched.slice(0, 20)) {
    console.log(
      `${c.forecast_id.slice(0, 8)}... | ${c.business_name.padEnd(35)} | FY${c.fiscal_year} ${c.year_type ?? ''} | rows=${c.pl_lines_total} manual=${c.pl_lines_manual} locked=${c.is_locked} | ${c.updated_at}`,
    )
  }

  console.log('\n=== Top 3 candidates (full UUIDs) ===\n')
  for (const c of enriched.slice(0, 3)) {
    console.log(`${c.forecast_id} — ${c.business_name} (FY${c.fiscal_year}, ${c.pl_lines_total} rows, ${c.pl_lines_manual} manual)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
