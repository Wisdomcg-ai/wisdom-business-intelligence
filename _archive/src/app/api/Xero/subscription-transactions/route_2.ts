/**
 * Subscription Transactions API
 * Fetches ALL transactions from Xero for selected expense accounts
 * Includes both Invoices (ACCPAY) and Bank Transactions (credit card/direct debit)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/xero/token-manager';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
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
}

// Common vendor name mappings for normalization
const VENDOR_MAPPINGS: Record<string, string> = {
  'SLACK': 'Slack',
  'XERO': 'Xero',
  'GOOGLE': 'Google Workspace',
  'GSUITE': 'Google Workspace',
  'G SUITE': 'Google Workspace',
  'MSFT': 'Microsoft 365',
  'MICROSOFT': 'Microsoft 365',
  'CANVA': 'Canva',
  'HUBSPOT': 'HubSpot',
  'ASANA': 'Asana',
  'MONDAY': 'Monday.com',
  'NOTION': 'Notion',
  'FIGMA': 'Figma',
  'ADOBE': 'Adobe',
  'DROPBOX': 'Dropbox',
  'ZOOM': 'Zoom',
  'ATLASSIAN': 'Atlassian',
  'GITHUB': 'GitHub',
  'AWS': 'Amazon Web Services',
  'AMAZON WEB': 'Amazon Web Services',
  'AZURE': 'Microsoft Azure',
  'DIGITALOCEAN': 'DigitalOcean',
  'MAILCHIMP': 'Mailchimp',
  'INTERCOM': 'Intercom',
  'ZENDESK': 'Zendesk',
  'STRIPE': 'Stripe',
  'SHOPIFY': 'Shopify',
  'QUICKBOOKS': 'QuickBooks',
  'GUSTO': 'Gusto',
  'DEPUTY': 'Deputy',
  'EMPLOYMENT HERO': 'Employment Hero',
  'DOCUSIGN': 'DocuSign',
  'CALENDLY': 'Calendly',
  'LOOM': 'Loom',
  'MIRO': 'Miro',
  'AIRTABLE': 'Airtable',
  'GRAMMARLY': 'Grammarly',
  'LASTPASS': 'LastPass',
  '1PASSWORD': '1Password',
  'CLOUDFLARE': 'Cloudflare',
  'VERCEL': 'Vercel',
  'NETLIFY': 'Netlify',
  'TWILIO': 'Twilio',
  'SENDGRID': 'SendGrid',
  'MIXPANEL': 'Mixpanel',
  'HOTJAR': 'Hotjar',
  'LINKEDIN': 'LinkedIn',
  'SEEK': 'SEEK',
  'OPENAI': 'OpenAI',
  'CHATGPT': 'ChatGPT',
  'ANTHROPIC': 'Anthropic',
  'CLAUDE': 'Anthropic Claude',
  'ZAPIER': 'Zapier',
  'CALXA': 'Calxa',
  'LUCID': 'Lucid Software',
  'LUCIDCHART': 'Lucid Software',
  'SYNC': 'Sync.com',
  'TELSTRA': 'Telstra',
  'VIMEO': 'Vimeo',
  'PLAUD': 'Plaud.ai',
  'FIREFLIES': 'Fireflies.ai',
  'AUDIBLE': 'Audible',
  'PADDLE': 'Paddle',
  'PADDLENET': 'Paddle',
  'CMM': 'CMM',
  'SITESATSCALE': 'Sites at Scale',
  'APPLE': 'Apple',
  'APPLE.COM': 'Apple',
};

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

function extractVendorName(contactName: string, description: string): string {
  const text = (contactName || description || '').toUpperCase().trim();

  // Remove common transaction prefixes
  let cleaned = text.replace(/^(DIRECT DEBIT|DD|PAYPAL \*|PAY\*|SQ \*|STRIPE|RECURRING|SUBSCRIPTION|PAYMENT TO|PAID TO|TRANSFER TO)\s*/i, '');

  // Try to match known vendors first
  for (const [pattern, vendorName] of Object.entries(VENDOR_MAPPINGS)) {
    if (cleaned.includes(pattern.toUpperCase())) {
      return vendorName;
    }
  }

  // Also check description if contact didn't match
  if (contactName && description && contactName !== description) {
    const descCleaned = description.toUpperCase().trim();
    for (const [pattern, vendorName] of Object.entries(VENDOR_MAPPINGS)) {
      if (descCleaned.includes(pattern.toUpperCase())) {
        return vendorName;
      }
    }
  }

  // Clean up and return the original contact/description
  if (contactName && contactName.trim()) {
    // Capitalize properly
    return contactName.trim().split(/\s+/).map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }

  // Fall back to description
  const words = cleaned.split(/[\s\-\_\*]+/).filter(w => w.length > 2);
  if (words.length > 0) {
    return words.slice(0, 3).map(w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(' ');
  }

  return description.slice(0, 50) || 'Unknown Vendor';
}

