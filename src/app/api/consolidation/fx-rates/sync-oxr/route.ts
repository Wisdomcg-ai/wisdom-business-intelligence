/**
 * POST /api/consolidation/fx-rates/sync-oxr
 *
 * Syncs monthly FX rates from Open Exchange Rates for a currency pair.
 * Mirrors Calxa's methodology: monthly_average (P&L) + closing_spot (BS).
 *
 * Body:  { currency_pair: 'HKD/AUD', year: 2026, month: 3 }
 * Writes two rows into fx_rates:
 *   - monthly_average with period = YYYY-MM-01
 *   - closing_spot    with period = last-day-fetched (usually month-end)
 * Both with source='oxr'; upserts on (currency_pair, rate_type, period).
 *
 * Role gate: coach OR super_admin (same as the manual POST).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { deriveMonthlyRatePair } from '@/lib/consolidation/oxr'

export const dynamic = 'force-dynamic'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

type Guard =
  | { allowed: true; userId: string; role: 'coach' | 'super_admin' }
  | { allowed: false; status: 401 | 403; error: string }

async function requireCoachOrSuperAdmin(): Promise<Guard> {
  const authSupabase = await createRouteHandlerClient()
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser()
  if (authError || !user) {
    return { allowed: false, status: 401, error: 'Unauthorized' }
  }
  const { data: roleRow } = await authSupabase
    .from('system_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  const role = roleRow?.role
  if (role !== 'coach' && role !== 'super_admin') {
    return {
      allowed: false,
      status: 403,
      error: 'Access denied — coach or super_admin required',
    }
  }
  return { allowed: true, userId: user.id, role }
}

function validate(body: unknown): {
  ok: true
  currency_pair: string
  year: number
  month: number
} | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' }
  }
  const b = body as Record<string, unknown>
  const cp = b.currency_pair
  const year = b.year
  const month = b.month
  if (typeof cp !== 'string' || !/^[A-Z]{3}\/[A-Z]{3}$/.test(cp)) {
    return { ok: false, error: 'currency_pair must match "XXX/YYY"' }
  }
  if (typeof year !== 'number' || year < 1999 || year > 2100) {
    return { ok: false, error: 'year must be an integer 1999..2100' }
  }
  if (typeof month !== 'number' || month < 1 || month > 12) {
    return { ok: false, error: 'month must be an integer 1..12' }
  }
  return { ok: true, currency_pair: cp, year, month }
}

export async function POST(request: NextRequest) {
  let stage = 'init'
  try {
    stage = 'auth'
    const guard = await requireCoachOrSuperAdmin()
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    stage = 'validate'
    const body = await request.json().catch(() => null)
    const v = validate(body)
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 })
    }

    stage = 'config'
    const appId = process.env.OPENEXCHANGERATES_APP_ID
    if (!appId) {
      return NextResponse.json(
        {
          error:
            'OPENEXCHANGERATES_APP_ID is not configured on the server. Add it to .env.local locally and Vercel env vars in production.',
        },
        { status: 500 },
      )
    }

    stage = 'derive'
    const derived = await deriveMonthlyRatePair(
      v.currency_pair,
      v.year,
      v.month,
      appId,
    )

    stage = 'upsert'
    const periodAvg = `${v.year}-${String(v.month).padStart(2, '0')}-01`
    const rows = [
      {
        currency_pair: v.currency_pair,
        rate_type: 'monthly_average' as const,
        period: periodAvg,
        rate: derived.monthly_average,
        source: 'oxr',
      },
      {
        currency_pair: v.currency_pair,
        rate_type: 'closing_spot' as const,
        period: derived.closing_spot_date,
        rate: derived.closing_spot,
        source: 'oxr',
      },
    ]

    const { data, error } = await adminDb
      .from('fx_rates')
      .upsert(rows, { onConflict: 'currency_pair,rate_type,period' })
      .select()

    if (error) {
      console.error('[FX Sync OXR] upsert error:', error)
      return NextResponse.json(
        { error: 'Failed to save rates', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      rates: data,
      diagnostics: {
        days_fetched: derived.days_fetched.length,
        days_missing: derived.days_missing,
        monthly_average: derived.monthly_average,
        closing_spot: derived.closing_spot,
        closing_spot_date: derived.closing_spot_date,
      },
    })
  } catch (err) {
    console.error('[FX Sync OXR] unhandled error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
