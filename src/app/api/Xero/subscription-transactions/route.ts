/**
 * Subscription Transactions API
 * Fetches ALL transactions from Xero for selected expense accounts
 * Includes both Invoices (ACCPAY) and Bank Transactions (credit card/direct debit)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { withSchema } from '@/lib/api/with-schema';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access';
import { VENDOR_MAPPINGS, extractVendorName, createVendorKey } from '@/lib/utils/vendor-normalization';
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds';
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId';
import { deriveVendorFromTransactions } from '@/lib/xero/subscription-vendor-derivation';
import { aggregateVendorMonthActuals } from '@/lib/subscriptions/variance';
import { isSameAccount } from '@/lib/xero/account-name-match';

export const dynamic = 'force-dynamic';
// High-volume tenants (e.g. JDS: 3700+ bills + 3300+ bank lines) need a long
// paced crawl through Xero. At <=60 calls/min the worst case is ~200 calls, so
// allow up to 5 min. Without this the function timed out mid-crawl and silently
// returned partial (current-FY-missing) data.
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

interface XeroTransaction {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;  // Positive for expenses, negative for credits/refunds
  rawAmount: number;  // Original amount from Xero (for debugging)
  accountCode: string;
  accountName: string;
  source: 'invoice' | 'bank' | 'journal';
  reference?: string;
  period: 'prior_fy' | 'current_fy';
  isCredit: boolean;  // True if this is a refund/credit (negative amount)
  // Which Xero org this row came from. A multi-org business bills the SAME vendor
  // from more than one org, and each org has its own billing rhythm — frequency
  // and budget must be derived per org and then summed, never from the pooled
  // stream. See the per-org derivation in section 4.
  tenantId: string;
}

interface VendorSummary {
  vendorName: string;
  vendorKey: string;
  transactions: XeroTransaction[];
  // Prior FY totals (Jul-Jun of last year)
  priorFYAmount: number;
  priorFYCount: number;
  // Current FY YTD totals (Jul-Today)
  currentFYAmount: number;
  currentFYCount: number;
  // Combined totals
  totalAmount: number;
  transactionCount: number;
  avgAmount: number;
  suggestedFrequency: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc';
  confidence: 'high' | 'medium' | 'low';
  firstTransaction: string;
  lastTransaction: string;
  monthsSpan: number;
  suggestedMonthlyBudget: number;
  // Per-vendor account codes — the distinct Xero account codes that this
  // vendor's transactions actually post to. Persisted on subscription_budgets
  // so the Step 5 sidebar can correctly attribute per-account totals (a
  // vendor only "belongs to" accounts where it actually has transactions,
  // not the full selected-account list).
  accountCodes: string[];
  // Phase 63: calendar month (1-12) the vendor renews. Set for annual subs
  // only — null for monthly / quarterly / ad-hoc. Derived from lastTransaction
  // here; operator can override in the manual-add form.
  renewalMonth: number | null;
  // Phase 64: per-account prior-FY $ amount for this vendor. Sidebar uses
  // these exact splits instead of attributing the full monthlyBudget to
  // every account in accountSplits (which double-counted multi-account
  // vendors). Keyed by accountCode.
  accountSplits: Record<string, number>;
  // Dossier (18 Aug 2026) — the evidence behind the suggestion, so Step 5 can
  // answer "is this still running, what are we actually paying now, and is a
  // single payment a renewal or a one-off" instead of showing a bare number.
  status: 'active' | 'lapsed' | 'new' | 'one-off';
  stoppedMonth: string | null;
  lastPaymentAmount: number;
  daysSinceLastPayment: number | null;
  priorYearTwin: boolean;
  /** Old FY-average basis, kept as evidence; the gap vs suggestedMonthlyBudget
   *  is the price movement during the year. */
  fyAverageMonthly: number;
}

// Parse Xero date format (can be ISO string or /Date(timestamp)/ format)
function parseXeroDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Handle /Date(timestamp)/ format
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//);
  if (match) {
    return new Date(parseInt(match[1]));
  }

  // Handle ISO format or other formats
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}


/**
 * Extract account balance from Xero P&L Report by account NAME
 * This is more reliable since P&L Reports use GUIDs not account codes
 */
