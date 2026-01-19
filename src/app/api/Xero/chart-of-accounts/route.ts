/**
 * Xero Chart of Accounts API
 * Fetches expense accounts directly from Xero with proper account codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/xero/token-manager';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const filterType = searchParams.get('filter') || 'subscription'; // 'subscription' | 'all'

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    console.log('[Chart of Accounts] Fetching for business:', businessId);

    // Get the Xero connection
    const { data: connection, error: connError } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      console.error('[Chart of Accounts] No active Xero connection');
      return NextResponse.json({ error: 'No active Xero connection' }, { status: 404 });
    }

    // Get valid access token
    const tokenResult = await getValidAccessToken(connection, supabase);

    if (!tokenResult.success) {
      console.error('[Chart of Accounts] Token refresh failed:', tokenResult.error);
      return NextResponse.json({ error: 'Xero connection expired' }, { status: 401 });
    }

    const accessToken = tokenResult.accessToken!;

    // Fetch Chart of Accounts from Xero - only EXPENSE type accounts
    const response = await fetch(
      'https://api.xero.com/api.xro/2.0/Accounts?where=Type=="EXPENSE"||Type=="OVERHEADS"||Type=="DIRECTCOSTS"',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chart of Accounts] Xero API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch accounts from Xero' }, { status: 500 });
    }

    const data = await response.json();
    console.log('[Chart of Accounts] Fetched', data.Accounts?.length || 0, 'expense accounts from Xero');

    // Helper function to check if account is a subscription-type account
    const isSubscriptionAccount = (accountName: string): boolean => {
      const nameLower = accountName.toLowerCase();

      // Check if any exclude keyword matches
      if (EXCLUDE_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
        return false;
      }

      // Check if any subscription keyword matches
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

    // If filter is 'subscription', only return subscription-related accounts
    if (filterType === 'subscription') {
      accounts = accounts.filter((acc: any) => acc.isSuggested);
    }

    // Sort by name
    accounts.sort((a: any, b: any) => a.accountName.localeCompare(b.accountName));

    console.log('[Chart of Accounts] Returning', accounts.length, 'accounts (filter:', filterType + ')');

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
