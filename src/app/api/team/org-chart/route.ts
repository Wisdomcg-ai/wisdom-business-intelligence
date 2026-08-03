import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { getSupabasePublishableKey, getSupabaseSecretKey } from '@/lib/supabase/keys'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'
import { verifyBusinessAccess, getBusinessOwnerId } from '@/lib/utils/verify-business-access'

export const dynamic = 'force-dynamic'

// The org chart is stored per business OWNER (team_data.user_id = owner). It is
// legitimately read/written by that business's owner, active members, assigned
// coach, and super_admin. Access is authorized against `business_id` via
// verifyBusinessAccess; the storage key (owner) is resolved server-side. A
// client-supplied user id is NEVER trusted — accepting one was a cross-tenant
// IDOR (any user could read/overwrite any other user's chart by passing their id).
const OrgChartGetQuerySchema = z.object({
  business_id: z.string().optional(),
  // Accepted for backward compatibility with older clients, but ignored.
  user_id: z.string().optional(),
})

const OrgChartPostSchema = z.object({
  org_chart: z.any(),
  business_id: z.string().optional(),
  // Accepted for backward compatibility with older clients, but ignored.
  user_id: z.string().optional(),
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

    const businessId = new URL(request.url).searchParams.get('business_id')

    // Resolve whose chart to read. Without a business_id the caller can only
    // ever read their own row; with one, they must prove access to it and the
    // owner key is derived server-side.
    let ownerKey = user.id
    if (businessId) {
      const allowed = await verifyBusinessAccess(user.id, businessId)
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      ownerKey = (await getBusinessOwnerId(businessId)) || user.id
    }

    const { data, error } = await adminClient
      .from('team_data')
      .select('org_chart, business_id')
      .eq('user_id', ownerKey)
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
    // NOTE: body.user_id is intentionally NOT read — the storage key is derived
    // server-side from an authorized business_id (never trusted from the client).
    const { org_chart, business_id } = body

    if (!org_chart) {
      return NextResponse.json({ error: 'org_chart is required' }, { status: 400 })
    }

    // Resolve whose chart to write. Without a business_id the caller can only
    // ever write their own row; with one, they must prove access to it and the
    // owner key is derived server-side.
    let ownerKey = user.id
    if (business_id) {
      const allowed = await verifyBusinessAccess(user.id, business_id)
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      ownerKey = (await getBusinessOwnerId(business_id)) || user.id
    }

    // Build upsert data
    const upsertData: Record<string, any> = {
      user_id: ownerKey,
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
