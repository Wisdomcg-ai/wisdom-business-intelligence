/**
 * Subscription Budgets API
 * Save and retrieve subscription budgets from Step 6 of Forecast Wizard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface SubscriptionBudgetInput {
  vendorName: string;
  vendorKey: string;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc';
  monthlyBudget: number;
  last12MonthsSpend?: number;
  transactionCount?: number;
  avgTransactionAmount?: number;
  lastTransactionDate?: string;
  accountCodes?: string[];
  isActive?: boolean;
  notes?: string;
}

// GET - Retrieve subscription budgets for a business
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const forecastId = searchParams.get('forecast_id');
    const activeOnly = searchParams.get('active_only') !== 'false';

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

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
      console.error('[Subscription Budgets] Fetch error:', error);
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
    console.error('[Subscription Budgets] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch subscription budgets' }, { status: 500 });
  }
}

// POST - Save subscription budgets (upsert)
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();
    const { business_id, forecast_id, budgets } = body;

    if (!business_id || !budgets || !Array.isArray(budgets)) {
      return NextResponse.json(
        { error: 'business_id and budgets[] are required' },
        { status: 400 }
      );
    }

    console.log('[Subscription Budgets] Saving', budgets.length, 'budgets for business:', business_id);

    // Prepare records for upsert
    const records = budgets.map((b: SubscriptionBudgetInput) => ({
      business_id,
      forecast_id: forecast_id || null,
      vendor_name: b.vendorName,
      vendor_key: b.vendorKey,
      frequency: b.frequency,
      monthly_budget: b.monthlyBudget,
      last_12_months_spend: b.last12MonthsSpend || 0,
      transaction_count: b.transactionCount || 0,
      avg_transaction_amount: b.avgTransactionAmount || 0,
      last_transaction_date: b.lastTransactionDate || null,
      account_codes: b.accountCodes || [],
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
      console.error('[Subscription Budgets] Save error:', error);
      return NextResponse.json({ error: 'Failed to save subscription budgets' }, { status: 500 });
    }

    // Calculate totals
    const totalMonthly = records.reduce((sum: number, item: any) => sum + (item.monthly_budget || 0), 0);

    console.log('[Subscription Budgets] Saved successfully:', data?.length, 'records');

    return NextResponse.json({
      success: true,
      saved: data?.length || 0,
      summary: {
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        totalAnnual: Math.round(totalMonthly * 12 * 100) / 100,
      },
    });
  } catch (err) {
    console.error('[Subscription Budgets] Error:', err);
    return NextResponse.json({ error: 'Failed to save subscription budgets' }, { status: 500 });
  }
}

// DELETE - Remove a subscription budget
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const vendorKey = searchParams.get('vendor_key');
    const budgetId = searchParams.get('id');

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

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
      console.error('[Subscription Budgets] Delete error:', error);
      return NextResponse.json({ error: 'Failed to delete subscription budget' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Subscription Budgets] Error:', err);
    return NextResponse.json({ error: 'Failed to delete subscription budget' }, { status: 500 });
  }
}
