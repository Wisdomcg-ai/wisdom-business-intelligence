import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')

  if (!businessId) {
    return NextResponse.json({ goals: null, error: 'Missing business_id' }, { status: 400 })
  }

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ goals: null, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // business_financial_goals uses business_profiles.id as its business_id,
    // but the wizard passes businesses.id. Look up the profile ID first.
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle()

    const profileId = profile?.id

    // Try profile ID first (correct FK), fall back to direct business_id
    const idsToTry = profileId ? [profileId, businessId] : [businessId]

    for (const id of idsToTry) {
      const { data, error } = await supabase
        .from('business_financial_goals')
        .select('*')
        .eq('business_id', id)
        .maybeSingle()

      if (error) {
        console.error('[API /goals] Error querying with id:', id, error)
        continue
      }

      if (data) {
        return NextResponse.json({ goals: data })
      }
    }

    return NextResponse.json({ goals: null })
  } catch (err) {
    console.error('[API /goals] Unexpected error:', err)
    return NextResponse.json({ goals: null })
  }
}
