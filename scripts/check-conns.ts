import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data } = await s.from('xero_connections').select('id, business_id, is_active, tenant_name, expires_at, last_synced_at')
    .in('business_id', ['8c8c63b2-bdc4-4115-9375-8d0fd89acc00', 'fa0a80e8-e58e-40aa-b34a-8db667d4b221'])
  for (const c of data ?? []) {
    console.log(c.id.substring(0, 8), c.business_id.substring(0, 8), 'active=' + c.is_active, c.tenant_name, 'expires=' + c.expires_at, 'lastSync=' + c.last_synced_at)
  }
}
main()
