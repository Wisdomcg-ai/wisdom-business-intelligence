/**
 * Remediation: for each (business_id, fiscal_year, forecast_type) with >1 active,
 * keep the newest (by updated_at) active, mark the others is_active=false.
 *
 * Required before adding the partial unique index.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE — will deactivate older actives'}\n`)

  const { data, error } = await supabase
    .from('financial_forecasts')
    .select('id, business_id, fiscal_year, name, forecast_type, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
  if (error) throw error

  const groups = new Map<string, any[]>()
  for (const f of data ?? []) {
    const key = `${f.business_id}|${f.fiscal_year}|${f.forecast_type ?? 'forecast'}`
    const arr = groups.get(key) ?? []
    arr.push(f)
    groups.set(key, arr)
  }

  const toDeactivate: string[] = []
  for (const [key, rows] of groups.entries()) {
    if (rows.length <= 1) continue
    const [keep, ...losers] = rows  // newest first
    console.log(`\n  ${key}:`)
    console.log(`    KEEP: id=${keep.id.substring(0,8)} updated=${keep.updated_at} name="${keep.name}"`)
    for (const l of losers) {
      console.log(`    DEACTIVATE: id=${l.id.substring(0,8)} updated=${l.updated_at} name="${l.name}"`)
      toDeactivate.push(l.id)
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Forecasts to deactivate: ${toDeactivate.length}`)

  if (!DRY_RUN && toDeactivate.length > 0) {
    const { error: updErr, count } = await supabase
      .from('financial_forecasts')
      .update({ is_active: false }, { count: 'exact' })
      .in('id', toDeactivate)
    if (updErr) throw updErr
    console.log(`\n✓ Deactivated ${count} forecasts`)
  } else if (DRY_RUN) {
    console.log('\n(dry-run — no changes made)')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
