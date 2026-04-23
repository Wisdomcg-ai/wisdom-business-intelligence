// /app/business-profile/services/business-profile-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * Business Profile Service - Supabase Integration
 *
 * Handles the normalized data model:
 * - businesses table: Lightweight parent (id, name, owner_id)
 * - business_profiles table: Detailed child (all profile fields)
 *
 * business_profiles.business_id -> businesses.id
 *
 * IMPORTANT: Methods now accept businessId parameter for coach view support.
 * When a coach views a client, they pass the client's businessId directly.
 */
export class BusinessProfileService {
  private static getSupabase() {
    return createClient()
  }

  /**
   * Get business + business_profile by business ID.
   * Use this when you already know the business ID (e.g., from BusinessContext).
   * This is the ONLY read path on /business-profile after Phase 41 — the owner_id
   * lazy-create path (the load and getOrCreate methods on this class) was
   * removed because it was creating phantom orphan rows for every
   * team-member / coach / admin on first visit (Jessica @ Oh Nine incident,
   * 2026-04-23). Business creation now only happens via explicit intents:
   * signup wizard, /api/admin/clients, /api/coach/clients, demo-client routes.
   */
  static async getBusinessProfileByBusinessId(businessId: string): Promise<{
    data: any
    businessId: string | null
    profileId: string | null
    error?: string
  }> {
    const supabase = this.getSupabase()
    try {
      console.log('[Business Profile Service] 📥 Loading business profile for business:', businessId)

      // Step 1: Get business record
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .single()

      if (businessError || !business) {
        console.error('[Business Profile Service] ❌ Error fetching business:', businessError)
        return { data: null, businessId: null, profileId: null, error: businessError?.message || 'Business not found' }
      }

      // Step 2: Get business_profile record
      const { data: profiles, error: profileError } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (profileError) {
        console.error('[Business Profile Service] ❌ Error fetching profile:', profileError)
        return { data: null, businessId: business.id, profileId: null, error: profileError.message }
      }

      let profile = profiles && profiles.length > 0 ? profiles[0] : null

      // Create profile if doesn't exist AND we have an owner
      // Don't create profiles for businesses without owners (coach view of unlinked client)
      if (!profile && business.owner_id) {
        console.log('[Business Profile Service] 🆕 Creating new business profile record')
        const { data: newProfile, error: createProfileError } = await supabase
          .from('business_profiles')
          .insert({
            user_id: business.owner_id,
            business_id: business.id,
            company_name: business.name,
            business_name: business.name,
            key_roles: [
              { title: '', name: '', status: '' },
              { title: '', name: '', status: '' },
              { title: '', name: '', status: '' }
            ],
            owner_info: {},
            profile_completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single()

        if (createProfileError) {
          console.error('[Business Profile Service] ❌ Error creating profile:', createProfileError)
          return { data: null, businessId: business.id, profileId: null, error: createProfileError.message }
        }

        profile = newProfile
      } else if (!profile) {
        console.log('[Business Profile Service] ⚠️ No profile found and no owner_id - cannot create profile')
      }

      // Merge business + profile data for the UI (same shape as the removed loadBusinessProfile)
      const mergedData = {
        ...profile,
        name: business?.name || profile?.business_name || null,
      }

      console.log('[Business Profile Service] ✅ Loaded business + profile successfully')
      return {
        data: mergedData,
        businessId: business?.id || null,
        profileId: profile?.id || null
      }
    } catch (err) {
      console.error('[Business Profile Service] ❌ Unexpected error:', err)
      return {
        data: null,
        businessId: null,
        profileId: null,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Save business profile data
   * Updates both business (name only) and business_profile (all fields)
   */
  static async saveBusinessProfile(
    businessId: string,
    profileId: string,
    data: any
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = this.getSupabase()
    try {
      console.log('[Business Profile Service] 💾 Saving business profile...')

      // Step 1: Update business table (just name)
      if (data.name) {
        const { error: businessError } = await supabase
          .from('businesses')
          .update({
            name: data.name,
            updated_at: new Date().toISOString()
          })
          .eq('id', businessId)

        if (businessError) {
          console.error('[Business Profile Service] ❌ Error updating business:', businessError)
          return { success: false, error: businessError.message }
        }
      }

      // Step 2: Update business_profile table (all profile fields)
      const profileData: any = {
        updated_at: new Date().toISOString(),
        profile_updated_at: new Date().toISOString()
      }

      // Map all the profile fields
      if (data.name) {
        profileData.company_name = data.name // REQUIRED field
        profileData.business_name = data.name
      }
      if (data.industry !== undefined) profileData.industry = data.industry
      if (data.business_model !== undefined) profileData.business_model = data.business_model
      if (data.years_in_operation !== undefined) profileData.years_in_operation = data.years_in_operation
      if (data.employee_count !== undefined) profileData.employee_count = data.employee_count
      if (data.annual_revenue !== undefined) profileData.annual_revenue = data.annual_revenue
      if (data.gross_profit !== undefined) profileData.gross_profit = data.gross_profit
      if (data.gross_profit_margin !== undefined) profileData.gross_profit_margin = data.gross_profit_margin
      if (data.net_profit !== undefined) profileData.net_profit = data.net_profit
      if (data.net_profit_margin !== undefined) profileData.net_profit_margin = data.net_profit_margin
      if (data.cash_in_bank !== undefined) profileData.cash_in_bank = data.cash_in_bank
      if (data.owner_info !== undefined) profileData.owner_info = data.owner_info
      if (data.key_roles !== undefined) profileData.key_roles = data.key_roles
      if (data.contractors_count !== undefined) profileData.contractors_count = data.contractors_count
      if (data.reporting_structure !== undefined) profileData.reporting_structure = data.reporting_structure
      if (data.top_challenges !== undefined) profileData.top_challenges = data.top_challenges
      if (data.growth_opportunities !== undefined) profileData.growth_opportunities = data.growth_opportunities
      if (data.current_priorities !== undefined) profileData.current_priorities = data.current_priorities
      if (data.social_media !== undefined) profileData.social_media = data.social_media
      if (data.website !== undefined) profileData.website = data.website
      if (data.locations !== undefined) profileData.locations = data.locations
      if (data.profile_completed !== undefined) profileData.profile_completed = data.profile_completed

      const { error: profileError } = await supabase
        .from('business_profiles')
        .update(profileData)
        .eq('id', profileId)

      if (profileError) {
        console.error('[Business Profile Service] ❌ Error updating profile:', profileError)
        return { success: false, error: profileError.message }
      }

      console.log('[Business Profile Service] ✅ Successfully saved business profile')
      return { success: true }
    } catch (err) {
      console.error('[Business Profile Service] ❌ Error saving:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }
}

export default BusinessProfileService
