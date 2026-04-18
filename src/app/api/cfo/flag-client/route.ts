import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * POST /api/cfo/flag-client
 *
 * Toggles whether a business appears on the CFO dashboard.
 * Coach/super_admin only.
 *
 * Body: { business_id: string, is_cfo_client: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check
    const { data: roleRow } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    const isSuperAdmin = roleRow?.role === 'super_admin'
    const isCoach = roleRow?.role === 'coach'
    if (!isSuperAdmin && !isCoach) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { business_id, is_cfo_client } = await request.json()
    if (!business_id || typeof is_cfo_client !== 'boolean') {
      return NextResponse.json({ error: 'business_id and is_cfo_client required' }, { status: 400 })
    }

    // Coach can only flag their assigned clients; super_admin can flag any
    if (!isSuperAdmin) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('assigned_coach_id')
        .eq('id', business_id)
        .maybeSingle()
      if (!biz || biz.assigned_coach_id !== user.id) {
        return NextResponse.json({ error: 'Access denied — not your assigned client' }, { status: 403 })
      }
    }

    const { error } = await supabase
      .from('businesses')
      .update({ is_cfo_client })
      .eq('id', business_id)

    if (error) {
      console.error('[CFO Flag] update error:', error)
      return NextResponse.json({ error: 'Update failed', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, business_id, is_cfo_client })
  } catch (err) {
    console.error('[CFO Flag] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
