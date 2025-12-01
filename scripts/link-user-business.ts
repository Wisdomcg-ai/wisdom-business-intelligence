/**
 * Link a user to a business
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

async function linkUserToBusiness(userEmail: string, businessId: string, role: string = 'owner') {
  // Get user ID from email
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey
    }
  })

  const { users } = await response.json()
  const user = users.find((u: any) => u.email === userEmail)

  if (!user) {
    console.error(`User not found: ${userEmail}`)
    return
  }

  console.log(`Found user: ${user.email} (${user.id})`)

  // Check existing user_roles
  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)
    .eq('business_id', businessId)
    .single()

  if (existingRole) {
    console.log('User already linked to this business')
    return
  }

  // Add user_role
  const { error: roleError } = await supabase
    .from('user_roles')
    .insert({
      user_id: user.id,
      business_id: businessId,
      role: role
    })

  if (roleError) {
    console.error('Error adding user_role:', roleError.message)
  } else {
    console.log(`Added user_role: ${role}`)
  }

  // Check/add user_permissions
  const { data: existingPerms } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('user_id', user.id)
    .eq('business_id', businessId)
    .single()

  if (!existingPerms) {
    const { error: permError } = await supabase
      .from('user_permissions')
      .insert({
        user_id: user.id,
        business_id: businessId,
        can_view_annual_plan: true,
        can_view_forecast: true,
        can_view_goals: true,
        can_view_documents: true,
        can_view_chat: true,
        can_edit_annual_plan: true,
        can_edit_forecast: true,
        can_edit_goals: true,
        can_upload_documents: true,
        can_manage_users: true
      })

    if (permError) {
      console.error('Error adding permissions:', permError.message)
    } else {
      console.log('Added full permissions')
    }
  }

  // Check/add system_role if not exists
  const { data: existingSysRole } = await supabase
    .from('system_roles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!existingSysRole) {
    const { error: sysRoleError } = await supabase
      .from('system_roles')
      .insert({
        user_id: user.id,
        role: 'client'
      })

    if (sysRoleError) {
      console.error('Error adding system_role:', sysRoleError.message)
    } else {
      console.log('Added system_role: client')
    }
  } else {
    console.log(`System role already exists: ${existingSysRole.role}`)
  }

  console.log('\nDone!')
}

// Hardcoded for this specific task
const userEmail = 'mattmalouf@wisdomcoaching.com.au'
const businessId = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00' // Envisage Australia

linkUserToBusiness(userEmail, businessId, 'owner')
