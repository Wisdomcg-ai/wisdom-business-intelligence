/**
 * Database Cleanup Script
 *
 * Usage:
 *   npx ts-node scripts/cleanup-users.ts list          # List all users and businesses
 *   npx ts-node scripts/cleanup-users.ts delete <id>   # Delete a specific business by ID
 *   npx ts-node scripts/cleanup-users.ts delete-all-except <email1,email2>  # Delete all except listed emails
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ESM compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function listUsers() {
  console.log('\n=== BUSINESSES ===\n')

  const { data: businesses, error: bizError } = await supabase
    .from('businesses')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: true })

  if (bizError) {
    console.error('Error fetching businesses:', bizError.message)
    return
  }

  if (!businesses || businesses.length === 0) {
    console.log('No businesses found.')
  } else {
    console.log('ID                                    | Name                    | Status   | Created')
    console.log('-'.repeat(95))
    for (const biz of businesses) {
      const created = new Date(biz.created_at).toLocaleDateString()
      console.log(`${biz.id} | ${(biz.name || 'N/A').padEnd(23)} | ${(biz.status || 'N/A').padEnd(8)} | ${created}`)
    }
  }

  console.log('\n=== AUTH USERS ===\n')

  // Get auth users via Admin API
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey
    }
  })

  if (!response.ok) {
    console.error('Error fetching auth users:', await response.text())
    return
  }

  const { users } = await response.json()

  if (!users || users.length === 0) {
    console.log('No auth users found.')
  } else {
    console.log('ID                                    | Email                           | Created')
    console.log('-'.repeat(90))
    for (const user of users) {
      const created = new Date(user.created_at).toLocaleDateString()
      console.log(`${user.id} | ${(user.email || 'N/A').padEnd(31)} | ${created}`)
    }
  }

  console.log('\n=== SYSTEM ROLES ===\n')

  const { data: roles, error: roleError } = await supabase
    .from('system_roles')
    .select('user_id, role, created_at')
    .order('created_at', { ascending: true })

  if (roleError) {
    console.error('Error fetching roles:', roleError.message)
    return
  }

  if (!roles || roles.length === 0) {
    console.log('No system roles found.')
  } else {
    console.log('User ID                               | Role')
    console.log('-'.repeat(60))
    for (const role of roles) {
      console.log(`${role.user_id} | ${role.role}`)
    }
  }

  console.log('\n')
}

async function deleteBusinessById(businessId: string) {
  console.log(`\nDeleting business: ${businessId}\n`)

  // Get user_id from user_roles (owner of this business)
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('business_id', businessId)
    .eq('role', 'owner')
    .single()

  const ownerUserId = userRole?.user_id

  // Delete in order to handle foreign key constraints
  const tables = [
    'user_permissions',
    'user_roles',
    'onboarding_progress',
    'coaching_sessions',
    'messages',
    'annual_goals',
    'quarterly_goals',
    'kpis',
    'action_items',
    'documents'
  ]

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('business_id', businessId)
    if (error) {
      console.log(`  - ${table}: ${error.message}`)
    } else {
      console.log(`  - ${table}: deleted`)
    }
  }

  // Delete business record
  const { error: businessError } = await supabase
    .from('businesses')
    .delete()
    .eq('id', businessId)

  if (businessError) {
    console.error(`  - businesses: ${businessError.message}`)
  } else {
    console.log(`  - businesses: deleted`)
  }

  // Delete system_roles and auth user
  if (ownerUserId) {
    await supabase.from('system_roles').delete().eq('user_id', ownerUserId)
    console.log(`  - system_roles: deleted for user ${ownerUserId}`)

    // Delete auth user using Admin API
    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${ownerUserId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    )

    if (authResponse.ok) {
      console.log(`  - auth user: deleted`)
    } else {
      console.error(`  - auth user: failed to delete`)
    }
  }

  console.log('\nDone!')
}

async function deleteAllExcept(emailsToKeep: string[]) {
  console.log(`\nKeeping users with emails: ${emailsToKeep.join(', ')}\n`)

  // Get all auth users
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey
    }
  })

  if (!response.ok) {
    console.error('Error fetching auth users')
    return
  }

  const { users } = await response.json()
  const usersToDelete = users.filter((u: any) => !emailsToKeep.includes(u.email))

  console.log(`Found ${usersToDelete.length} users to delete:\n`)
  for (const user of usersToDelete) {
    console.log(`  - ${user.email}`)
  }

  // Get businesses for these users
  for (const user of usersToDelete) {
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .single()

    if (userRole?.business_id) {
      console.log(`\nDeleting business for ${user.email}...`)
      await deleteBusinessById(userRole.business_id)
    } else {
      // Just delete the auth user if no business
      console.log(`\nDeleting orphan auth user ${user.email}...`)
      await supabase.from('system_roles').delete().eq('user_id', user.id)
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      })
    }
  }

  console.log('\nCleanup complete!')
}

// Main
const command = process.argv[2]
const arg = process.argv[3]

if (command === 'list') {
  listUsers()
} else if (command === 'delete' && arg) {
  deleteBusinessById(arg)
} else if (command === 'delete-all-except' && arg) {
  const emails = arg.split(',').map(e => e.trim())
  deleteAllExcept(emails)
} else {
  console.log(`
Database Cleanup Script

Usage:
  npx ts-node scripts/cleanup-users.ts list
    Lists all businesses and auth users

  npx ts-node scripts/cleanup-users.ts delete <business-id>
    Deletes a specific business and its owner

  npx ts-node scripts/cleanup-users.ts delete-all-except <email1,email2>
    Deletes all users EXCEPT the ones with these emails
    Example: npx ts-node scripts/cleanup-users.ts delete-all-except matt@example.com,admin@wisdombi.ai
  `)
}
