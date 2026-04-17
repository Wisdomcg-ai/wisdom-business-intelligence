// /api/monthly-report/sync-xero/route.ts
// Manual P&L sync for a single business — syncs xero_pl_lines from Xero
// Fetches each month INDIVIDUALLY to guarantee correct monthly P&L values.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Map Xero section titles to account types
function mapSectionToType(section: string): string {
  const lower = section.toLowerCase();
  if (lower.includes('other income')) return 'other_income';
  if (lower.includes('other expense')) return 'other_expense';
  if (lower.includes('income') || lower.includes('revenue')) return 'revenue';
  if (lower.includes('cost of') || lower.includes('cogs') || lower.includes('direct')) return 'cogs';
  if (lower.includes('expense') || lower.includes('operating')) return 'opex';
  return 'opex';
}

// Xero summary/calculated rows — NOT real accounts
const SUMMARY_ROW_NAMES = new Set([
  'gross profit', 'net profit', 'total income', 'total revenue',
  'total cost of sales', 'total direct costs', 'total operating expenses',
  'total expenses', 'total other income', 'total other expenses', 'operating profit',
]);

// Get last day of month (1-based month)
function lastDay(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return d.toISOString().split('T')[0];
}

// Generate list of month keys for the last N months
function getMonthList(count: number): { key: string; fromDate: string; toDate: string }[] {
  const now = new Date();
  const months: { key: string; fromDate: string; toDate: string }[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const fromDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const toDate = lastDay(y, m);
    months.push({ key, fromDate, toDate });
  }

  return months;
}

