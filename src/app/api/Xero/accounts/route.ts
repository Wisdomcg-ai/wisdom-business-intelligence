/**
 * Xero Accounts API
 * Returns expense accounts from the forecast P&L data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const type = searchParams.get('type') || 'EXPENSE';

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // Verify user owns this business
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .single();

    if (bizError || !business || business.owner_id !== user.id) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Get the latest forecast
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, fiscal_year')
      .eq('business_id', businessId)
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .single();

    if (forecastError || !forecast) {
      console.log('[Xero accounts] No forecast found:', forecastError?.message);
      // No forecast data yet - return empty list
      return NextResponse.json({ accounts: [] });
    }

    console.log('[Xero accounts] Forecast found:', forecast.id, 'fiscal_year:', forecast.fiscal_year);

    // Fetch P&L lines separately to avoid ambiguous relationship issue
    const { data: plLines, error: plError } = await supabase
      .from('forecast_pl_lines')
      .select('id, account_code, account_name, category, actual_months')
      .eq('forecast_id', forecast.id);

    if (plError) {
      console.log('[Xero accounts] Error fetching P&L lines:', plError.message);
      return NextResponse.json({ accounts: [] });
    }

    // Debug: Log unique categories found
    const uniqueCategories = [...new Set(plLines.map((l: { category?: string }) => l.category || 'null'))];
    console.log('[Xero accounts] P&L lines count:', plLines.length, 'Unique categories:', uniqueCategories);

    // Helper function to check if category is an expense type
    // Uses flexible matching like pl-summary does
    const isExpenseCategory = (category: string): boolean => {
      const cat = (category || '').toLowerCase();
      // Exclude revenue, income, COGS
      if (cat.includes('revenue') || cat.includes('income') || cat.includes('sales')) return false;
      if (cat.includes('cost of sales') || cat.includes('cogs') || cat.includes('direct cost')) return false;
      // Include operating expenses, overheads, admin, etc.
      return (
        cat.includes('operating') ||
        cat.includes('expense') ||
        cat.includes('overhead') ||
        cat.includes('administrative') ||
        cat.includes('admin') ||
        cat.includes('other expense')
      );
    };

    const accounts = plLines
      .filter((line: { category?: string }) => {
        if (type === 'EXPENSE') {
          return isExpenseCategory(line.category || '');
        }
        return true;
      })
      .map((line: {
        account_code?: string;
        account_name?: string;
        actual_months?: Record<string, number>
      }) => {
        // Calculate YTD total from actual_months
        const actuals = line.actual_months as Record<string, number> | null;
        let ytdTotal = 0;
        let transactionCount = 0;

        if (actuals) {
          for (const [, amount] of Object.entries(actuals)) {
            if (amount !== 0) {
              ytdTotal += Math.abs(amount);
              transactionCount++;
            }
          }
        }

        return {
          account_id: line.account_code || '',
          code: line.account_code || '',
          name: line.account_name || 'Unknown',
          ytd_total: ytdTotal,
          transaction_count: transactionCount,
        };
      })
      .filter((acc: { ytd_total: number }) => acc.ytd_total > 0)
      .sort((a: { ytd_total: number }, b: { ytd_total: number }) => b.ytd_total - a.ytd_total);

    console.log('[Xero accounts] Returning', accounts.length, 'expense accounts');
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error('[Xero accounts] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
