/**
 * Audit: find any (business_id, fiscal_year) pair with > 1 is_active=true forecast.
 * Lists offenders so we can decide manual remediation before applying the
 * partial unique index that enforces this going forward.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { data, error } = await supabase
    .from('financial_forecasts')
    .select('id, business_id, fiscal_year, name, is_active, is_locked, updated_at, forecast_type')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
  if (error) throw error

  console.log(`Total active forecasts: ${data?.length}\n`)

  const groups = new Map<string, any[]>()
  for (const f of data ?? []) {
    const key = `${f.business_id}|${f.fiscal_year}|${f.forecast_type ?? 'forecast'}`
    const arr = groups.get(key) ?? []
    arr.push(f)
    groups.set(key, arr)
  }

  const offenders = [...groups.entries()].filter(([_, rows]) => rows.length > 1)
  console.log(`(business_id, fiscal_year, forecast_type) with multiple actives: ${offenders.length}`)

  for (const [key, rows] of offenders) {
    console.log(`\n  ${key}:`)
    for (const r of rows) {
      console.log(`    id=${r.id.substring(0,8)} name="${r.name}" locked=${r.is_locked} updated=${r.updated_at}`)
    }
  }
  if (offenders.length === 0) {
    console.log('\n✓ No conflicts — safe to add partial unique index.')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
