import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { getSupabasePublishableKey, getSupabaseSecretKey } from '@/lib/supabase/keys'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): GET reads optional `user_id`; POST saves the org chart.
const OrgChartGetQuerySchema = z.object({
  user_id: z.string().optional(),
})

const OrgChartPostSchema = z.object({
  org_chart: z.any(),
  user_id: z.string().optional(),
  business_id: z.string().optional(),
})

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

async function getAuthUser(request: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey(),
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
async function getHandler(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = new URL(request.url).searchParams
    const userId = searchParams.get('user_id') || user.id

    const { data, error } = await adminClient
      .from('team_data')
      .select('org_chart, business_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'team/org-chart' }, extra: { context: "[OrgChart API] Load error" } } as any)
      return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
    }

    return NextResponse.json({ org_chart: data?.org_chart || null })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'team/org-chart' }, extra: { context: "[OrgChart API] Error" } } as any)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST - Save org chart data
async function postHandler(request: Request) {
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
      Sentry.captureException(error, { tags: { route: 'team/org-chart' }, extra: { context: "[OrgChart API] Save error" } } as any)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'team/org-chart' }, extra: { context: "[OrgChart API] Error" } } as any)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('team/org-chart', OrgChartGetQuerySchema, getHandler)
export const POST = withSchema('team/org-chart', OrgChartPostSchema, postHandler)
