/**
 * Xero Chart of Accounts API
 * Fetches expense accounts directly from Xero with proper account codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/xero/token-manager';

export const dynamic = 'force-dynamic';

// Service client with cache disabled to prevent stale token reads
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { global: { fetch: (url: any, init: any) => fetch(url, { ...init, cache: 'no-store' as RequestCache }) } }
);

// Keywords that indicate SaaS/subscription expense accounts
const SUBSCRIPTION_ACCOUNT_KEYWORDS = [
  'subscription',
  'software',
  'saas',
  'cloud',
  'hosting',
  'web services',
  'online services',
  'digital services',
  'it expense',
  'it software',
  'computer software',
  'computer expense',
  'app',
  'platform',
];

// Negative keywords - accounts that should NOT be included
const EXCLUDE_KEYWORDS = [
  'telephone',
  'phone',
  'mobile',
  'internet service',
  'profit',
  'distribution',
  'dividend',
  'depreciation',
  'amortisation',
  'amortization',
  'insurance',
  'rent',
  'lease',
  'wages',
  'salary',
  'super',
  'payroll',
];

async function fetchXeroAccounts(accessToken: string, tenantId: string, filterType: string) {
  const accountTypeFilter = filterType === 'all'
    ? 'Type=="REVENUE"||Type=="OTHERINCOME"||Type=="DIRECTCOSTS"||Type=="EXPENSE"||Type=="OVERHEADS"||Type=="OTHERCURRENTASSET"||Type=="OTHERCURRENTLIABILITY"'
    : 'Type=="EXPENSE"||Type=="OVERHEADS"||Type=="DIRECTCOSTS"'

  return fetch(
    `https://api.xero.com/api.xro/2.0/Accounts?where=${encodeURIComponent(accountTypeFilter)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Accept': 'application/json'
      },
      cache: 'no-store',
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const filterType = searchParams.get('filter') || 'subscription'; // 'subscription' | 'all'

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // Get Xero connection — try all ID formats
    let connection: any = null;
    const { data: c1 } = await supabase.from('xero_connections').select('*').eq('business_id', businessId).eq('is_active', true).maybeSingle();
    if (c1) connection = c1;
    if (!connection) {
      const { data: p } = await supabase.from('business_profiles').select('id').eq('business_id', businessId).maybeSingle();
      if (p?.id) { const { data: c2 } = await supabase.from('xero_connections').select('*').eq('business_id', p.id).eq('is_active', true).maybeSingle(); if (c2) connection = c2; }
    }
    if (!connection) {
      const { data: bp } = await supabase.from('business_profiles').select('business_id').eq('id', businessId).maybeSingle();
      if (bp?.business_id) { const { data: c3 } = await supabase.from('xero_connections').select('*').eq('business_id', bp.business_id).eq('is_active', true).maybeSingle(); if (c3) connection = c3; }
    }

    if (!connection) {
      return NextResponse.json({ error: 'No active Xero connection' }, { status: 404 });
    }

    // Get valid access token
    let tokenResult = await getValidAccessToken(connection, supabase);

    if (!tokenResult.success) {
      return NextResponse.json({ error: 'Xero connection expired. Please reconnect Xero.' }, { status: 401 });
    }

    // Fetch from Xero
    let response = await fetchXeroAccounts(tokenResult.accessToken!, connection.tenant_id, filterType);

    // If Xero returns 401, force a token refresh and retry once
    if (response.status === 401) {
      console.log('[Chart of Accounts] Xero returned 401, forcing token refresh...');

      // Expire the token in the DB to force the token manager to refresh
      await supabase
        .from('xero_connections')
        .update({ expires_at: new Date(0).toISOString() })
        .eq('id', connection.id);

      tokenResult = await getValidAccessToken(connection, supabase);

      if (!tokenResult.success) {
        return NextResponse.json(
          { error: tokenResult.message || 'Xero connection expired. Please reconnect Xero.' },
          { status: 401 }
        );
      }

      response = await fetchXeroAccounts(tokenResult.accessToken!, connection.tenant_id, filterType);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chart of Accounts] Xero API error:', response.status, errorText);

      const status = response.status === 401 || response.status === 403 ? 401
        : response.status === 429 ? 429
        : 502;
      return NextResponse.json(
        { error: 'Failed to fetch accounts from Xero', xeroStatus: response.status },
        { status }
      );
    }

    const data = await response.json();

    // Helper function to check if account is a subscription-type account
    const isSubscriptionAccount = (accountName: string): boolean => {
      const nameLower = accountName.toLowerCase();
      if (EXCLUDE_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
        return false;
      }
      return SUBSCRIPTION_ACCOUNT_KEYWORDS.some(keyword => nameLower.includes(keyword));
    };

    // Process and filter accounts
    let accounts = (data.Accounts || [])
      .filter((acc: any) => acc.Status === 'ACTIVE')
      .map((acc: any) => ({
        accountId: acc.AccountID,
        accountCode: acc.Code,
        accountName: acc.Name,
        accountType: acc.Type,
        isSuggested: isSubscriptionAccount(acc.Name),
      }));

    if (filterType === 'subscription') {
      accounts = accounts.filter((acc: any) => acc.isSuggested);
    }

    accounts.sort((a: any, b: any) => a.accountName.localeCompare(b.accountName));

    return NextResponse.json({
      success: true,
      accounts,
      totalAccounts: accounts.length,
    });
  } catch (err) {
    console.error('[Chart of Accounts] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch chart of accounts' }, { status: 500 });
  }
}
