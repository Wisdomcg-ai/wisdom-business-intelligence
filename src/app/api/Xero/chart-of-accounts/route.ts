/**
 * Xero Chart of Accounts API
 * Fetches expense accounts directly from Xero with proper account codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access';
import { withQuerySchema } from '@/lib/api/with-schema';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId';

export const dynamic = 'force-dynamic';

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    filter: z.string().optional(),
  })
  .passthrough();

// Service client with cache disabled to prevent stale token reads
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
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

async function getHandler(request: NextRequest) {
  try {
    // Auth check
    const authClient = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const filterType = searchParams.get('filter') || 'subscription'; // 'subscription' | 'all'

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, businessId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get EVERY active Xero connection.
    // A multi-org business (Dragon Roofing = Dragon Roofing Pty Ltd + Easy Hail
    // Claim; IICT Group = three entities) has one chart of accounts PER org. The
    // old code resolved a single connection, so the operator was only ever offered
    // one org's accounts — an account that exists only in the second org could not
    // be selected at all, and the subscription crawl downstream never saw it.
    const { connections } = await resolveXeroConnections(supabase, businessId);

    if (connections.length === 0) {
      return NextResponse.json({ error: 'No active Xero connection' }, { status: 404 });
    }

    /**
     * Fetch one org's accounts, refreshing the token once on a 401. Never throws:
     * a single dead org must not blank the picker for the healthy ones — it is
     * reported in `warnings` instead so the operator knows the list is partial.
     */
    const fetchForConnection = async (connection: any) => {
      try {
        let tokenResult = await getValidAccessToken(connection, supabase);
        if (!tokenResult.success) {
          return { connection, accounts: null, error: 'expired' as const };
        }

        let response = await fetchXeroAccounts(tokenResult.accessToken!, connection.tenant_id, filterType);

        // If Xero returns 401, force a token refresh and retry once
        if (response.status === 401) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Chart of Accounts] Xero returned 401, forcing token refresh...');
          }

          // Expire the token in the DB to force the token manager to refresh
          await supabase
            .from('xero_connections')
            .update({ expires_at: new Date(0).toISOString() })
            .eq('id', connection.id);

          tokenResult = await getValidAccessToken(connection, supabase);
          if (!tokenResult.success) {
            return { connection, accounts: null, error: 'expired' as const };
          }

          response = await fetchXeroAccounts(tokenResult.accessToken!, connection.tenant_id, filterType);
        }

        if (!response.ok) {
          const errorText = await response.text();
          Sentry.captureMessage(
            `[Chart of Accounts] Xero API error status=${response.status}`,
            { level: 'error' as any, extra: { errorText, tenantId: connection.tenant_id } } as any
          );
          return { connection, accounts: null, error: `http_${response.status}` as const };
        }

        const data = await response.json();
        return { connection, accounts: (data.Accounts || []) as any[], error: null };
      } catch (err) {
        Sentry.captureException(err, {
          tags: { route: 'Xero/chart-of-accounts' },
          extra: { context: 'per-connection accounts fetch', tenantId: connection?.tenant_id },
        } as any);
        return { connection, accounts: null, error: 'threw' as const };
      }
    };

    // Different tenants have independent rate limits, so fetch them concurrently.
    const results = await Promise.all(connections.map(fetchForConnection));

    const failed = results.filter(r => r.accounts === null);
    // Only a total wipeout is an error — a partial result is still usable.
    if (failed.length === results.length) {
      const anyExpired = failed.some(r => r.error === 'expired');
      return NextResponse.json(
        { error: anyExpired ? 'Xero connection expired. Please reconnect Xero.' : 'Failed to fetch accounts from Xero' },
        { status: anyExpired ? 401 : 502 }
      );
    }

    // Helper function to check if account is a subscription-type account
    const isSubscriptionAccount = (accountName: string): boolean => {
      const nameLower = accountName.toLowerCase();
      if (EXCLUDE_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
        return false;
      }
      return SUBSCRIPTION_ACCOUNT_KEYWORDS.some(keyword => nameLower.includes(keyword));
    };

    // Union the orgs' charts by ACCOUNT CODE — the wizard selects accounts by code
    // and passes those codes to the crawl, which applies them to every org. Xero's
    // AccountID is a per-tenant GUID and so is useless as a cross-org identity.
    // `orgs` records which orgs actually carry each code so the operator can tell a
    // shared code (Dragon + Easy Hail both use 485 "Subscriptions") from a
    // single-org one.
    const byCode = new Map<string, any>();
    for (const { connection, accounts } of results) {
      const orgName = connection.tenant_name || 'Xero org';
      for (const acc of accounts || []) {
        if (acc.Status !== 'ACTIVE') continue;
        const code = acc.Code;
        // A code-less account cannot be selected or matched downstream.
        if (!code) continue;

        const existing = byCode.get(code);
        if (existing) {
          if (!existing.orgs.includes(orgName)) existing.orgs.push(orgName);
          // Two orgs can name the same code differently. Keep the first (newest
          // connection) as the label but surface the divergence rather than hiding it.
          if (acc.Name && acc.Name !== existing.accountName && !existing.alsoNamed.includes(acc.Name)) {
            existing.alsoNamed.push(acc.Name);
          }
          // Suggested in ANY org is enough to offer it — a code named
          // "Subscriptions" in one org and "General" in another is still the
          // subscriptions account for the org that spends through it.
          existing.isSuggested = existing.isSuggested || isSubscriptionAccount(acc.Name || '');
          continue;
        }

        byCode.set(code, {
          accountId: acc.AccountID,
          accountCode: code,
          accountName: acc.Name,
          accountType: acc.Type,
          isSuggested: isSubscriptionAccount(acc.Name || ''),
          orgs: [orgName],
          alsoNamed: [] as string[],
        });
      }
    }

    let accounts = Array.from(byCode.values());

    if (filterType === 'subscription') {
      accounts = accounts.filter((acc: any) => acc.isSuggested);
    }

    accounts.sort((a: any, b: any) => a.accountName.localeCompare(b.accountName));

    return NextResponse.json({
      success: true,
      accounts,
      totalAccounts: accounts.length,
      // Which orgs are represented, and which could not be read. The wizard shows
      // this so a partial list is never mistaken for a complete one.
      orgsAnalyzed: results.filter(r => r.accounts !== null).map(r => r.connection.tenant_name || 'Xero org'),
      warnings: failed.map(r => ({
        org: r.connection.tenant_name || 'Xero org',
        reason: r.error,
      })),
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'Xero/chart-of-accounts' }, extra: { context: "[Chart of Accounts] Error" } } as any);
    return NextResponse.json({ error: 'Failed to fetch chart of accounts' }, { status: 500 });
  }
}

export const GET = withQuerySchema(
  'Xero/chart-of-accounts',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
);
