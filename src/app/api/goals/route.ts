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
    // Query business_financial_goals - try direct business_id first
    const { data, error } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error) {
      console.error('[API /goals] Error:', error)
      return NextResponse.json({ goals: null })
    }

    if (!data) {
      return NextResponse.json({ goals: null })
    }

    return NextResponse.json({ goals: data })
  } catch (err) {
    console.error('[API /goals] Unexpected error:', err)
    return NextResponse.json({ goals: null })
  }
}