function createVendorKey(vendorName: string): string {
  return vendorName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectFrequency(transactions: XeroTransaction[]): {
  frequency: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc';
  confidence: 'high' | 'medium' | 'low';
} {
  if (transactions.length === 1) {
    return { frequency: 'ad-hoc', confidence: 'low' };
  }

  // Sort by date
  const sorted = [...transactions].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Calculate intervals between transactions
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.round(
      (new Date(sorted[i].date).getTime() - new Date(sorted[i-1].date).getTime())
      / (1000 * 60 * 60 * 24)
    );
    if (days > 0) intervals.push(days);
  }

  if (intervals.length === 0) {
    return { frequency: 'ad-hoc', confidence: 'low' };
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const consistency = stdDev / avgInterval; // Lower is more consistent

  // Determine frequency based on average interval
  if (avgInterval >= 25 && avgInterval <= 35) {
    return {
      frequency: 'monthly',
      confidence: consistency < 0.2 ? 'high' : consistency < 0.4 ? 'medium' : 'low'
    };
  } else if (avgInterval >= 80 && avgInterval <= 100) {
    return {
      frequency: 'quarterly',
      confidence: consistency < 0.3 ? 'high' : consistency < 0.5 ? 'medium' : 'low'
    };
  } else if (avgInterval >= 350 && avgInterval <= 380) {
    return {
      frequency: 'annual',
      confidence: consistency < 0.1 ? 'high' : 'medium'
    };
  }

  // Check if it might be annual with only 1-2 transactions
  if (transactions.length <= 2) {
    const firstDate = new Date(sorted[0].date);
    const lastDate = new Date(sorted[sorted.length - 1].date);
    const span = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

    if (span >= 300 && span <= 400) {
      return { frequency: 'annual', confidence: 'medium' };
    }
  }

  return { frequency: 'ad-hoc', confidence: 'low' };
}

function calculateSuggestedMonthlyBudget(
  priorFYAmount: number,
  avgAmount: number,
  frequency: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc',
  monthsSpan: number
): number {
  switch (frequency) {
    case 'monthly':
      // Use average transaction amount for monthly subscriptions
      return avgAmount;
    case 'quarterly':
      // Use average transaction amount divided by 3 for quarterly
      return avgAmount / 3;
    case 'annual':
      // Use prior FY amount (full year) divided by 12 for annual subscriptions
      // Fall back to avgAmount if no prior FY data
      return priorFYAmount > 0 ? priorFYAmount / 12 : avgAmount / 12;
    case 'ad-hoc':
      // Spread over the period we have data for, or 12 months
      return (priorFYAmount > 0 ? priorFYAmount : avgAmount) / Math.max(monthsSpan, 12);
    default:
      return priorFYAmount > 0 ? priorFYAmount / 12 : avgAmount / 12;
  }
}

/**
 * Extract account balance from Xero P&L Report by account NAME
 * This is more reliable since P&L Reports use GUIDs not account codes
 */
function extractAccountBalanceByName(plReport: any, accountNames: string[]): number | null {
  try {
    const reports = plReport?.Reports;
    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      console.log('[extractAccountBalanceByName] No reports found');
      return null;
    }

    const report = reports[0];
    const rows = report?.Rows;
    if (!rows || !Array.isArray(rows)) {
      console.log('[extractAccountBalanceByName] No rows found');
      return null;
    }

    let totalBalance = 0;
    let foundAccounts: string[] = [];

    // Normalize account names for matching
    const normalizedNames = accountNames.map(n => n.toLowerCase().trim());
    console.log('[extractAccountBalanceByName] Searching for names:', normalizedNames);

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
              console.log(`[extractAccountBalanceByName] MATCH: "${accountCell?.Value}" = ${numValue}`);
            }
          }
        }

        if (row.Rows && Array.isArray(row.Rows)) {
          searchRows(row.Rows);
        }
      }
    }

    searchRows(rows);

    console.log('[extractAccountBalanceByName] Found:', foundAccounts);
    console.log('[extractAccountBalanceByName] Total:', totalBalance);

    return foundAccounts.length > 0 ? totalBalance : null;
  } catch (error) {
    console.error('[extractAccountBalanceByName] Error:', error);
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
      console.log('[extractAccountBalance] No reports found in response');
      return null;
    }

    const report = reports[0];
    const rows = report?.Rows;
    if (!rows || !Array.isArray(rows)) {
      console.log('[extractAccountBalance] No rows found in report');
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
    console.log('[extractAccountBalance] Searching for account codes:', accountCodes);
    console.log('[extractAccountBalance] All accounts in report (first 20):', allAccountsInReport.slice(0, 20));
    console.log('[extractAccountBalance] Found matching accounts:', foundAccounts);
    console.log('[extractAccountBalance] Total balance:', totalBalance);

    return foundAccounts.length > 0 ? totalBalance : null;
  } catch (error) {
    console.error('[extractAccountBalance] Error parsing P&L report:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { business_id, account_codes } = body;

    if (!business_id || !account_codes || !Array.isArray(account_codes)) {
      return NextResponse.json(
        { error: 'business_id and account_codes[] are required' },
        { status: 400 }
      );
    }

    // Filter out empty account codes
    const validAccountCodes = account_codes.filter(code => code && code.trim());

    if (validAccountCodes.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid account code is required' },
        { status: 400 }
      );
    }

    console.log('[Subscription Txns] Starting analysis for business:', business_id);
    console.log('[Subscription Txns] Account codes:', validAccountCodes);

    // Get the Xero connection
    const { data: connection, error: connError } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      console.error('[Subscription Txns] No active Xero connection');
      return NextResponse.json({ error: 'No active Xero connection found' }, { status: 404 });
    }

    // Use Token Manager to get a valid access token
    // Token Manager handles locking, refresh, and coordination with other API calls
    console.log('[Subscription Txns] Getting valid token via Token Manager...');

    const tokenResult = await getValidAccessToken({ id: connection.id }, supabase);

    if (!tokenResult.success || !tokenResult.accessToken) {
      console.error('[Subscription Txns] Token Manager failed:', tokenResult.error, tokenResult.message);

      // Check if this is a permanent failure requiring reconnection
      if (tokenResult.shouldDeactivate) {
        return NextResponse.json({
          error: 'Xero connection expired. Please reconnect Xero.',
          requiresReconnect: true
        }, { status: 401 });
      }

      return NextResponse.json({
        error: tokenResult.message || 'Failed to get valid Xero token'
      }, { status: 401 });
    }

    const accessToken = tokenResult.accessToken;
    console.log('[Subscription Txns] Got valid token from Token Manager');

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

    console.log('[Subscription Txns] Today:', today.toISOString());
    console.log('[Subscription Txns] Current FY Start Year:', currentFYStartYear);
    console.log('[Subscription Txns] Prior FY:', priorFYStartStr, 'to', priorFYEndStr);
    console.log('[Subscription Txns] Prior FY Start timestamp:', priorFYStart.getTime());
    console.log('[Subscription Txns] Current FY Start timestamp:', currentFYStart.getTime());
    console.log('[Subscription Txns] Current FY YTD:', currentFYStartStr, 'to', toDateStr);
    console.log('[Subscription Txns] Total date range:', fromDateStr, 'to', toDateStr);

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
        console.log('[Subscription Txns] SKIPPING: Transaction dated', dateStr, '(UTC:', new Date(dateUtc).toISOString(), ') is before prior FY start', priorFYStartStr);
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

    // Get account name mapping
    console.log('[Subscription Txns] Fetching accounts with token:', accessToken?.substring(0, 20) + '...');
    const accountsResponse = await fetch(
      'https://api.xero.com/api.xro/2.0/Accounts',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      }
    );

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      console.error('[Subscription Txns] Accounts fetch error:', accountsResponse.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch accounts from Xero' }, { status: 500 });
    }

    const accountsData = await accountsResponse.json();
    console.log('[Subscription Txns] Got', accountsData.Accounts?.length || 0, 'accounts');

    const accountNameMap = new Map<string, string>();
    for (const acc of accountsData.Accounts || []) {
      accountNameMap.set(acc.Code, acc.Name);
    }

    const allTransactions: XeroTransaction[] = [];

    // =====================================================
    // 1. FETCH ALL INVOICES (ACCPAY - supplier bills)
    // =====================================================
    console.log('[Subscription Txns] Fetching invoices...');

    let totalInvoicesFetched = 0;

    // Step 1: Collect all invoice IDs from paginated list
    const allInvoiceIds: string[] = [];
    let invoicePage = 1;
    let hasMoreInvoices = true;

    while (hasMoreInvoices) {
      // Use UTC methods since fromDate was created with Date.UTC()
      // URL encode the where clause to handle special characters (&&, ==, etc.)
      const whereClause = `Type=="ACCPAY"&&Date>=DateTime(${fromDate.getUTCFullYear()},${fromDate.getUTCMonth()+1},${fromDate.getUTCDate()})`;
      const invoicesUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(whereClause)}&page=${invoicePage}`;

      const invoicesResponse = await fetch(invoicesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      });

      if (!invoicesResponse.ok) {
        const errorText = await invoicesResponse.text();
        console.error('[Subscription Txns] Invoice list fetch error:', invoicesResponse.status, errorText);
        break;
      }

      const invoicesData = await invoicesResponse.json();
      const invoices = invoicesData.Invoices || [];

      console.log(`[Subscription Txns] Invoice page ${invoicePage}: ${invoices.length} invoices`);

      if (invoices.length === 0) {
        hasMoreInvoices = false;
        break;
      }

      // Collect invoice IDs
      for (const invoice of invoices) {
        allInvoiceIds.push(invoice.InvoiceID);
      }

      invoicePage++;

      // Safety limit - max 10 pages (1000 invoices)
      if (invoicePage > 10) {
        console.log('[Subscription Txns] Reached invoice page limit');
        break;
      }
    }

    console.log(`[Subscription Txns] Collected ${allInvoiceIds.length} invoice IDs`);

    // Step 2: Batch fetch invoices with line items (50 at a time)
    const BATCH_SIZE = 50;
    for (let i = 0; i < allInvoiceIds.length; i += BATCH_SIZE) {
      const batchIds = allInvoiceIds.slice(i, i + BATCH_SIZE);
      const idsParam = batchIds.join(',');

      console.log(`[Subscription Txns] Fetching batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(allInvoiceIds.length/BATCH_SIZE)} (${batchIds.length} invoices)`);

      // Add delay between batches to avoid rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const batchResponse = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices?IDs=${idsParam}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json'
          }
        }
      );

      // Handle rate limiting
      if (batchResponse.status === 429) {
        const retryAfter = parseInt(batchResponse.headers.get('Retry-After') || '60');
        console.log(`[Subscription Txns] Rate limited on batch, waiting ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));

        // Retry the batch
        const retryResponse = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices?IDs=${idsParam}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'xero-tenant-id': connection.tenant_id,
              'Accept': 'application/json'
            }
          }
        );

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          for (const fullInvoice of retryData.Invoices || []) {
            if (fullInvoice?.LineItems) {
              const invoiceDate = parseXeroDate(fullInvoice.Date);
              const dateStr = invoiceDate ? formatDate(invoiceDate) : '';
              const period = getPeriod(dateStr);

              // Skip transactions outside our FY range
              if (!period) continue;

              for (const line of fullInvoice.LineItems) {
                if (validAccountCodes.includes(line.AccountCode)) {
                  const contactName = fullInvoice.Contact?.Name || '';
                  const vendorName = extractVendorName(contactName, line.Description || '');
                  const rawAmount = line.LineAmount || 0;
                  const isCredit = rawAmount < 0;

                  allTransactions.push({
                    id: `inv-${fullInvoice.InvoiceID}-${line.LineItemID || Math.random()}`,
                    date: dateStr,
                    vendor: vendorName,
                    description: line.Description || contactName,
                    amount: rawAmount,
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
                    console.log(`[Subscription Txns] CREDIT FOUND (invoice retry): ${vendorName} ${dateStr} ${rawAmount}`);
                  }
                }
              }
            }
          }
        }
        continue;
      }

      if (!batchResponse.ok) {
        const errorText = await batchResponse.text();
        console.error('[Subscription Txns] Batch fetch error:', batchResponse.status, errorText);
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
            if (validAccountCodes.includes(line.AccountCode)) {
              const contactName = fullInvoice.Contact?.Name || '';
              const vendorName = extractVendorName(contactName, line.Description || '');

              const rawAmount = line.LineAmount || 0;
              const isCredit = rawAmount < 0;

              // For expense accounts, positive = expense, negative = credit/refund
              // We keep the sign to properly calculate net expense
              allTransactions.push({
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
                console.log(`[Subscription Txns] CREDIT FOUND (invoice): ${vendorName} ${dateStr} ${rawAmount}`);
              }
            }
          }
        }
      }
    }

    console.log('[Subscription Txns] Total invoice transactions:', totalInvoicesFetched);

    // =====================================================
    // 2. FETCH ALL BANK TRANSACTIONS (credit card, DD)
    // =====================================================
    console.log('[Subscription Txns] Fetching bank transactions...');

    let bankPage = 1;
    let hasMoreBank = true;
    let totalBankFetched = 0;

    while (hasMoreBank) {
      // Add delay between page fetches
      if (bankPage > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Use UTC methods since fromDate was created with Date.UTC()
      // URL encode the where clause to handle special characters (&&, ==, etc.)
      const bankWhereClause = `Date>=DateTime(${fromDate.getUTCFullYear()},${fromDate.getUTCMonth()+1},${fromDate.getUTCDate()})&&Type=="SPEND"`;
      const bankUrl = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(bankWhereClause)}&page=${bankPage}`;

      const bankResponse = await fetch(bankUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      });

      // Handle rate limiting
      if (bankResponse.status === 429) {
        const retryAfter = parseInt(bankResponse.headers.get('Retry-After') || '60');
        console.log(`[Subscription Txns] Bank rate limited, waiting ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue; // Retry same page
      }

      if (!bankResponse.ok) {
        const errorText = await bankResponse.text();
        console.error('[Subscription Txns] Bank transaction fetch error:', bankResponse.status, errorText);
        break;
      }

      const bankData = await bankResponse.json();
      const bankTxns = bankData.BankTransactions || [];

      console.log(`[Subscription Txns] Bank page ${bankPage}: ${bankTxns.length} transactions`);

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
          if (validAccountCodes.includes(line.AccountCode)) {
            const contactName = txn.Contact?.Name || '';
            const vendorName = extractVendorName(contactName, line.Description || txn.Reference || '');

            const rawAmount = line.LineAmount || 0;
            const isCredit = rawAmount < 0;

            // For expense accounts, positive = expense, negative = credit/refund
            // We keep the sign to properly calculate net expense
            allTransactions.push({
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
              console.log(`[Subscription Txns] CREDIT FOUND (bank): ${vendorName} ${dateStr} ${rawAmount}`);
            }
          }
        }
      }

      bankPage++;

      // Safety limit - increased to 50 pages (5000 transactions) to ensure complete data
      if (bankPage > 50) {
        console.log('[Subscription Txns] Reached bank page limit (50 pages)');
        break;
      }
    }

    console.log('[Subscription Txns] Total bank transactions:', totalBankFetched);
    console.log('[Subscription Txns] TOTAL transactions found:', allTransactions.length);

    // Calculate credit/debit breakdown for debugging
    const creditTransactions = allTransactions.filter(t => t.isCredit);
    const debitTransactions = allTransactions.filter(t => !t.isCredit);
    const totalCredits = creditTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalDebits = debitTransactions.reduce((sum, t) => sum + t.amount, 0);
    const netTotal = totalDebits + totalCredits; // Credits are negative, so this is net

    console.log('[Subscription Txns] AMOUNT BREAKDOWN:');
    console.log(`  - Debit transactions (expenses): ${debitTransactions.length} totaling ${totalDebits.toFixed(2)}`);
    console.log(`  - Credit transactions (refunds): ${creditTransactions.length} totaling ${totalCredits.toFixed(2)}`);
    console.log(`  - NET TOTAL: ${netTotal.toFixed(2)}`);

    if (creditTransactions.length > 0) {
      console.log('[Subscription Txns] Credit transactions detail:');
      creditTransactions.forEach(t => {
        console.log(`    ${t.date} | ${t.vendor} | ${t.amount} | ${t.description?.substring(0, 50)}`);
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
        });
      }

      const vendor = vendorMap.get(vendorKey)!;
      vendor.transactions.push(tx);
      vendor.totalAmount += tx.amount;
      vendor.transactionCount++;

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

      // Detect frequency
      const { frequency, confidence } = detectFrequency(vendor.transactions);
      vendor.suggestedFrequency = frequency;
      vendor.confidence = confidence;

      // Calculate suggested monthly budget using prior FY for annual subscriptions
      vendor.suggestedMonthlyBudget = calculateSuggestedMonthlyBudget(
        vendor.priorFYAmount,
        vendor.avgAmount,
        vendor.suggestedFrequency,
        vendor.monthsSpan
      );

      // Sort transactions by date (newest first)
      vendor.transactions.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      vendors.push(vendor);
    }

    // Sort vendors by total amount (highest first)
    vendors.sort((a, b) => b.totalAmount - a.totalAmount);

    // =====================================================
    // 5. CALCULATE TOTALS FOR RECONCILIATION
    // =====================================================
    const totalAnalyzed = vendors.reduce((sum, v) => sum + v.totalAmount, 0);
    const totalMonthlyBudget = vendors.reduce((sum, v) => sum + v.suggestedMonthlyBudget, 0);

    console.log('[Subscription Txns] Analysis complete:');
    console.log(`  - Vendors found: ${vendors.length}`);
    console.log(`  - Total analyzed: $${totalAnalyzed.toFixed(2)}`);
    console.log(`  - Suggested monthly budget: $${totalMonthlyBudget.toFixed(2)}`);
    console.log('[Subscription Txns] Date filtering stats:');
    console.log(`  - Prior FY transactions: ${priorFYCount}`);
    console.log(`  - Current FY transactions: ${currentFYCount}`);
    console.log(`  - Skipped (older than prior FY): ${skippedOldDates}`);

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
    console.log('[Subscription Txns] PRIOR FY BREAKDOWN BY MONTH:');
    const sortedMonths = Object.keys(priorFYByMonth).sort();
    for (const month of sortedMonths) {
      console.log(`  ${month}: ${priorFYByMonth[month].count} txns = $${priorFYByMonth[month].total.toFixed(2)}`);
    }
    console.log(`  TOTAL: ${priorFYTransactions.length} txns = $${priorFYTotal.toFixed(2)}`);

    // =====================================================
    // 6. FETCH ACTUAL P&L BALANCES FOR RECONCILIATION
    // =====================================================
    // This fetches the ACTUAL account balance from Xero's P&L Report
    // to verify our transaction analysis is complete and accurate
    console.log('[Subscription Txns] Fetching P&L Report for reconciliation...');

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
      console.log('[Subscription Txns] Looking up Account GUIDs for codes:', validAccountCodes);

      const accountGUIDs: string[] = [];
      const accountNames: string[] = [];

      for (const code of validAccountCodes) {
        // Find this account in our accounts data
        const accountName = accountNameMap.get(code);
        if (accountName) {
          accountNames.push(accountName);
          console.log(`[Subscription Txns] Account ${code} = "${accountName}"`);
        }
      }

      // Fetch the P&L Report and search by account NAME since that's what we have
      const priorPLUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${priorFYStartStr}&toDate=${priorFYEndStr}&standardLayout=true`;
      console.log('[Subscription Txns] Prior FY P&L URL:', priorPLUrl);

      const priorPLResponse = await fetch(priorPLUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      });

      if (priorPLResponse.ok) {
        const priorPLData = await priorPLResponse.json();

        // Extract balance using account names instead of codes
        const priorActual = extractAccountBalanceByName(priorPLData, accountNames);
        console.log('[Subscription Txns] Prior FY P&L actual balance:', priorActual);

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
      } else {
        const errorText = await priorPLResponse.text();
        console.error('[Subscription Txns] Prior FY P&L fetch failed:', priorPLResponse.status, errorText);
      }

      // Fetch Current FY YTD P&L Report
      const currentPLUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${currentFYStartStr}&toDate=${toDateStr}&standardLayout=true`;
      console.log('[Subscription Txns] Current FY P&L URL:', currentPLUrl);

      const currentPLResponse = await fetch(currentPLUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      });

      if (currentPLResponse.ok) {
        const currentPLData = await currentPLResponse.json();
        const currentActual = extractAccountBalanceByName(currentPLData, accountNames);
        console.log('[Subscription Txns] Current FY P&L actual balance:', currentActual);

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
      } else {
        const errorText = await currentPLResponse.text();
        console.error('[Subscription Txns] Current FY P&L fetch failed:', currentPLResponse.status, errorText);
      }
    } catch (reconcileError) {
      console.error('[Subscription Txns] Reconciliation error:', reconcileError);
    }

    console.log('[Subscription Txns] Reconciliation results:', reconciliation);

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
        // P&L Reconciliation - compare our analysis to actual Xero P&L balance
        reconciliation,
      },
    });
  } catch (err) {
    console.error('[Subscription Txns] Error:', err);
    return NextResponse.json({ error: 'Failed to analyze subscriptions' }, { status: 500 });
  }
}