function extractAccountBalanceByName(plReport: any, accountNames: string[]): number | null {
  try {
    const reports = plReport?.Reports;
    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[extractAccountBalanceByName] No reports found');
      }
      return null;
    }

    const report = reports[0];
    const rows = report?.Rows;
    if (!rows || !Array.isArray(rows)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[extractAccountBalanceByName] No rows found');
      }
      return null;
    }

    let totalBalance = 0;
    let foundAccounts: string[] = [];

    // Normalize account names for matching
    const normalizedNames = accountNames.map(n => n.toLowerCase().trim());
    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractAccountBalanceByName] Searching for names:', normalizedNames);
    }

    function searchRows(rows: any[]): void {
      for (const row of rows) {
        if (row.Cells && Array.isArray(row.Cells) && row.Cells.length >= 2) {
          const accountCell = row.Cells[0];
          const valueCell = row.Cells[row.Cells.length - 1];
          const accountName = (accountCell?.Value || '').toLowerCase().trim();
          const value = valueCell?.Value || '';

          // Check if this account name matches any of our target names
          const isMatch = normalizedNames.some(targetName =>
            accountName === targetName ||
            accountName.includes(targetName) ||
            targetName.includes(accountName)
          );

          if (isMatch && row.RowType === 'Row') {
            const numValue = parseFloat(value || '0');
            if (!isNaN(numValue)) {
              totalBalance += numValue;
              foundAccounts.push(`${accountCell?.Value}: ${numValue}`);
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[extractAccountBalanceByName] MATCH: "${accountCell?.Value}" = ${numValue}`);
              }
            }
          }
        }

        if (row.Rows && Array.isArray(row.Rows)) {
          searchRows(row.Rows);
        }
      }
    }

    searchRows(rows);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractAccountBalanceByName] Found:', foundAccounts);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractAccountBalanceByName] Total:', totalBalance);
    }

    return foundAccounts.length > 0 ? totalBalance : null;
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/subscription-transactions' }, extra: { context: "[extractAccountBalanceByName] Error" } } as any);
    return null;
  }
}

/**
 * Extract account balance from Xero P&L Report for specified account codes
 * The P&L Report has a nested structure with Rows containing account data
 */
function extractAccountBalance(plReport: any, accountCodes: string[]): number | null {
  try {
    const reports = plReport?.Reports;
    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[extractAccountBalance] No reports found in response');
      }
      return null;
    }

    const report = reports[0];
    const rows = report?.Rows;
    if (!rows || !Array.isArray(rows)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[extractAccountBalance] No rows found in report');
      }
      return null;
    }

    let totalBalance = 0;
    let foundAccounts: string[] = [];
    let allAccountsInReport: string[] = [];

    // Recursively search through the report structure for matching accounts
    function searchRows(rows: any[], depth: number = 0): void {
      for (const row of rows) {
        const rowType = row.RowType || 'unknown';

        // Check if this row has cells with account data
        if (row.Cells && Array.isArray(row.Cells)) {
          const cells = row.Cells;
          if (cells.length >= 2) {
            const accountCell = cells[0];
            const valueCell = cells[cells.length - 1];

            // Get account info
            const accountId = accountCell?.Attributes?.[0]?.Value || '';
            const accountName = accountCell?.Value || '';
            const value = valueCell?.Value || '';

            // Track all accounts for debugging (only actual account rows)
            if (accountId && rowType === 'Row') {
              allAccountsInReport.push(`${accountId}: ${accountName} = ${value}`);
            }

            // Match by account code (in Attributes) or by name containing the code
            const accountNameLower = accountName.toLowerCase();
            const isMatch = accountCodes.some(code => {
              // Try various matching patterns
              const codeMatch = accountId === code ||
                     accountId === `account-${code}` ||
                     accountId.endsWith(code) ||
                     accountName.includes(`(${code})`) ||
                     accountName.startsWith(`${code} `) ||
                     accountName.startsWith(`${code}-`) ||
                     accountName.startsWith(`${code}:`);

              // Also match by account name containing "subscription"
              const nameMatch = accountNameLower.includes('subscription') ||
                                accountNameLower.includes('software') ||
                                accountNameLower.includes('saas');

              return codeMatch || nameMatch;
            });

            if (isMatch && rowType === 'Row') {
              const numValue = parseFloat(value || '0');
              if (!isNaN(numValue)) {
                totalBalance += numValue;
                foundAccounts.push(`${accountName} (${accountId}): ${numValue}`);
              }
            }
          }
        }

        // Recurse into nested rows
        if (row.Rows && Array.isArray(row.Rows)) {
          searchRows(row.Rows, depth + 1);
        }
      }
    }

    searchRows(rows);

    // Log debugging info
    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractAccountBalance] Searching for account codes:', accountCodes);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractAccountBalance] All accounts in report (first 20):', allAccountsInReport.slice(0, 20));
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractAccountBalance] Found matching accounts:', foundAccounts);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractAccountBalance] Total balance:', totalBalance);
    }

    return foundAccounts.length > 0 ? totalBalance : null;
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/subscription-transactions' }, extra: { context: "[extractAccountBalance] Error parsing P&L report" } } as any);
    return null;
  }
}

// VALID-04 (observe mode): POST analyzes subscription transactions for a business.
const SubscriptionTransactionsPostSchema = z
  .object({
    business_id: z.string(),
    account_codes: z.array(z.string()),
  })
  .passthrough();

async function postHandler(request: Request) {
  try {
    // Auth check
    const authClient = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { business_id, account_codes } = body;

    if (!business_id || !account_codes || !Array.isArray(account_codes)) {
      return NextResponse.json(
        { error: 'business_id and account_codes[] are required' },
        { status: 400 }
      );
    }

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, business_id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/Xero/subscription-transactions',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // Filter out empty account codes
    const validAccountCodes = account_codes.filter((code: string) => code && code.trim());

    if (validAccountCodes.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid account code is required' },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Starting analysis for business:', business_id);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Account codes:', validAccountCodes);
    }

    // Get EVERY active Xero connection for this business.
    //
    // A multi-org business has one set of books PER Xero org: Dragon Roofing is
    // "Dragon Roofing Pty Ltd" + "EASY HAIL CLAIM PTY LTD"; IICT Group is three
    // entities. This crawl used to resolve a SINGLE connection, so it analysed one
    // org and silently reported it as the whole business — Dragon's forecast saw
    // only Easy Hail's 11 vendors and missed Dragon Roofing's own subscriptions
    // (~$77k/yr). Worse, connections created by one "connect all orgs" flow share
    // an identical created_at, so WHICH org won was effectively arbitrary and could
    // change between runs.
    //
    // We now crawl every org and merge. Merging is safe by construction: vendor
    // grouping (section 3 below) is a pure function of `allTransactions`, keyed by
    // normalised vendorKey, and every derived field (frequency, monthsSpan,
    // avgAmount, suggestedMonthlyBudget) is recomputed in section 4 from the merged
    // transaction set. A vendor billed by both orgs (Zendesk, Hubstaff and Google
    // Workspace all are, for Dragon) therefore lands as ONE vendor with summed
    // spend — never duplicated, never dropped.
    const { connections } = await resolveXeroConnections(supabase, business_id);

    if (connections.length === 0) {
      Sentry.captureException(business_id, { tags: { route: 'Xero/subscription-transactions' }, extra: { context: "[Subscription Txns] No active Xero connection for" } } as any);
      return NextResponse.json({ error: 'No active Xero connection found' }, { status: 404 });
    }

    /** Orgs that were crawled successfully, and those that were not (reported to the operator). */
    const crawledTenantIds: string[] = [];
    const orgsAnalyzed: string[] = [];
    const orgFailures: { org: string; reason: string }[] = [];
    /** Live access token per crawled tenant, reused by the P&L reconciliation below. */
    const tokenByTenantId = new Map<string, string>();
    /** Selected codes whose account NAME differs between orgs — reported, not guessed at. */
    const accountNameConflicts: { code: string; org: string; name: string; expected: string }[] = [];

    // Which orgs may legitimately be summed together.
    //
    // Two filters, both about not inventing a number:
    //  1. `include_in_consolidation = false` means the operator has said this org
    //     is not part of the group's reported figures — honour that here too.
    //  2. This crawl reads LIVE Xero bills, which carry each org's own functional
    //     currency and no FX rates. AUD is the platform's presentation currency
    //     (see needs-fx-consolidation.ts); FX translation belongs to the
    //     consolidation engine, which this path does not go through. IICT Group
    //     has an HKD org alongside two AUD ones — adding HKD dollars to AUD
    //     dollars would produce a confidently wrong subscription budget, which is
    //     worse than an incomplete one. So a non-AUD org is EXCLUDED and reported,
    //     never silently summed.
    const PRESENTATION_CURRENCY = 'AUD';
    const eligibleConnections: any[] = [];
    for (const c of connections) {
      const orgName = c.tenant_name || 'Xero org';
      if (c.include_in_consolidation === false) {
        orgFailures.push({ org: orgName, reason: 'excluded_from_consolidation' });
        continue;
      }
      const ccy = (c.functional_currency || PRESENTATION_CURRENCY).toUpperCase();
      if (ccy !== PRESENTATION_CURRENCY) {
        orgFailures.push({ org: orgName, reason: `currency_${ccy}_not_translated` });
        continue;
      }
      eligibleConnections.push(c);
    }

    if (eligibleConnections.length === 0) {
      return NextResponse.json(
        {
          error: 'No Xero org could be analysed in the presentation currency (AUD).',
          orgFailures,
        },
        { status: 422 }
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Orgs to crawl:', eligibleConnections.map((c: any) => c.tenant_name).join(', '));
    }

    // The org currently being crawled. The paced xeroGet closure below reads these
    // rather than capturing a single tenant's token, so one helper serves every org.
    let activeToken = '';
    let activeTenantId = '';

    // --- Paced, 429-aware Xero GET (reliability fix for high-volume tenants) ---
    // Xero throttles at ~60 calls/min PER TENANT. The old loops fired a call
    // every 500ms (=120/min) and then DROPPED data on the inevitable 429: the
    // invoice-list loop `break`s, and batches were skipped after a single retry.
    // Because bills are fetched newest-first, the current-FY batches are first
    // in line when the limit is already exhausted, so THEY get 429'd and dropped
    // while later prior-FY batches succeed — the exact "FY YTD $0 / prior-FY OK"
    // symptom (JDS, 3700+ bills). This helper paces to <=60/min and retries 429s
    // until they clear (respecting Retry-After), so no page/batch is ever lost.
    const XERO_MIN_INTERVAL_MS = 1100; // stay under 60 calls/min/tenant
    const XERO_MAX_429_RETRIES = 8;
    // Xero's limits are PER TENANT, so the pacing clock is reset when we move to
    // the next org (see the crawl loop below) — one org's calls must not delay
    // another's against a budget they don't share.
    let xeroLastCallAt = 0;
    const xeroGet = async (url: string): Promise<Response | null> => {
      for (let attempt = 0; attempt <= XERO_MAX_429_RETRIES; attempt++) {
        const sinceLast = Date.now() - xeroLastCallAt;
        if (sinceLast < XERO_MIN_INTERVAL_MS) {
          await new Promise(r => setTimeout(r, XERO_MIN_INTERVAL_MS - sinceLast));
        }
        xeroLastCallAt = Date.now();
        let res: Response;
        try {
          res = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${activeToken}`,
              'xero-tenant-id': activeTenantId,
              'Accept': 'application/json',
            },
          });
        } catch (netErr) {
          if (attempt === XERO_MAX_429_RETRIES) throw netErr;
          await new Promise(r => setTimeout(r, 1500)); // transient network blip
          continue;
        }
        if (res.status === 429) {
          const retryAfter = Math.min(parseInt(res.headers.get('Retry-After') || '5', 10) || 5, 65);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Subscription Txns] 429 — waiting ${retryAfter}s (attempt ${attempt + 1})`);
          }
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }
        return res;
      }
      // Exhausted 429 retries — return null so the caller stops cleanly rather
      // than silently treating a throttled page as "no more data".
      Sentry.captureMessage('[Subscription Txns] Xero 429 retries exhausted', { level: 'warning' as any, extra: { url } } as any);
      return null;
    };

    // Calculate FY-aligned date ranges (Australian FY: July-June)
    // Use UTC dates to avoid timezone issues
    const today = new Date();
    const currentYear = today.getUTCFullYear();
    const currentMonth = today.getUTCMonth(); // 0-indexed (0 = Jan, 6 = Jul)

    // Determine current FY start
    // If we're in Jan-Jun, current FY started last July
    // If we're in Jul-Dec, current FY started this July
    const currentFYStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;

    // Create dates in UTC to avoid timezone issues
    const currentFYStart = new Date(Date.UTC(currentFYStartYear, 6, 1)); // July 1
    const currentFYEnd = new Date(Date.UTC(currentFYStartYear + 1, 5, 30)); // June 30

    // Prior FY is the year before
    const priorFYStart = new Date(Date.UTC(currentFYStartYear - 1, 6, 1)); // July 1 of prior year
    const priorFYEnd = new Date(Date.UTC(currentFYStartYear, 5, 30)); // June 30

    // We'll fetch from start of prior FY to today
    const fromDate = priorFYStart;
    const toDate = today;

    const fromDateStr = formatDate(fromDate);
    const toDateStr = formatDate(toDate);
    const priorFYStartStr = formatDate(priorFYStart);
    const priorFYEndStr = formatDate(priorFYEnd);
    const currentFYStartStr = formatDate(currentFYStart);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Today:', today.toISOString());
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Current FY Start Year:', currentFYStartYear);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Prior FY:', priorFYStartStr, 'to', priorFYEndStr);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Prior FY Start timestamp:', priorFYStart.getTime());
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Current FY Start timestamp:', currentFYStart.getTime());
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Current FY YTD:', currentFYStartStr, 'to', toDateStr);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Total date range:', fromDateStr, 'to', toDateStr);
    }

    // Track date filtering stats
    let skippedOldDates = 0;
    let priorFYCount = 0;
    let currentFYCount = 0;

    // Helper to determine which FY a date belongs to
    // Returns null if the date is outside our expected range (older than prior FY)
    const getPeriod = (dateStr: string): 'prior_fy' | 'current_fy' | null => {
      // Parse the date string and get UTC midnight for comparison
      // This handles both "2024-03-20" and "2024-03-20T00:00:00" formats
      const parts = dateStr.split('T')[0].split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // 0-indexed
      const day = parseInt(parts[2]);
      const dateUtc = Date.UTC(year, month, day);

      const priorFYStartUtc = priorFYStart.getTime();
      const currentFYStartUtc = currentFYStart.getTime();

      // Check if date is before prior FY start - this shouldn't happen but filter it out
      if (dateUtc < priorFYStartUtc) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Subscription Txns] SKIPPING: Transaction dated', dateStr, '(UTC:', new Date(dateUtc).toISOString(), ') is before prior FY start', priorFYStartStr);
        }
        skippedOldDates++;
        return null; // Exclude transactions older than prior FY
      }

      // Current FY: July 1, 2025 onwards
      if (dateUtc >= currentFYStartUtc) {
        currentFYCount++;
        return 'current_fy';
      }

      // Prior FY: July 1, 2024 to June 30, 2025
      priorFYCount++;
      return 'prior_fy';
    };

    // Helper to check if a transaction should be included
    const isValidDate = (dateStr: string): boolean => {
      return getPeriod(dateStr) !== null;
    };

    // Shared across every org — the crawl loop below appends to these, and the
    // vendor grouping in section 3 merges by vendorKey regardless of which org a
    // transaction came from.
    const accountNameMap = new Map<string, string>();
    const allTransactions: XeroTransaction[] = [];


    // Time budget. `export const maxDuration = 300` is the hard ceiling; crawling
    // orgs one after another multiplies the wall clock, so we stop before the
    // platform kills the request mid-flight and report the orgs we skipped. A
    // short, honest result beats a 504 that loses every org's work.
    const crawlStartedAt = Date.now();
    const CRAWL_BUDGET_MS = 225_000; // ~75s headroom for aggregation + backstop + response

    // ─────────────────────────────────────────────────────────────────────────
    // CRAWL EACH XERO ORG
    // Sequential rather than concurrent: it keeps each org's paced request
    // sequence intact and well inside Xero's per-tenant limits, and keeps this
    // long procedure readable. The pacing clock resets per org because the 60/min
    // limit is per tenant, so org 2 never waits on org 1's budget.
    // ─────────────────────────────────────────────────────────────────────────
    for (const connection of eligibleConnections) {
      const orgName = connection.tenant_name || 'Xero org';

      if (crawledTenantIds.length > 0 && Date.now() - crawlStartedAt > CRAWL_BUDGET_MS) {
        orgFailures.push({ org: orgName, reason: 'skipped_time_budget' });
        Sentry.captureMessage('[Subscription Txns] Crawl time budget exhausted — org skipped', {
          level: 'warning' as any,
          extra: { org: orgName, business_id, elapsedMs: Date.now() - crawlStartedAt },
        } as any);
        continue;
      }

      // Use Token Manager to get a valid access token for THIS org.
      // Token Manager handles locking, refresh, and coordination with other API calls.
      // A dead org must not abort the whole crawl — the healthy orgs' vendors are
      // still worth returning, and the failure is surfaced in the response.
      const tokenResult = await getValidAccessToken({ id: connection.id }, supabase);

      if (!tokenResult.success || !tokenResult.accessToken) {
        Sentry.captureException(
          tokenResult.error ?? new Error(tokenResult.message ?? 'Token Manager failed'),
          { tags: { route: 'Xero/subscription-transactions' }, extra: { context: 'Token Manager failed', message: tokenResult.message, org: orgName } } as any
        );
        orgFailures.push({ org: orgName, reason: tokenResult.shouldDeactivate ? 'requires_reconnect' : 'token_failed' });
        continue;
      }

      activeToken = tokenResult.accessToken;
      activeTenantId = connection.tenant_id;
      xeroLastCallAt = 0; // fresh per-tenant pacing budget

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Subscription Txns] ─── Crawling org "${orgName}" (${connection.tenant_id})`);
      }

      // Get account name mapping
      const accountsResponse = await fetch(
        'https://api.xero.com/api.xro/2.0/Accounts',
        {
          headers: {
            'Authorization': `Bearer ${activeToken}`,
            'xero-tenant-id': activeTenantId,
            'Accept': 'application/json'
          }
        }
      );

      if (!accountsResponse.ok) {
        const errorText = await accountsResponse.text();
        Sentry.captureMessage(`[Subscription Txns] Accounts fetch error status=${accountsResponse.status}`, { level: 'error' as any, extra: { errorText, org: orgName } } as any);
        orgFailures.push({ org: orgName, reason: `accounts_http_${accountsResponse.status}` });
        continue;
      }

      const accountsData = await accountsResponse.json();
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Subscription Txns] Got', accountsData.Accounts?.length || 0, 'accounts');
      }

      // A shared account CODE does not mean a shared account.
      //
      // Xero account codes are per-org, and sibling orgs drift: of the 74 codes
      // Dragon Roofing's two orgs share, 26 carry different names. Some are
      // cosmetic ("Entertainment (420)" vs "Entertainment") but others are simply
      // different accounts wearing the same number — 401 is "Accounting" in Dragon
      // Roofing and "Advertising" in Easy Hail; 402 is "Bad Debts expense" vs
      // "Marketing". Applying the operator's selected codes blindly to every org
      // would silently pull an unrelated account's spend into the forecast.
      //
      // So a code is crawled in an org only when that org's name for it matches the
      // canonical name (first org to define it). Divergences are reported rather
      // than quietly resolved either way — including the wrong account overstates,
      // excluding a real one understates, and the operator is the one who can tell
      // which it is. Excluded spend still reaches the forecast through the P&L
      // backstop's "Other / Unallocated Subscriptions" line, so no money is lost.
      const allowedCodes = new Set<string>();
      for (const acc of accountsData.Accounts || []) {
        if (!acc.Code) continue;
        const canonical = accountNameMap.get(acc.Code);
        if (canonical === undefined) {
          accountNameMap.set(acc.Code, acc.Name);
          allowedCodes.add(acc.Code);
          continue;
        }
        if (isSameAccount(canonical, acc.Name)) {
          allowedCodes.add(acc.Code);
        } else if (validAccountCodes.includes(acc.Code)) {
          accountNameConflicts.push({ code: acc.Code, org: orgName, name: acc.Name, expected: canonical });
        }
      }

      crawledTenantIds.push(connection.tenant_id);
      orgsAnalyzed.push(orgName);
      tokenByTenantId.set(connection.tenant_id, activeToken);

    // =====================================================
    // 1. FETCH ALL INVOICES (ACCPAY - supplier bills)
    // =====================================================
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Fetching invoices...');
    }

    let totalInvoicesFetched = 0;

    // Step 1: Collect all invoice IDs from paginated list
    const allInvoiceIds: string[] = [];
    let invoicePage = 1;
    let hasMoreInvoices = true;

    while (hasMoreInvoices) {
      // Use UTC methods since fromDate was created with Date.UTC()
      // URL encode the where clause to handle special characters (&&, ==, etc.)
      const whereClause = `Type=="ACCPAY"&&Date>=DateTime(${fromDate.getUTCFullYear()},${fromDate.getUTCMonth()+1},${fromDate.getUTCDate()})`;
      // order=Date DESC so the NEWEST (current-FY) bills page first. Without it,
      // Xero returns oldest-first and a high-bill tenant's current-FY bills (e.g.
      // an annual Asana bill, or monthly Capsule bills) fall past the page cap and
      // are silently dropped — the exact "FY YTD $0" symptom (JDS).
      const invoicesUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(whereClause)}&order=${encodeURIComponent('Date DESC')}&page=${invoicePage}`;

      const invoicesResponse = await xeroGet(invoicesUrl);
      if (!invoicesResponse) {
        // 429 retries exhausted — stop listing and process what we collected.
        break;
      }
      if (!invoicesResponse.ok) {
        const errorText = await invoicesResponse.text();
        Sentry.captureMessage(`[Subscription Txns] Invoice list fetch error status=${invoicesResponse.status}`, { level: 'error' as any, extra: { errorText } } as any);
        break;
      }

      const invoicesData = await invoicesResponse.json();
      const invoices = invoicesData.Invoices || [];

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Subscription Txns] Invoice page ${invoicePage}: ${invoices.length} invoices`);
      }

      if (invoices.length === 0) {
        hasMoreInvoices = false;
        break;
      }

      // Collect invoice IDs
      for (const invoice of invoices) {
        allInvoiceIds.push(invoice.InvoiceID);
      }

      invoicePage++;

      // Safety limit - max 50 pages (5000 invoices), matching the bank-txn loop.
      // With order=Date DESC the newest bills are kept first, so even if a very
      // high-volume tenant exceeds this, only the OLDEST prior-FY bills are
      // dropped — and the P&L backstop below reconciles any remaining shortfall.
      if (invoicePage > 50) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Subscription Txns] Reached invoice page limit (50 pages / 5000 invoices)');
        }
        break;
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Subscription Txns] Collected ${allInvoiceIds.length} invoice IDs`);
    }

    // Step 2: Batch fetch invoices with line items (50 at a time)
    const BATCH_SIZE = 50;
    for (let i = 0; i < allInvoiceIds.length; i += BATCH_SIZE) {
      const batchIds = allInvoiceIds.slice(i, i + BATCH_SIZE);
      const idsParam = batchIds.join(',');

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Subscription Txns] Fetching batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(allInvoiceIds.length/BATCH_SIZE)} (${batchIds.length} invoices)`);
      }

      // xeroGet paces (<=60/min) and retries 429s until they clear, so we no
      // longer need a manual delay or a duplicated retry-and-process branch — a
      // throttled batch is retried in place rather than skipped (which is what
      // previously dropped current-FY bills for high-volume tenants).
      const batchResponse = await xeroGet(`https://api.xero.com/api.xro/2.0/Invoices?IDs=${idsParam}`);

      if (!batchResponse || !batchResponse.ok) {
        if (batchResponse) {
          const errorText = await batchResponse.text();
          Sentry.captureMessage(`[Subscription Txns] Batch fetch error status=${batchResponse.status}`, { level: 'error' as any, extra: { errorText } } as any);
        }
        continue;
      }

      const batchData = await batchResponse.json();

      // Process all invoices in the batch
      for (const fullInvoice of batchData.Invoices || []) {
        if (fullInvoice?.LineItems) {
          const invoiceDate = parseXeroDate(fullInvoice.Date);
          const dateStr = invoiceDate ? formatDate(invoiceDate) : '';
          const period = getPeriod(dateStr);

          // Skip transactions outside our FY range
          if (!period) continue;

          for (const line of fullInvoice.LineItems) {
            if (validAccountCodes.includes(line.AccountCode) && allowedCodes.has(line.AccountCode)) {
              const contactName = fullInvoice.Contact?.Name || '';
              const vendorName = extractVendorName(contactName, line.Description || '');

              const rawAmount = line.LineAmount || 0;
              const isCredit = rawAmount < 0;

              // For expense accounts, positive = expense, negative = credit/refund
              // We keep the sign to properly calculate net expense
              allTransactions.push({
                tenantId: activeTenantId,
                id: `inv-${fullInvoice.InvoiceID}-${line.LineItemID || Math.random()}`,
                date: dateStr,
                vendor: vendorName,
                description: line.Description || contactName,
                amount: rawAmount,  // Keep original sign for proper netting
                rawAmount: rawAmount,
                accountCode: line.AccountCode,
                accountName: accountNameMap.get(line.AccountCode) || line.AccountCode,
                source: 'invoice',
                reference: fullInvoice.InvoiceNumber || '',
                period,
                isCredit,
              });
              totalInvoicesFetched++;

              if (isCredit) {
                if (process.env.NODE_ENV !== 'production') {
                  console.log(`[Subscription Txns] CREDIT FOUND (invoice): ${vendorName} ${dateStr} ${rawAmount}`);
                }
              }
            }
          }
        }
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Total invoice transactions:', totalInvoicesFetched);
    }

    // =====================================================
    // 2. FETCH ALL BANK TRANSACTIONS (credit card, DD)
    // =====================================================
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Fetching bank transactions...');
    }

    let bankPage = 1;
    let hasMoreBank = true;
    let totalBankFetched = 0;

    while (hasMoreBank) {
      // Use UTC methods since fromDate was created with Date.UTC()
      // URL encode the where clause to handle special characters (&&, ==, etc.)
      const bankWhereClause = `Date>=DateTime(${fromDate.getUTCFullYear()},${fromDate.getUTCMonth()+1},${fromDate.getUTCDate()})&&Type=="SPEND"`;
      // order=Date DESC so the newest (current-FY) lines page first — parity with
      // the invoice loop. xeroGet paces (<=60/min) and retries 429s, so no page
      // is dropped.
      const bankUrl = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(bankWhereClause)}&order=${encodeURIComponent('Date DESC')}&page=${bankPage}`;

      const bankResponse = await xeroGet(bankUrl);

      if (!bankResponse || !bankResponse.ok) {
        if (bankResponse) {
          const errorText = await bankResponse.text();
          Sentry.captureMessage(`[Subscription Txns] Bank transaction fetch error status=${bankResponse.status}`, { level: 'error' as any, extra: { errorText } } as any);
        }
        break;
      }

      const bankData = await bankResponse.json();
      const bankTxns = bankData.BankTransactions || [];

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Subscription Txns] Bank page ${bankPage}: ${bankTxns.length} transactions`);
      }

      if (bankTxns.length === 0) {
        hasMoreBank = false;
        break;
      }

      // Process transactions - no delay needed, just processing response data
      for (const txn of bankTxns) {
        const txnDate = parseXeroDate(txn.Date);
        const dateStr = txnDate ? formatDate(txnDate) : '';
        const period = getPeriod(dateStr);

        // Skip transactions outside our FY range
        if (!period) continue;

        // Check line items for matching account codes
        for (const line of txn.LineItems || []) {
          if (validAccountCodes.includes(line.AccountCode) && allowedCodes.has(line.AccountCode)) {
            const contactName = txn.Contact?.Name || '';
            const vendorName = extractVendorName(contactName, line.Description || txn.Reference || '');

            const rawAmount = line.LineAmount || 0;
            const isCredit = rawAmount < 0;

            // For expense accounts, positive = expense, negative = credit/refund
            // We keep the sign to properly calculate net expense
            allTransactions.push({
              tenantId: activeTenantId,
              id: `bank-${txn.BankTransactionID}-${line.LineItemID || Math.random()}`,
              date: dateStr,
              vendor: vendorName,
              description: line.Description || txn.Reference || contactName,
              amount: rawAmount,  // Keep original sign for proper netting
              rawAmount: rawAmount,
              accountCode: line.AccountCode,
              accountName: accountNameMap.get(line.AccountCode) || line.AccountCode,
              source: 'bank',
              reference: txn.Reference || '',
              period,
              isCredit,
            });
            totalBankFetched++;

            if (isCredit) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[Subscription Txns] CREDIT FOUND (bank): ${vendorName} ${dateStr} ${rawAmount}`);
              }
            }
          }
        }
      }

      bankPage++;

      // Safety limit - increased to 50 pages (5000 transactions) to ensure complete data
      if (bankPage > 50) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Subscription Txns] Reached bank page limit (50 pages)');
        }
        break;
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Total bank transactions:', totalBankFetched);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] TOTAL transactions found:', allTransactions.length);
    }

    } // ─── end per-org crawl loop ───

    // Every org failed — there is nothing to analyse, so say so rather than
    // returning an empty vendor list that reads as "this business has no subscriptions".
    if (crawledTenantIds.length === 0) {
      const requiresReconnect = orgFailures.some(f => f.reason === 'requires_reconnect');
      return NextResponse.json(
        {
          error: requiresReconnect
            ? 'Xero connection expired. Please reconnect Xero.'
            : 'Failed to fetch subscription data from Xero',
          requiresReconnect,
          orgFailures,
        },
        { status: requiresReconnect ? 401 : 502 }
      );
    }

    // Calculate credit/debit breakdown for debugging
    const creditTransactions = allTransactions.filter(t => t.isCredit);
    const debitTransactions = allTransactions.filter(t => !t.isCredit);
    const totalCredits = creditTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalDebits = debitTransactions.reduce((sum, t) => sum + t.amount, 0);
    const netTotal = totalDebits + totalCredits; // Credits are negative, so this is net

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] AMOUNT BREAKDOWN:');
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Debit transactions (expenses): ${debitTransactions.length} totaling ${totalDebits.toFixed(2)}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Credit transactions (refunds): ${creditTransactions.length} totaling ${totalCredits.toFixed(2)}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - NET TOTAL: ${netTotal.toFixed(2)}`);
    }

    if (creditTransactions.length > 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Subscription Txns] Credit transactions detail:');
      }
      creditTransactions.forEach(t => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`    ${t.date} | ${t.vendor} | ${t.amount} | ${t.description?.substring(0, 50)}`);
        }
      });
    }

    // =====================================================
    // 3. GROUP BY VENDOR
    // =====================================================
    const vendorMap = new Map<string, VendorSummary>();

    for (const tx of allTransactions) {
      const vendorKey = createVendorKey(tx.vendor);

      if (!vendorMap.has(vendorKey)) {
        vendorMap.set(vendorKey, {
          vendorName: tx.vendor,
          vendorKey,
          transactions: [],
          priorFYAmount: 0,
          priorFYCount: 0,
          currentFYAmount: 0,
          currentFYCount: 0,
          totalAmount: 0,
          transactionCount: 0,
          avgAmount: 0,
          suggestedFrequency: 'ad-hoc',
          confidence: 'low',
          firstTransaction: tx.date,
          lastTransaction: tx.date,
          monthsSpan: 0,
          suggestedMonthlyBudget: 0,
          // Per-vendor account codes — accumulated below from the actual
          // transactions of this vendor (a Set deduplicates; Array.from
          // serializes for the response).
          accountCodes: [],
          // Phase 63: set below if detectFrequency() flags this as annual.
          renewalMonth: null,
          // Phase 64: accumulated below from each transaction's accountCode +
          // amount so the sidebar can attribute the vendor's spend to each
          // account exactly (no double-counting for multi-account vendors).
          accountSplits: {},
          // Dossier defaults — overwritten by deriveVendorFromTransactions in
          // section 4; these only survive for a vendor with zero transactions,
          // which the derivation also treats as a one-off.
          status: 'one-off',
          stoppedMonth: null,
          lastPaymentAmount: 0,
          daysSinceLastPayment: null,
          priorYearTwin: false,
          fyAverageMonthly: 0,
        });
      }

      const vendor = vendorMap.get(vendorKey)!;
      vendor.transactions.push(tx);
      vendor.totalAmount += tx.amount;
      vendor.transactionCount++;

      // Track this vendor's account codes (distinct set across its txs).
      // Step 5 sidebar uses this to attribute per-account totals — without
      // it, every vendor would carry the full selected-account list and
      // the sidebar would show the same total for every account.
      if (tx.accountCode && !vendor.accountCodes.includes(tx.accountCode)) {
        vendor.accountCodes.push(tx.accountCode);
      }

      // Phase 64: per-account amount accumulation. Only count prior-FY
      // transactions in the split (sidebar shows annualized spend; current-FY
      // YTD is partial and would skew the picture). For a vendor whose
      // transactions span multiple accounts, this gives the sidebar an
      // EXACT distribution instead of the "attribute full amount to each
      // account" double-count.
      if (tx.accountCode && tx.period === 'prior_fy') {
        vendor.accountSplits[tx.accountCode] = (vendor.accountSplits[tx.accountCode] || 0) + tx.amount;
      }

      // Track by FY period
      if (tx.period === 'prior_fy') {
        vendor.priorFYAmount += tx.amount;
        vendor.priorFYCount++;
      } else {
        vendor.currentFYAmount += tx.amount;
        vendor.currentFYCount++;
      }

      // Track date range
      if (tx.date < vendor.firstTransaction) {
        vendor.firstTransaction = tx.date;
      }
      if (tx.date > vendor.lastTransaction) {
        vendor.lastTransaction = tx.date;
      }
    }

    // =====================================================
    // 4. CALCULATE SUMMARIES FOR EACH VENDOR
    // =====================================================
    const vendors: VendorSummary[] = [];

    for (const vendor of vendorMap.values()) {
      // Calculate average amount
      vendor.avgAmount = vendor.totalAmount / vendor.transactionCount;

      // Calculate months span
      const first = new Date(vendor.firstTransaction);
      const last = new Date(vendor.lastTransaction);
      vendor.monthsSpan = Math.max(1, Math.ceil(
        (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30)
      ));

      // Detect frequency and size the budget PER XERO ORG, then sum — see
      // `deriveVendorFromTransactions` for why pooling multi-org streams
      // under-states both. Phase 63 renewal month comes from the dominant org.
      const derived = deriveVendorFromTransactions(vendor.transactions, toDateStr);
      vendor.suggestedFrequency = derived.suggestedFrequency;
      vendor.confidence = derived.confidence;
      vendor.renewalMonth = derived.renewalMonth;
      vendor.suggestedMonthlyBudget = derived.suggestedMonthlyBudget;
      vendor.fyAverageMonthly = derived.fyAverageMonthly;
      vendor.status = derived.dossier.status;
      vendor.stoppedMonth = derived.dossier.stoppedMonth;
      vendor.lastPaymentAmount = derived.dossier.lastPaymentAmount;
      vendor.daysSinceLastPayment = derived.dossier.daysSinceLastPayment;
      vendor.priorYearTwin = derived.dossier.priorYearTwin;

      // Sort transactions by date (newest first)
      vendor.transactions.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      vendors.push(vendor);
    }

    // Sort vendors by total amount (highest first)
    vendors.sort((a, b) => b.totalAmount - a.totalAmount);

    // ── Phase 2 (18 Aug 2026): persist vendor × month actuals ──
    // This crawl just computed per-vendor monthly actuals across ~24 months and
    // used to throw them away, which is why the monthly report had to re-crawl
    // Xero live on every render and no price-creep HISTORY existed anywhere.
    // Fire-and-forget against the response (the wizard doesn't need it), but
    // NEVER silent on failure — house rule: every swallowed write failure gets
    // a Sentry capture with an invariant tag.
    //
    // business_id from the request can be in EITHER id-space (the #1 recurring
    // incident class); the table FKs businesses(id), so resolve to canonical.
    try {
      const ids = await resolveBusinessProfileIds(supabase, business_id);
      const actualRows = vendors.flatMap(v =>
        aggregateVendorMonthActuals(
          ids.businessId,
          v.vendorKey,
          v.vendorName,
          (v.transactions || []).map((t: any) => ({
            date: t.date,
            amount: t.amount,
            tenantId: t.tenantId,
          })),
          'analyze',
        ),
      );
      if (actualRows.length > 0) {
        const { error: actualsError } = await supabase
          .from('subscription_vendor_actuals')
          .upsert(
            actualRows.map(r => ({ ...r, updated_at: new Date().toISOString() })),
            { onConflict: 'business_id,tenant_id,vendor_key,month' },
          );
        if (actualsError) {
          Sentry.captureMessage(
            `[Subscription Txns] vendor-actuals persist failed: ${actualsError.message}`,
            { level: 'warning' as any, tags: { invariant: 'subscription-actuals-persist' }, extra: { business_id, rows: actualRows.length } } as any,
          );
        }
      }
    } catch (persistErr) {
      Sentry.captureException(persistErr, {
        tags: { invariant: 'subscription-actuals-persist' },
        extra: { context: '[Subscription Txns] vendor-actuals persist threw', business_id },
      } as any);
    }

    // =====================================================
    // 4b. P&L BACKSTOP (Layer 1) — reconcile to the synced xero_pl_lines P&L
    // =====================================================
    // The live transaction crawl above only sees ACCPAY bills + SPEND bank txns
    // on the selected accounts. Spend that settles through Accounts Payable in
    // other shapes (AP payments, or bills past the page cap) can be missed,
    // producing a silently-low FY-YTD. To GUARANTEE the FY-YTD total can never
    // read below the authoritative P&L, compare the captured vendor spend to the
    // already-synced xero_pl_lines account totals and surface any shortfall as an
    // explicit "Other / Unallocated Subscriptions" line. Dual-ID resolved:
    // subscription data is businesses.id-keyed but xero_pl_lines is
    // business_profiles.id-keyed.
    try {
      const monthKey = (y: number, m1: number) => `${y}-${String(m1).padStart(2, '0')}`;

      // Current FY months: July (currentFYStartYear) .. current month (YTD).
      const currentFYMonths: string[] = [];
      {
        let y = currentFYStartYear, m = 7;
        const endY = today.getUTCFullYear(), endM = today.getUTCMonth() + 1;
        while ((y < endY || (y === endY && m <= endM)) && currentFYMonths.length < 13) {
          currentFYMonths.push(monthKey(y, m));
          m++; if (m > 12) { m = 1; y++; }
        }
      }
      // Prior FY months: July (currentFYStartYear-1) .. June (currentFYStartYear).
      const priorFYMonths: string[] = [];
      for (let i = 0; i < 12; i++) {
        let m = 7 + i, y = currentFYStartYear - 1;
        if (m > 12) { m -= 12; y++; }
        priorFYMonths.push(monthKey(y, m));
      }

      if (validAccountCodes.length > 0) {
        const ids = await resolveBusinessProfileIds(supabase, business_id);
        // Scope to EXACTLY the orgs the crawl actually read — no more, no less.
        // Both directions matter: including an org we did not crawl fabricates a
        // phantom gap, and excluding one we did crawl hides a real one. This was
        // previously pinned to a single tenant, which is why the backstop stayed
        // silent while an entire org's subscription spend was missing (it compared
        // Easy Hail's captured vendors against Easy Hail's P&L and found no gap).
        // An org skipped for time or a dead token is correctly left out here — its
        // absence is reported via orgFailures instead.
        // Match on stable account_code (not renameable names) and accrual basis
        // only (avoid summing cash + accrual rows twice).
        const { data: plRows } = await supabase
          .from('xero_pl_lines_wide_compat')
          .select('monthly_values, tenant_id')
          .in('business_id', ids.all)
          .in('tenant_id', crawledTenantIds)
          .eq('basis', 'accruals')
          .in('account_code', validAccountCodes);

        // Sum SIGNED monthly values — expenses are positive and credits net
        // within the period, the SAME basis as the captured vendor amounts
        // (LineAmount, signed). Summing abs() per month while the captured side
        // nets credits would invent a phantom gap when a month is net-negative.
        // Clamp a net-negative period total to 0 (a genuine net-credit account is
        // not "missed spend").
        //
        // Gaps are computed PER ORG and only positive ones are summed. Comparing
        // one global P&L total against one global captured total lets orgs cancel
        // each other out: if org B's mirror rows are missing or stale its P&L reads
        // 0 while its captured spend is real, and that surplus silently absorbs a
        // genuine shortfall in org A — the backstop would go quiet on exactly the
        // under-reporting it exists to catch.
        const plByTenant = new Map<string, { current: number; prior: number }>();
        for (const row of (plRows || [])) {
          const mv = (row.monthly_values || {}) as Record<string, number>;
          const t = (row as any).tenant_id as string;
          const acc = plByTenant.get(t) || { current: 0, prior: 0 };
          for (const k of currentFYMonths) acc.current += Number(mv[k]) || 0;
          for (const k of priorFYMonths) acc.prior += Number(mv[k]) || 0;
          plByTenant.set(t, acc);
        }

        const round2 = (n: number) => Math.round(n * 100) / 100;
        const capturedByTenant = new Map<string, { current: number; prior: number }>();
        for (const v of vendors) {
          for (const tx of v.transactions) {
            const acc = capturedByTenant.get(tx.tenantId) || { current: 0, prior: 0 };
            if (tx.period === 'prior_fy') acc.prior += tx.amount;
            else acc.current += tx.amount;
            capturedByTenant.set(tx.tenantId, acc);
          }
        }

        // Per-org materiality: a $10 threshold applied to the SUM would let three
        // orgs' benign $8 timing differences accumulate into a fabricated $24 line.
        const MATERIALITY = 10;
        let currentGap = 0, priorGap = 0;
        let overCountCurrent = 0, overCountPrior = 0;
        let plCurrent = 0, plPrior = 0;
        for (const tenantId of crawledTenantIds) {
          const pl = plByTenant.get(tenantId) || { current: 0, prior: 0 };
          const cap = capturedByTenant.get(tenantId) || { current: 0, prior: 0 };
          const tPlCurrent = Math.max(0, pl.current);
          const tPlPrior = Math.max(0, pl.prior);
          plCurrent += tPlCurrent;
          plPrior += tPlPrior;

          const gc = round2(tPlCurrent - cap.current);
          const gp = round2(tPlPrior - cap.prior);
          if (gc > MATERIALITY) currentGap += gc;
          if (gp > MATERIALITY) priorGap += gp;
          if (gc < -MATERIALITY) overCountCurrent += gc;
          if (gp < -MATERIALITY) overCountPrior += gp;
        }
        currentGap = round2(currentGap);
        priorGap = round2(priorGap);

        // Observability: an OVER-count (captured materially above P&L) yields no
        // "Other" line, but flag it — it can signal a future double-count.
        if (process.env.NODE_ENV !== 'production' && (overCountCurrent < 0 || overCountPrior < 0)) {
          console.warn(`[Subscription Txns] P&L backstop: captured EXCEEDS P&L (current=${overCountCurrent}, prior=${overCountPrior}) — possible double-count`);
        }

        // Surface the shortfall — already filtered to material per-org gaps above.
        if (currentGap > 0 || priorGap > 0) {
          const otherCurrent = Math.max(0, currentGap);
          const otherPrior = Math.max(0, priorGap);
          const otherName = 'Other / Unallocated Subscriptions';
          vendors.push({
            vendorName: otherName,
            vendorKey: createVendorKey(otherName),
            transactions: [],
            priorFYAmount: otherPrior,
            priorFYCount: 0,
            currentFYAmount: otherCurrent,
            currentFYCount: 0,
            totalAmount: round2(otherPrior + otherCurrent),
            transactionCount: 0,
            avgAmount: 0,
            suggestedFrequency: 'monthly',
            confidence: 'low',
            firstTransaction: priorFYStartStr,
            lastTransaction: toDateStr,
            monthsSpan: 12,
            // Annualise the prior-FY shortfall (or current-FY if no prior) as a
            // monthly budget hint so it carries into the forecast.
            suggestedMonthlyBudget: round2((otherPrior || otherCurrent) / 12),
            // Synthetic line — there is no payment stream to build a dossier
            // from. 'active' keeps it included by default: it represents real
            // P&L spend the vendor capture missed, and dropping it would
            // silently understate the subscription budget.
            status: 'active',
            stoppedMonth: null,
            lastPaymentAmount: 0,
            daysSinceLastPayment: null,
            priorYearTwin: false,
            fyAverageMonthly: round2((otherPrior || otherCurrent) / 12),
            // MUST be empty: a dollar-gap-only line. Claiming the selected
            // accounts here makes the wizard treat those accounts as fully
            // covered and silently drop real OpEx lines that share them.
            accountCodes: [],
            renewalMonth: null,
            accountSplits: {},
          });
          vendors.sort((a, b) => b.totalAmount - a.totalAmount);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Subscription Txns] P&L backstop: added "Other" line — currentGap=$${otherCurrent}, priorGap=$${otherPrior} (P&L current=$${round2(plCurrent)} across ${crawledTenantIds.length} org(s))`);
          }
        }
      }
    } catch (backstopErr) {
      Sentry.captureException(backstopErr, { tags: { route: 'Xero/subscription-transactions' }, extra: { context: '[Subscription Txns] P&L backstop failed' } } as any);
    }

    // =====================================================
    // 5. CALCULATE TOTALS FOR RECONCILIATION
    // =====================================================
    const totalAnalyzed = vendors.reduce((sum, v) => sum + v.totalAmount, 0);
    const totalMonthlyBudget = vendors.reduce((sum, v) => sum + v.suggestedMonthlyBudget, 0);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Analysis complete:');
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Vendors found: ${vendors.length}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Total analyzed: $${totalAnalyzed.toFixed(2)}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Suggested monthly budget: $${totalMonthlyBudget.toFixed(2)}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Date filtering stats:');
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Prior FY transactions: ${priorFYCount}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Current FY transactions: ${currentFYCount}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  - Skipped (older than prior FY): ${skippedOldDates}`);
    }

    // Calculate FY totals for summary
    const priorFYTotal = vendors.reduce((sum, v) => sum + v.priorFYAmount, 0);
    const currentFYTotal = vendors.reduce((sum, v) => sum + v.currentFYAmount, 0);

    // Log Prior FY transactions by month for verification
    const priorFYTransactions = allTransactions.filter(t => t.period === 'prior_fy');
    const priorFYByMonth: Record<string, { count: number; total: number }> = {};
    for (const t of priorFYTransactions) {
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!priorFYByMonth[month]) {
        priorFYByMonth[month] = { count: 0, total: 0 };
      }
      priorFYByMonth[month].count++;
      priorFYByMonth[month].total += t.amount;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] PRIOR FY BREAKDOWN BY MONTH:');
    }
    const sortedMonths = Object.keys(priorFYByMonth).sort();
    for (const month of sortedMonths) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`  ${month}: ${priorFYByMonth[month].count} txns = $${priorFYByMonth[month].total.toFixed(2)}`);
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  TOTAL: ${priorFYTransactions.length} txns = $${priorFYTotal.toFixed(2)}`);
    }

    // =====================================================
    // 6. FETCH ACTUAL P&L BALANCES FOR RECONCILIATION
    // =====================================================
    // This fetches the ACTUAL account balance from Xero's P&L Report
    // to verify our transaction analysis is complete and accurate
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Fetching P&L Report for reconciliation...');
    }

    let reconciliation = {
      priorFY: {
        analyzed: Math.round(priorFYTotal * 100) / 100,
        actual: null as number | null,
        variance: null as number | null,
        variancePercent: null as number | null,
        isReconciled: false,
      },
      currentFY: {
        analyzed: Math.round(currentFYTotal * 100) / 100,
        actual: null as number | null,
        variance: null as number | null,
        variancePercent: null as number | null,
        isReconciled: false,
      },
    };

    try {
      // First, get the Xero AccountID (GUID) for our account codes
      // The P&L Report uses GUIDs, not account codes
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Subscription Txns] Looking up Account GUIDs for codes:', validAccountCodes);
      }

      const accountGUIDs: string[] = [];
      const accountNames: string[] = [];

      for (const code of validAccountCodes) {
        // Find this account in our accounts data
        const accountName = accountNameMap.get(code);
        if (accountName) {
          accountNames.push(accountName);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Subscription Txns] Account ${code} = "${accountName}"`);
          }
        }
      }

      /**
       * Sum a P&L window across EVERY crawled org.
       *
       * The captured vendor totals now span all orgs, so the figure they are
       * reconciled against must too — comparing a multi-org capture to one org's
       * P&L would report a huge false variance. Returns null only when no org
       * yielded a balance (the pre-existing "couldn't reconcile" signal); an org
       * that simply has no spend on these accounts contributes 0.
       */
      const fetchPLTotalAcrossOrgs = async (fromStr: string, toStr: string, label: string) => {
        const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromStr}&toDate=${toStr}&standardLayout=true`;
        let total: number | null = null;

        for (const tenantId of crawledTenantIds) {
          const token = tokenByTenantId.get(tenantId);
          if (!token) continue;
          try {
            const res = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'xero-tenant-id': tenantId,
                'Accept': 'application/json'
              }
            });
            if (!res.ok) {
              const errorText = await res.text();
              Sentry.captureMessage(`[Subscription Txns] ${label} P&L fetch failed status=${res.status}`, { level: 'error' as any, extra: { errorText, tenantId } } as any);
              continue;
            }
            const data = await res.json();
            const balance = extractAccountBalanceByName(data, accountNames);
            if (balance !== null) total = (total ?? 0) + balance;
          } catch (plErr) {
            Sentry.captureException(plErr, { tags: { route: 'Xero/subscription-transactions' }, extra: { context: `${label} P&L fetch threw`, tenantId } } as any);
          }
        }
        return total;
      };

      {
        const priorActual = await fetchPLTotalAcrossOrgs(priorFYStartStr, priorFYEndStr, 'Prior FY');
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Subscription Txns] Prior FY P&L actual balance (all orgs):', priorActual);
        }

        if (priorActual !== null) {
          reconciliation.priorFY.actual = Math.round(priorActual * 100) / 100;
          reconciliation.priorFY.variance = Math.round((priorFYTotal - priorActual) * 100) / 100;
          reconciliation.priorFY.variancePercent = priorActual > 0
            ? Math.round(((priorFYTotal - priorActual) / priorActual) * 10000) / 100
            : 0;
          reconciliation.priorFY.isReconciled =
            Math.abs(reconciliation.priorFY.variance) < 100 ||
            Math.abs(reconciliation.priorFY.variancePercent || 0) < 1;
        }
      }

      // Current FY YTD P&L, same all-orgs sum
      {
        const currentActual = await fetchPLTotalAcrossOrgs(currentFYStartStr, toDateStr, 'Current FY');
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Subscription Txns] Current FY P&L actual balance (all orgs):', currentActual);
        }

        if (currentActual !== null) {
          reconciliation.currentFY.actual = Math.round(currentActual * 100) / 100;
          reconciliation.currentFY.variance = Math.round((currentFYTotal - currentActual) * 100) / 100;
          reconciliation.currentFY.variancePercent = currentActual > 0
            ? Math.round(((currentFYTotal - currentActual) / currentActual) * 10000) / 100
            : 0;
          reconciliation.currentFY.isReconciled =
            Math.abs(reconciliation.currentFY.variance) < 100 ||
            Math.abs(reconciliation.currentFY.variancePercent || 0) < 1;
        }
      }
    } catch (reconcileError) {
      Sentry.captureException(reconcileError, { tags: { route: 'Xero/subscription-transactions' }, extra: { context: "[Subscription Txns] Reconciliation error" } } as any);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Subscription Txns] Reconciliation results:', reconciliation);
    }

    return NextResponse.json({
      success: true,
      vendors: vendors.map(v => ({
        vendorName: v.vendorName,
        vendorKey: v.vendorKey,
        suggestedFrequency: v.suggestedFrequency,
        confidence: v.confidence,
        totalAmount: Math.round(v.totalAmount * 100) / 100,
        avgAmount: Math.round(v.avgAmount * 100) / 100,
        transactionCount: v.transactionCount,
        // FY breakdown
        priorFYAmount: Math.round(v.priorFYAmount * 100) / 100,
        priorFYCount: v.priorFYCount,
        currentFYAmount: Math.round(v.currentFYAmount * 100) / 100,
        currentFYCount: v.currentFYCount,
        firstTransaction: v.firstTransaction,
        lastTransaction: v.lastTransaction,
        monthsSpan: v.monthsSpan,
        suggestedMonthlyBudget: Math.round(v.suggestedMonthlyBudget * 100) / 100,
        // Per-vendor account codes derived from this vendor's actual
        // transactions (NOT the full selected-account list). The Step 5
        // sidebar uses this to attribute per-account totals correctly.
        accountCodes: v.accountCodes,
        // Phase 63: renewal calendar month (1-12) for annual subs only.
        renewalMonth: v.renewalMonth,
        // Phase 64: per-account prior-FY $ amount keyed by accountCode. The
        // sidebar uses this to attribute the vendor's spend exactly across
        // accounts (avoids double-counting multi-account vendors).
        accountSplits: Object.fromEntries(
          Object.entries(v.accountSplits).map(([k, n]) => [k, Math.round((n as number) * 100) / 100]),
        ),
        // Include ALL transactions for review
        transactions: v.transactions.map(t => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          source: t.source,
          period: t.period,
        })),
      })),
      summary: {
        totalVendors: vendors.length,
        totalTransactions: allTransactions.length,
        totalAmount: Math.round(totalAnalyzed * 100) / 100,
        // FY breakdown totals
        priorFYTotal: Math.round(priorFYTotal * 100) / 100,
        currentFYTotal: Math.round(currentFYTotal * 100) / 100,
        suggestedMonthlyTotal: Math.round(totalMonthlyBudget * 100) / 100,
        suggestedAnnualTotal: Math.round(totalMonthlyBudget * 12 * 100) / 100,
        dateRange: {
          from: fromDateStr,
          to: toDateStr,
          priorFY: {
            from: priorFYStartStr,
            to: priorFYEndStr,
          },
          currentFY: {
            from: currentFYStartStr,
            to: toDateStr,
          },
        },
        accountsAnalyzed: validAccountCodes,
        // Which Xero orgs this analysis actually covers. A multi-org business must
        // never be shown a one-org result as if it were the whole picture, so the
        // orgs read and the orgs missed are both stated explicitly.
        orgsAnalyzed,
        orgsTotal: connections.length,
        orgFailures,
        accountNameConflicts,
        // P&L Reconciliation - compare our analysis to actual Xero P&L balance
        reconciliation,
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'Xero/subscription-transactions' }, extra: { context: "[Subscription Txns] Error" } } as any);
    return NextResponse.json({ error: 'Failed to analyze subscriptions' }, { status: 500 });
  }
}

export const POST = withSchema('Xero/subscription-transactions', SubscriptionTransactionsPostSchema, postHandler);
