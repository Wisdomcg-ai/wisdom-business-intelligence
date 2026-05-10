import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')

  if (!businessId) {
    return NextResponse.json({ profile: null, error: 'Missing business_id' }, { status: 400 })
  }

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // business_profiles uses businesses.id as its business_id FK
    const { data, error } = await supabase
      .from('business_profiles')
      .select('id, industry, employee_count, annual_revenue, business_model, profile_completed')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'business-profile' }, extra: { context: "[API /business-profile] Error" } } as any)
      return NextResponse.json({ profile: null })
    }

    if (!data) {
      // Fallback: try querying by user_id (older profiles may use this)
      const { data: byUser } = await supabase
        .from('business_profiles')
        .select('id, industry, employee_count, annual_revenue, business_model, profile_completed')
        .eq('user_id', user.id)
        .maybeSingle()

      return NextResponse.json({ profile: byUser || null })
    }

    return NextResponse.json({ profile: data })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'business-profile' }, extra: { context: "[API /business-profile] Unexpected error" } } as any)
    return NextResponse.json({ profile: null })
  }
}
