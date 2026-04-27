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
  const fy27Id = '9e9c3f8f-c9a7-4564-85ba-6b000742f169'

  console.log('=== xero_pl_lines DUPLICATE ANALYSIS ===\n')
  const { data: xeroLines } = await supabase
    .from('xero_pl_lines')
    .select('id, account_name, account_code, account_type, monthly_values, business_id, created_at, updated_at')
    .in('business_id', [profileId, bizId])
    .order('account_name')

  // Group by account_name
  const byName = new Map<string, any[]>()
  for (const l of xeroLines ?? []) {
    const arr = byName.get(l.account_name) || []
    arr.push(l)
    byName.set(l.account_name, arr)
  }

  console.log('Accounts with duplicates:')
  for (const [name, rows] of byName.entries()) {
    if (rows.length > 1) {
      console.log(`\n  "${name}" (${rows.length} rows):`)
      for (const r of rows) {
        const total = Object.values(r.monthly_values ?? {}).reduce((s: any, v: any) => s + Number(v || 0), 0)
        const months = Object.keys(r.monthly_values ?? {})
        console.log(`    id=${r.id.substring(0,8)} type=${r.account_type} code=${r.account_code} months=${months.length} total=$${Math.round(Number(total))}`)
        console.log(`      created=${r.created_at} updated=${r.updated_at}`)
      }
    }
  }

  console.log('\n\n=== FY2027 forecast_pl_lines (id=9e9c3f8f) — only 2 rows? ===')
  const { data: fcLines } = await supabase
    .from('forecast_pl_lines')
    .select('*')
    .eq('forecast_id', fy27Id)
  for (const l of fcLines ?? []) {
    console.log(`\n  ${l.account_name} (${l.account_type}/${l.category})`)
    console.log(`    code=${l.account_code} sort=${l.sort_order} fromXero=${l.is_from_xero} manual=${l.is_manual} payroll=${l.is_from_payroll}`)
    console.log(`    actual_months keys: ${Object.keys(l.actual_months ?? {}).length}`)
    console.log(`    forecast_months keys: ${Object.keys(l.forecast_months ?? {}).length}`)
    console.log(`    forecast_method: ${JSON.stringify(l.forecast_method).substring(0, 120)}`)
  }

  console.log('\n\n=== Try sync-forecast logic manually for FY2027 ===')
  // Mimic the route
  const ACCOUNT_TYPE_TO_CATEGORY: Record<string, string> = {
    revenue: 'Revenue',
    cogs: 'Cost of Sales',
    opex: 'Operating Expenses',
    other_income: 'Other Income',
    other_expense: 'Other Expenses',
  }

  const plLines = (xeroLines ?? [])
    .filter((xl: any) => Object.values(xl.monthly_values || {}).some((v: any) => v !== 0))
    .map((xl: any) => ({
      account_name: xl.account_name,
      account_code: xl.account_code || undefined,
      account_type: xl.account_type,
      category: ACCOUNT_TYPE_TO_CATEGORY[xl.account_type] || 'Operating Expenses',
      actual_months: xl.monthly_values || {},
      is_from_xero: true,
    }))

  console.log(`Would insert ${plLines.length} lines`)
  // Check for duplicates the insert would create
  const seen = new Map<string, number>()
  for (const p of plLines) {
    seen.set(p.account_name, (seen.get(p.account_name) ?? 0) + 1)
  }
  const dups = [...seen.entries()].filter(([_, n]) => n > 1)
  console.log(`\nDuplicate account_names that would be inserted: ${dups.length}`)
  for (const [name, n] of dups) console.log(`  "${name}" × ${n}`)
}
main().catch(e => { console.error(e); process.exit(1) })
