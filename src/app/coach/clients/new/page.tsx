'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OnboardingWizard, type WizardData } from '@/components/coach/OnboardingWizard'

export default function NewClientPage() {
  const router = useRouter()
  const supabase = createClient()

  const handleComplete = async (data: WizardData) => {
    // Get current user (coach)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Not authenticated')
    }

    // 1. Create the business record
    // Note: 'name' is the required column, additional fields added via migration
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: data.businessName,
        business_name: data.businessName,
        industry: data.industry,
        website: data.website || null,
        address: data.address || null,
        status: 'active',
        program_type: data.programType,
        session_frequency: data.programType === '1:1 Coaching' ? data.sessionFrequency : null,
        custom_frequency: data.programType === 'Coaching + CFO Services' ? data.customFrequency : null,
        engagement_start_date: data.engagementStartDate,
        assigned_coach_id: user.id,
        enabled_modules: data.enabledModules
      })
      .select()
      .single()

    if (businessError || !business) {
      console.error('Error creating business:', businessError)
      throw new Error(businessError?.message || 'Failed to create business')
    }

    // 2. Create a business_profile record that will be pre-populated for the client
    const { error: profileError } = await supabase
      .from('business_profiles')
      .insert({
        business_id: business.id,
        user_id: null, // Will be linked when client signs up
        business_name: data.businessName,
        industry: data.industry,
        website: data.website || null,
        profile_completed: false // Client still needs to complete their profile
      })

    if (profileError) {
      console.error('Error creating business profile:', profileError)
      // Don't throw - this is non-critical
    }

    // 3. Create a business_users association placeholder
    await supabase
      .from('business_users')
      .insert({
        business_id: business.id,
        user_id: user.id, // Coach is associated for now
        role: 'coach'
      })

    // 4. Create a contact record for the owner
    const { error: contactError } = await supabase
      .from('business_contacts')
      .insert({
        business_id: business.id,
        first_name: data.ownerFirstName,
        last_name: data.ownerLastName,
        email: data.ownerEmail,
        phone: data.ownerPhone || null,
        is_primary: true,
        role: 'Owner'
      })

    if (contactError) {
      console.error('Error creating contact:', contactError)
      // Don't throw - this is non-critical
    }

    // Navigate to the new client's page
    router.push(`/coach/clients/${business.id}`)
  }

  const handleCancel = () => {
    router.push('/coach/clients')
  }

  return (
    <OnboardingWizard
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  )
}
