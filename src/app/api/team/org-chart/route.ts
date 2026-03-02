import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function getAuthUser(request: NextRequest) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET - Load org chart data
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('user_id') || user.id

    const { data, error } = await adminClient
      .from('team_data')
      .select('org_chart, business_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[OrgChart API] Load error:', error)
      return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
    }

    return NextResponse.json({ org_chart: data?.org_chart || null })
  } catch (err) {
    console.error('[OrgChart API] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST - Save org chart data
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { org_chart, user_id, business_id } = body

    const targetUserId = user_id || user.id

    if (!org_chart) {
      return NextResponse.json({ error: 'org_chart is required' }, { status: 400 })
    }

    // Build upsert data
    const upsertData: Record<string, any> = {
      user_id: targetUserId,
      org_chart,
      updated_at: new Date().toISOString(),
    }

    // Include business_id if provided
    if (business_id) {
      upsertData.business_id = business_id
    }

    const { error } = await adminClient
      .from('team_data')
      .upsert(upsertData, { onConflict: 'user_id' })

    if (error) {
      console.error('[OrgChart API] Save error:', error)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[OrgChart API] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
