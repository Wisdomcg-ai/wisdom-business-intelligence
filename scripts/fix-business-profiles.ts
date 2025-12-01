/**
 * Fix business_profiles table - create records for all businesses
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

async function fixBusinessProfiles() {
  // Check business_profiles schema - it uses business_id to link to businesses
  console.log('\n=== BUSINESS_PROFILES TABLE ===\n')

  const { data: profiles, error: profError } = await supabase
    .from('business_profiles')
    .select('id, business_id, company_name, business_name')

  if (profError) {
    console.error('Error reading business_profiles:', profError.message)
  } else {
    console.log('Existing profiles:')
    for (const p of profiles || []) {
      console.log(`  id: ${p.id}, business_id: ${p.business_id}, name: ${p.company_name || p.business_name}`)
    }
  }

  // For Envisage - we need to create a business_profile linked to the business
  const envisageBusinessId = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
  const userId = '52343ba5-7da0-4d76-8f5f-73f336164aa6' // mattmalouf@wisdomcoaching.com.au

  console.log('\n=== CHECK IF ENVISAGE HAS A PROFILE ===\n')

  // Check if a profile exists for Envisage business
  const { data: envisageProfile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('business_id', envisageBusinessId)
    .single()

  let profileId: string

  if (envisageProfile) {
    console.log('Envisage profile exists:', envisageProfile.id)
    profileId = envisageProfile.id
  } else {
    console.log('Creating profile for Envisage...')

    const { data: newProfile, error: insertError } = await supabase
      .from('business_profiles')
      .insert({
        user_id: userId,
        business_id: envisageBusinessId,
        company_name: 'Envisage Australia Pty Ltd',
        business_name: 'Envisage Australia Pty Ltd',
        current_revenue: 0,
        employee_count: 1,
        profile_completed: false
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error creating profile:', insertError.message)
      return
    }
    profileId = newProfile.id
    console.log('Created profile:', profileId)
  }

  // Now link user_roles using the profile ID (not business ID!)
  console.log('\n=== LINKING USER TO PROFILE ===\n')

  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      business_id: profileId,  // This is the business_profiles.id!
      role: 'owner'
    }, { onConflict: 'user_id,business_id' })

  if (roleError) {
    console.error('user_roles error:', roleError.message)
  } else {
    console.log('user_roles: SUCCESS - linked to profile', profileId)
  }

  console.log('\nDone!')
}

fixBusinessProfiles()
