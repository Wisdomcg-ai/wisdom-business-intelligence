/**
 * Investigate user data across all tables
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

const EMAIL_TO_INVESTIGATE = 'vanessa@wisdomcg.com.au'

async function investigate() {
  console.log('=== Investigating user:', EMAIL_TO_INVESTIGATE, '===\n')

  // Check auth users
  console.log('1. Checking auth.users...')
  const authRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      }
    }
  )
  const { users } = await authRes.json()
  const authUser = users?.find((u: any) => u.email?.toLowerCase() === EMAIL_TO_INVESTIGATE.toLowerCase())

  if (authUser) {
    console.log('   Found in auth.users:')
    console.log('   - ID:', authUser.id)
    console.log('   - Email confirmed:', authUser.email_confirmed_at ? 'Yes' : 'No')
    console.log('   - Created:', authUser.created_at)
    console.log('   - Metadata:', JSON.stringify(authUser.user_metadata, null, 2))
  } else {
    console.log('   NOT found in auth.users')
  }

  const userId = authUser?.id

  // Check system_roles
  console.log('\n2. Checking system_roles...')
  const { data: systemRoles } = await supabase.from('system_roles').select('*')
  console.log('   Total system_roles:', systemRoles?.length || 0)
  if (userId) {
    const userSystemRole = systemRoles?.find((r: any) => r.user_id === userId)
    console.log('   User system_role:', userSystemRole || 'NOT FOUND')
  }

  // Check user_roles
  console.log('\n3. Checking user_roles...')
  const { data: userRoles } = await supabase.from('user_roles').select('*')
  console.log('   Total user_roles:', userRoles?.length || 0)
  if (userId) {
    const userRole = userRoles?.find((r: any) => r.user_id === userId)
    console.log('   User role:', userRole || 'NOT FOUND')
    if (userRole) {
      console.log('   -> Business ID from role:', userRole.business_id)
    }
  }

  // Check businesses
  console.log('\n4. Checking businesses...')
  const { data: businesses } = await supabase.from('businesses').select('*')
  console.log('   All businesses:')
  businesses?.forEach((b: any) => {
    console.log(`   - ${b.id}: ${b.name} (status: ${b.status})`)
  })

  // Check business_profiles
  console.log('\n5. Checking business_profiles...')
  const { data: profiles } = await supabase.from('business_profiles').select('*')
  console.log('   Total profiles:', profiles?.length || 0)
  if (userId) {
    const userProfile = profiles?.find((p: any) => p.user_id === userId)
    console.log('   User profile:', userProfile ? `ID: ${userProfile.id}` : 'NOT FOUND')
  }

  // Check user_permissions
  console.log('\n6. Checking user_permissions...')
  const { data: permissions } = await supabase.from('user_permissions').select('*')
  console.log('   Total permissions:', permissions?.length || 0)
  if (userId) {
    const userPerm = permissions?.find((p: any) => p.user_id === userId)
    console.log('   User permissions:', userPerm ? `Business ID: ${userPerm.business_id}` : 'NOT FOUND')
  }

  // Check onboarding_progress
  console.log('\n7. Checking onboarding_progress...')
  const { data: onboarding } = await supabase.from('onboarding_progress').select('*')
  console.log('   Total onboarding records:', onboarding?.length || 0)

  // Look for orphan records
  console.log('\n=== Looking for orphan records ===')

  // Find user_roles without matching auth user
  console.log('\n8. Orphan user_roles (no matching auth user):')
  const allUserIds = users?.map((u: any) => u.id) || []
  const orphanRoles = userRoles?.filter((r: any) => !allUserIds.includes(r.user_id))
  if (orphanRoles?.length) {
    orphanRoles.forEach((r: any) => {
      console.log(`   - user_id: ${r.user_id}, business_id: ${r.business_id}, role: ${r.role}`)
    })
  } else {
    console.log('   None found')
  }

  // Find system_roles without matching auth user
  console.log('\n9. Orphan system_roles (no matching auth user):')
  const orphanSystemRoles = systemRoles?.filter((r: any) => !allUserIds.includes(r.user_id))
  if (orphanSystemRoles?.length) {
    orphanSystemRoles.forEach((r: any) => {
      console.log(`   - user_id: ${r.user_id}, role: ${r.role}`)
    })
  } else {
    console.log('   None found')
  }

  // Find user_permissions without matching auth user
  console.log('\n10. Orphan user_permissions (no matching auth user):')
  const orphanPerms = permissions?.filter((p: any) => !allUserIds.includes(p.user_id))
  if (orphanPerms?.length) {
    orphanPerms.forEach((p: any) => {
      console.log(`   - user_id: ${p.user_id}, business_id: ${p.business_id}`)
    })
  } else {
    console.log('   None found')
  }
}

investigate().catch(console.error)
