/**
 * Delete orphan user and their data (including owned businesses)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = 'f657d05e-dcbd-48ba-b462-184d50019bf9'
const EMAIL = 'vanessa@wisdomcg.com.au'

async function deleteUser() {
  console.log('=== Deleting orphan user:', EMAIL, '===\n')
  console.log('User ID:', USER_ID)

  // First, find businesses owned by this user
  console.log('\n0. Finding businesses owned by this user...')
  const { data: ownedBusinesses } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('owner_id', USER_ID)

  if (ownedBusinesses?.length) {
    console.log('   Found businesses:')
    ownedBusinesses.forEach(b => console.log(`   - ${b.id}: ${b.name}`))

    // Delete each business and its data
    for (const business of ownedBusinesses) {
      console.log(`\n   Deleting business ${business.name} (${business.id})...`)

      // Delete all related data for this business
      await supabase.from('user_permissions').delete().eq('business_id', business.id)
      await supabase.from('user_roles').delete().eq('business_id', business.id)
      await supabase.from('onboarding_progress').delete().eq('business_id', business.id)
      await supabase.from('coaching_sessions').delete().eq('business_id', business.id)
      await supabase.from('messages').delete().eq('business_id', business.id)
      await supabase.from('annual_goals').delete().eq('business_id', business.id)
      await supabase.from('quarterly_goals').delete().eq('business_id', business.id)
      await supabase.from('kpis').delete().eq('business_id', business.id)
      await supabase.from('action_items').delete().eq('business_id', business.id)
      await supabase.from('documents').delete().eq('business_id', business.id)

      // Delete the business itself
      const { error: bizError } = await supabase
        .from('businesses')
        .delete()
        .eq('id', business.id)

      if (bizError) {
        console.log(`   Error deleting business: ${bizError.message}`)
      } else {
        console.log('   Business deleted')
      }
    }
  } else {
    console.log('   No owned businesses found')
  }

  // 1. Delete business_profile
  console.log('\n1. Deleting business_profile...')
  const { error: profileError } = await supabase
    .from('business_profiles')
    .delete()
    .eq('user_id', USER_ID)

  if (profileError) {
    console.log('   Error:', profileError.message)
  } else {
    console.log('   Done')
  }

  // 2. Delete any assessments
  console.log('\n2. Deleting assessments...')
  const { error: assessmentError } = await supabase
    .from('assessments')
    .delete()
    .eq('user_id', USER_ID)

  if (assessmentError) {
    console.log('   Error:', assessmentError.message)
  } else {
    console.log('   Done')
  }

  // 3. Delete any user_permissions
  console.log('\n3. Deleting user_permissions...')
  const { error: permError } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', USER_ID)

  if (permError) {
    console.log('   Error:', permError.message)
  } else {
    console.log('   Done')
  }

  // 4. Delete any user_roles
  console.log('\n4. Deleting user_roles...')
  const { error: roleError } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', USER_ID)

  if (roleError) {
    console.log('   Error:', roleError.message)
  } else {
    console.log('   Done')
  }

  // 5. Delete any system_roles
  console.log('\n5. Deleting system_roles...')
  const { error: sysRoleError } = await supabase
    .from('system_roles')
    .delete()
    .eq('user_id', USER_ID)

  if (sysRoleError) {
    console.log('   Error:', sysRoleError.message)
  } else {
    console.log('   Done')
  }

  // 6. Delete auth user
  console.log('\n6. Deleting auth user...')
  const authRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${USER_ID}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      }
    }
  )

  if (authRes.ok) {
    console.log('   Done - Auth user deleted')
  } else {
    const error = await authRes.text()
    console.log('   Error:', error)
  }

  console.log('\n=== User deletion complete ===')
}

deleteUser().catch(console.error)
