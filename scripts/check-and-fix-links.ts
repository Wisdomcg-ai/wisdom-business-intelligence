/**
 * Check existing links and fix them
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function checkAndFix() {
  console.log('\n=== CURRENT USER_ROLES ===\n')

  const { data: userRoles, error: urError } = await supabase
    .from('user_roles')
    .select('user_id, business_id, role')

  if (urError) {
    console.error('Error:', urError.message)
  } else {
    console.log('user_id | business_id | role')
    console.log('-'.repeat(80))
    for (const ur of userRoles || []) {
      console.log(`${ur.user_id} | ${ur.business_id} | ${ur.role}`)
    }
  }

  console.log('\n=== CURRENT USER_PERMISSIONS ===\n')

  const { data: userPerms, error: upError } = await supabase
    .from('user_permissions')
    .select('user_id, business_id')

  if (upError) {
    console.error('Error:', upError.message)
  } else {
    console.log('user_id | business_id')
    console.log('-'.repeat(80))
    for (const up of userPerms || []) {
      console.log(`${up.user_id} | ${up.business_id}`)
    }
  }

  // Now let's try to insert directly with RLS bypass
  console.log('\n=== ATTEMPTING TO LINK USER ===\n')

  const userId = '52343ba5-7da0-4d76-8f5f-73f336164aa6' // mattmalouf@wisdomcoaching.com.au
  const businessId = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00' // Envisage

  // First verify business exists
  const { data: biz, error: bizError } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', businessId)
    .single()

  if (bizError || !biz) {
    console.error('Business not found:', bizError?.message)
    return
  }
  console.log('Business found:', biz.name)

  // Try insert with upsert
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      business_id: businessId,
      role: 'owner'
    }, { onConflict: 'user_id,business_id' })

  if (roleError) {
    console.error('user_roles insert error:', roleError.message)
    console.error('Full error:', JSON.stringify(roleError, null, 2))
  } else {
    console.log('user_roles: linked successfully')
  }

  // Check if the user_permissions was added earlier (it was)
  const { data: existingPerm } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .single()

  if (existingPerm) {
    console.log('user_permissions: already exists')
  }

  console.log('\nDone!')
}

checkAndFix()
