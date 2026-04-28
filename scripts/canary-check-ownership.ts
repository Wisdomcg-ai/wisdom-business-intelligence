import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'
config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const candidates = [
    { name: 'My Business', forecast_id: 'b943025a-a018-4854-8c84-ba183cd6a0ac' },
    { name: 'JDS FY2026', forecast_id: '58f5a43c-de8e-4a11-a9e4-4789dd4634de' },
    { name: 'JDS FY2027', forecast_id: '1a03be71-e6c8-4755-8a5b-1035128197dc' },
  ]
  for (const c of candidates) {
    const { data: f } = await supabase
      .from('financial_forecasts')
      .select('business_id, fiscal_year, name, assumptions')
      .eq('id', c.forecast_id)
      .single()
    const { data: bp } = await supabase
      .from('business_profiles')
      .select('id, business_name')
      .eq('id', f!.business_id)
      .single()
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', bp!.id)
      .maybeSingle()
    let ownerEmail = '<none>'
    if (biz?.owner_id) {
      const { data: u } = await supabase.auth.admin.getUserById(biz.owner_id)
      ownerEmail = u?.user?.email ?? '<not in auth.users>'
    }
    const assumptionKeys = f?.assumptions ? Object.keys(f.assumptions) : []
    console.log(`${c.name}: forecast=${c.forecast_id.slice(0,8)} biz=${bp!.business_name} owner=${ownerEmail}`)
    console.log(`  assumption_keys: ${JSON.stringify(assumptionKeys)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