// Fetch single-month P&L from Xero — NO periods parameter
async function fetchSingleMonthPL(
  accessToken: string,
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<{ success: boolean; report?: any; error?: string; status?: number }> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}&standardLayout=true&paymentsOnly=false`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: errorText, status: response.status };
  }

  const data = await response.json();
  return { success: true, report: data?.Reports?.[0] };
}

// Parse single-month P&L report — extracts account name + single value
function parseSingleMonthReport(report: any): Map<string, { value: number; section: string }> {
  const accounts = new Map<string, { value: number; section: string }>();
  const rows = report.Rows || [];

  for (const section of rows) {
    if (section.RowType !== 'Section' || !section.Rows) continue;
    const sectionTitle = section.Title || 'Other';

    for (const row of section.Rows) {
      if (row.RowType !== 'Row' || !row.Cells) continue;
      const name = row.Cells[0]?.Value;
      if (!name) continue;
      if (SUMMARY_ROW_NAMES.has(name.toLowerCase())) continue;

      const value = parseFloat(row.Cells[1]?.Value || '0');
      if (!isNaN(value)) {
        accounts.set(name, { value, section: sectionTitle });
      }
    }
  }

  return accounts;
}

export async function POST(request: NextRequest) {
  // Stage tracker so 500s tell us exactly where things failed
  let stage = 'init';
  try {
    stage = 'auth';
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized', stage }, { status: 401 });
    }

    stage = 'parse_body';
    const body = await request.json();
    const { business_id } = body;
    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required', stage }, { status: 400 });
    }

    stage = 'resolve_business_ids';
    const ids = await resolveBusinessIds(supabaseAdmin, business_id);
    console.log(`[Sync Xero] Resolved IDs for ${business_id}:`, ids);

    stage = 'fetch_business';
    const { data: business, error: bizError } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', ids.bizId)
      .maybeSingle();

    if (bizError) {
      console.error('[Sync Xero] Business fetch error:', bizError);
      return NextResponse.json({ error: 'Business lookup failed', detail: bizError.message, stage }, { status: 500 });
    }
    if (!business) {
      return NextResponse.json({ error: 'Business not found', stage, resolved_ids: ids }, { status: 404 });
    }

    stage = 'authz';
    if (business.owner_id !== user.id && business.assigned_coach_id !== user.id) {
      return NextResponse.json({ error: 'Access denied', stage, user_id: user.id }, { status: 403 });
    }

    stage = 'fetch_connection';
    const { data: connection, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('*')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (connError) {
      console.error('[Sync Xero] Connection fetch error:', connError);
      return NextResponse.json({ error: 'Connection lookup failed', detail: connError.message, stage }, { status: 500 });
    }
    if (!connection) {
      return NextResponse.json({ error: 'No active Xero connection found', stage, searched_ids: ids.all }, { status: 404 });
    }

    stage = 'refresh_token';
    const tokenResult = await getValidAccessToken(connection, supabaseAdmin);
    if (!tokenResult.success || !tokenResult.accessToken) {
      return NextResponse.json(
        { error: 'Token expired', message: tokenResult.message, tokenError: tokenResult.error, stage },
        { status: 401 }
      );
    }

    const accessToken = tokenResult.accessToken;
    const tenantId = connection.tenant_id;

    stage = 'fetch_chart_of_accounts';
    // Fetch Chart of Accounts to get account codes (P&L reports don't include them)
    const accountCodeLookup = new Map<string, string>(); // name → code
    try {
      const coaResp = await fetch(
        `https://api.xero.com/api.xro/2.0/Accounts?where=${encodeURIComponent('Type=="REVENUE"||Type=="OTHERINCOME"||Type=="DIRECTCOSTS"||Type=="EXPENSE"||Type=="OVERHEADS"')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': tenantId,
            'Accept': 'application/json',
          },
        }
      );
      if (coaResp.ok) {
        const coaData = await coaResp.json();
        for (const acc of coaData.Accounts || []) {
          if (acc.Name && acc.Code) {
            accountCodeLookup.set(acc.Name, acc.Code);
          }
        }
        console.log(`[Sync Xero] Chart of Accounts: ${accountCodeLookup.size} account codes loaded`);
      }
    } catch (coaErr) {
      console.warn('[Sync Xero] Could not fetch Chart of Accounts for codes (non-fatal):', coaErr);
    }

    // ===================================================================
    // FETCH EACH MONTH INDIVIDUALLY — guaranteed correct monthly values.
    // One Xero API call per month. No ambiguous "periods" parameter.
    // 24 months × ~1s = ~30s total. Well within 120s timeout.
    // ===================================================================
    stage = 'fetch_monthly_pl';
    const months = getMonthList(24);
    const allAccounts = new Map<string, {
      business_id: string;
      account_name: string;
      account_code: string | null;
      account_type: string;
      section: string;
      monthly_values: Record<string, number>;
      updated_at: string;
    }>();

    let fetchedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    console.log(`[Sync Xero] Fetching ${months.length} individual months for business ${business_id}`);

    for (const month of months) {
      // Rate limiting: 500ms between requests (Xero allows 60/min)
      if (fetchedCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const result = await fetchSingleMonthPL(accessToken, tenantId, month.fromDate, month.toDate);

      if (!result.success) {
        if (result.status === 401) {
          return NextResponse.json(
            { error: 'Token expired during sync', month: month.key, fetched: fetchedCount },
            { status: 401 }
          );
        }
        if (result.status === 429) {
          // Rate limited — wait and retry once
          console.warn(`[Sync Xero] Rate limited at ${month.key}, waiting 10s...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          const retry = await fetchSingleMonthPL(accessToken, tenantId, month.fromDate, month.toDate);
          if (!retry.success) {
            failedCount++;
            errors.push(`${month.key}: rate limited`);
            continue;
          }
          result.report = retry.report;
        } else {
          failedCount++;
          errors.push(`${month.key}: ${result.status}`);
          continue;
        }
      }

      if (!result.report) {
        failedCount++;
        errors.push(`${month.key}: no report data`);
        continue;
      }

      const monthAccounts = parseSingleMonthReport(result.report);

      for (const [name, data] of monthAccounts) {
        const existing = allAccounts.get(name) || {
          business_id: ids.profileId,
          account_name: name,
          account_code: accountCodeLookup.get(name) || null,
          account_type: mapSectionToType(data.section),
          section: data.section,
          monthly_values: {} as Record<string, number>,
          updated_at: new Date().toISOString(),
        };

        existing.monthly_values[month.key] = data.value;
        allAccounts.set(name, existing);
      }

      fetchedCount++;
      if (fetchedCount % 6 === 0) {
        console.log(`[Sync Xero] Progress: ${fetchedCount}/${months.length} months fetched`);
      }
    }

    console.log(`[Sync Xero] Fetch complete: ${fetchedCount} months OK, ${failedCount} failed, ${allAccounts.size} accounts`);

    // Build final list
    const plLines = Array.from(allAccounts.values()).filter(
      line => Object.keys(line.monthly_values).length > 0
    );

    stage = 'db_delete';
    if (plLines.length > 0) {
      // Use RPC or sequential delete+insert. Delete first, verify empty, then insert.
      // This prevents duplicates from concurrent sync operations.
      // Delete rows under BOTH ID formats to clean up legacy data
      const { error: deleteError } = await supabaseAdmin
        .from('xero_pl_lines')
        .delete()
        .in('business_id', ids.all);

      if (deleteError) {
        console.error('[Sync Xero] Delete failed:', deleteError);
        return NextResponse.json(
          { error: 'Database delete failed', detail: deleteError.message, stage, hint: deleteError.hint, code: deleteError.code },
          { status: 500 }
        );
      }

      // Verify deletion completed before inserting
      const { count } = await supabaseAdmin
        .from('xero_pl_lines')
        .select('*', { count: 'exact', head: true })
        .in('business_id', ids.all);

      if (count && count > 0) {
        console.warn(`[Sync Xero] ${count} rows still exist after delete — retrying delete`);
        await supabaseAdmin
          .from('xero_pl_lines')
          .delete()
          .in('business_id', ids.all);
      }

      stage = 'db_insert';
      // Try inserting with account_code; if column doesn't exist yet, retry without it
      let insertError: any = null;
      const { error: firstError } = await supabaseAdmin
        .from('xero_pl_lines')
        .insert(plLines);

      if (firstError?.message?.includes('account_code')) {
        console.warn('[Sync Xero] account_code column not yet added — inserting without it');
        const linesWithoutCode = plLines.map(({ account_code, ...rest }) => rest);
        const { error: retryError } = await supabaseAdmin
          .from('xero_pl_lines')
          .insert(linesWithoutCode);
        insertError = retryError;
      } else {
        insertError = firstError;
      }

      if (insertError) {
        console.error('[Sync Xero] Insert failed:', insertError);
        return NextResponse.json(
          { error: 'Database insert failed', detail: insertError.message, stage, hint: insertError.hint, code: insertError.code, sample_row: plLines[0] },
          { status: 500 }
        );
      }
    }

    await supabaseAdmin
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);

    // Log sample data for debugging
    const sampleAccount = plLines.find(l => l.account_type === 'revenue');
    if (sampleAccount) {
      const recentMonths = months.slice(0, 3).map(m => m.key);
      const sampleValues = recentMonths.map(k => `${k}: ${sampleAccount.monthly_values[k] ?? 'N/A'}`);
      console.log(`[Sync Xero] Sample revenue "${sampleAccount.account_name}": ${sampleValues.join(', ')}`);
    }

    console.log(`[Sync Xero] Done: ${plLines.length} accounts synced across ${fetchedCount} months`);

    return NextResponse.json({
      success: true,
      accounts_synced: plLines.length,
      months_fetched: fetchedCount,
      months_failed: failedCount,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error(`[Sync Xero] Error at stage "${stage}":`, error);
    const errMsg = error instanceof Error ? error.message : 'Sync failed';
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: errMsg,
        stage,
        // Return stack first 500 chars for debugging (not sensitive)
        stack_preview: stack?.slice(0, 500),
      },
      { status: 500 }
    );
  }
}
