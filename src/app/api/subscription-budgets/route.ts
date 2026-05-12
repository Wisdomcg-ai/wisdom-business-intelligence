/**
 * Subscription Budgets API
 * Save and retrieve subscription budgets from Step 6 of Forecast Wizard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic';

// Service-key client — used INSIDE handlers (after auth passes) for actual DB ops.
// Keeps RLS-bypass behaviour intact while the auth gate guards business_id access.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface SubscriptionBudgetInput {
  vendorName: string;
  vendorKey: string;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc';
  monthlyBudget: number;
  last12MonthsSpend?: number;
  // Phase 61 (B2): current-FY YTD spend captured at analyze time. Persisted
  // so the wizard's Current FYTD card survives a page refresh.
  currentFySpend?: number;
  transactionCount?: number;
  avgTransactionAmount?: number;
  lastTransactionDate?: string;
  accountCodes?: string[];
  // Phase 63: calendar month (1-12) for annual subs only. Null otherwise.
  renewalMonth?: number | null;
  // Phase 64: per-account prior-FY $ split (keyed by Xero accountCode).
  // Sidebar uses for exact per-account attribution. Optional — legacy rows
  // restore as {} and the sidebar falls back to evenly-splitting accountCodes.
  accountSplits?: Record<string, number>;
  isActive?: boolean;
  notes?: string;
}

type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Verify the authenticated user has access to the given business_id.
 * Mirrors the dual-ID auth pattern from /api/forecast/[id] GET:
 *   - direct match against businesses.owner_id
 *   - dual-ID lookup via business_profiles (id or business_id, plus user_id)
 *   - team membership via business_users
 *   - coach/super_admin role via system_roles
 *
 * Returns { ok: true } on success, or { ok: false, response } with a 401/403 payload.
 */
