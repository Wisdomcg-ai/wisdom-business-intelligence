/**
 * Delete orphan user and their data
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