async function authoriseBusinessAccess(businessId: string): Promise<AuthResult> {
  const sb = await createRouteHandlerClient();
  const { data: { user }, error: userError } = await sb.auth.getUser();
  if (userError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // The incoming businessId could be either businesses.id OR business_profiles.id.
  // Resolve both shapes and check access against both.
  let resolvedBusinessId: string = businessId;
  let ownerId: string | null = null;

  // Direct lookup in businesses
  const { data: bizDirect } = await sb
    .from('businesses')
    .select('id, owner_id')
    .eq('id', businessId)
    .maybeSingle();

  if (bizDirect) {
    resolvedBusinessId = bizDirect.id;
    ownerId = bizDirect.owner_id;
  } else {
    // Fall back to business_profiles.id → businesses.id resolution
    const { data: profile } = await sb
      .from('business_profiles')
      .select('business_id, user_id')
      .eq('id', businessId)
      .maybeSingle();

    if (profile?.business_id) {
      resolvedBusinessId = profile.business_id;
      const { data: biz } = await sb
        .from('businesses')
        .select('owner_id')
        .eq('id', profile.business_id)
        .maybeSingle();
      ownerId = biz?.owner_id || null;
    }
    if (profile?.user_id === user.id) {
      ownerId = user.id;
    }
  }

  if (ownerId === user.id) {
    return { ok: true, userId: user.id };
  }

  // Team membership check
  const { data: teamMember } = await sb
    .from('business_users')
    .select('id')
    .eq('business_id', resolvedBusinessId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (teamMember) {
    return { ok: true, userId: user.id };
  }

  // Coach / super_admin role
  const { data: roleData } = await sb
    .from('system_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleData?.role === 'coach' || roleData?.role === 'super_admin') {
    return { ok: true, userId: user.id };
  }

  return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

// GET - Retrieve subscription budgets for a business
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const forecastId = searchParams.get('forecast_id');
    const activeOnly = searchParams.get('active_only') !== 'false';

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    const auth = await authoriseBusinessAccess(businessId);
    if (auth.ok === false) return auth.response;

    let query = supabase
      .from('subscription_budgets')
      .select('*')
      .eq('business_id', businessId)
      .order('monthly_budget', { ascending: false });

    if (forecastId) {
      query = query.eq('forecast_id', forecastId);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      Sentry.captureException(error, { tags: { route: 'subscription-budgets' }, extra: { context: "[Subscription Budgets] Fetch error" } } as any);
      return NextResponse.json({ error: 'Failed to fetch subscription budgets' }, { status: 500 });
    }

    // Calculate totals
    const totalMonthly = (data || []).reduce((sum, item) => sum + (item.monthly_budget || 0), 0);
    const totalAnnual = totalMonthly * 12;

    return NextResponse.json({
      success: true,
      budgets: data || [],
      summary: {
        count: data?.length || 0,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        totalAnnual: Math.round(totalAnnual * 100) / 100,
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'subscription-budgets' }, extra: { context: "[Subscription Budgets] Error" } } as any);
    return NextResponse.json({ error: 'Failed to fetch subscription budgets' }, { status: 500 });
  }
}

// POST - Save subscription budgets (upsert)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { business_id, forecast_id, budgets } = body;

    if (!business_id || !budgets || !Array.isArray(budgets)) {
      return NextResponse.json(
        { error: 'business_id and budgets[] are required' },
        { status: 400 }
      );
    }

    const auth = await authoriseBusinessAccess(business_id);
    if (!auth.ok) return auth.response;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Budgets] Saving', budgets.length, 'budgets for business:', business_id);
    }

    // Prepare records for upsert
    const records = budgets.map((b: SubscriptionBudgetInput) => ({
      business_id,
      forecast_id: forecast_id || null,
      vendor_name: b.vendorName,
      vendor_key: b.vendorKey,
      frequency: b.frequency,
      monthly_budget: b.monthlyBudget,
      last_12_months_spend: b.last12MonthsSpend || 0,
      current_fy_spend: b.currentFySpend || 0,
      transaction_count: b.transactionCount || 0,
      avg_transaction_amount: b.avgTransactionAmount || 0,
      last_transaction_date: b.lastTransactionDate || null,
      account_codes: b.accountCodes || [],
      renewal_month: b.renewalMonth ?? null,
      account_splits: b.accountSplits || {},
      is_active: b.isActive !== false,
      notes: b.notes || null,
    }));

    // Upsert records (update if vendor_key exists for this business)
    const { data, error } = await supabase
      .from('subscription_budgets')
      .upsert(records, {
        onConflict: 'business_id,vendor_key',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      Sentry.captureException(error, { tags: { route: 'subscription-budgets' }, extra: { context: "[Subscription Budgets] Save error" } } as any);
      return NextResponse.json({ error: 'Failed to save subscription budgets' }, { status: 500 });
    }

    // Calculate totals
    const totalMonthly = records.reduce((sum: number, item: any) => sum + (item.monthly_budget || 0), 0);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Budgets] Saved successfully:', data?.length, 'records');
    }

    return NextResponse.json({
      success: true,
      saved: data?.length || 0,
      summary: {
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        totalAnnual: Math.round(totalMonthly * 12 * 100) / 100,
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'subscription-budgets' }, extra: { context: "[Subscription Budgets] Error" } } as any);
    return NextResponse.json({ error: 'Failed to save subscription budgets' }, { status: 500 });
  }
}

// DELETE - Remove a subscription budget
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const vendorKey = searchParams.get('vendor_key');
    const budgetId = searchParams.get('id');

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    const auth = await authoriseBusinessAccess(businessId);
    if (!auth.ok) return auth.response;

    let query = supabase
      .from('subscription_budgets')
      .delete()
      .eq('business_id', businessId);

    if (budgetId) {
      query = query.eq('id', budgetId);
    } else if (vendorKey) {
      query = query.eq('vendor_key', vendorKey);
    } else {
      return NextResponse.json({ error: 'id or vendor_key is required' }, { status: 400 });
    }

    const { error } = await query;

    if (error) {
      Sentry.captureException(error, { tags: { route: 'subscription-budgets' }, extra: { context: "[Subscription Budgets] Delete error" } } as any);
      return NextResponse.json({ error: 'Failed to delete subscription budget' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'subscription-budgets' }, extra: { context: "[Subscription Budgets] Error" } } as any);
    return NextResponse.json({ error: 'Failed to delete subscription budget' }, { status: 500 });
  }
}
