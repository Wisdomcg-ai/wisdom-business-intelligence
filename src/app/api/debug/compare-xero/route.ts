import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Expected data from Xero spreadsheet
const xeroData: Record<string, Record<string, number>> = {
  'Sales': {
    '2024-07': 21250.00, '2024-08': 0, '2024-09': 272.74, '2024-10': 0,
    '2024-11': 0, '2024-12': 0, '2025-01': 0, '2025-02': 0,
    '2025-03': 258.08, '2025-04': 0, '2025-05': 0, '2025-06': 0
  },
  'Sales - CFO': {
    '2024-07': 16562.50, '2024-08': 11362.50, '2024-09': 15362.50, '2024-10': 11362.50,
    '2024-11': 11362.50, '2024-12': 15362.50, '2025-01': 11362.50, '2025-02': 14712.50,
    '2025-03': 20012.50, '2025-04': 10962.50, '2025-05': 14962.50, '2025-06': 15912.50
  },
  'Sales - TB': {
    '2024-07': 6318.18, '2024-08': 6318.18, '2024-09': 6318.18, '2024-10': 6318.18,
    '2024-11': 6318.18, '2024-12': 6318.18, '2025-01': 6318.18, '2025-02': 6318.18,
    '2025-03': 6318.18, '2025-04': 6318.18, '2025-05': 6318.18, '2025-06': 6318.18
  },
  'Sales - Wisdom Coaching': {
    '2024-07': 55392.69, '2024-08': 48635.35, '2024-09': 54224.89, '2024-10': 53868.18,
    '2024-11': 58813.64, '2024-12': 52274.08, '2025-01': 50415.01, '2025-02': 55163.64,
    '2025-03': 167743.61, '2025-04': 88127.76, '2025-05': 55304.59, '2025-06': 59264.65
  },
  'Sales - Wisdom Growth Club': {
    '2024-07': 500.00, '2024-08': 500.00, '2024-09': 500.00, '2024-10': 713.64,
    '2024-11': 4704.55, '2024-12': 500.00, '2025-01': 500.00, '2025-02': 500.00,
    '2025-03': 500.00, '2025-04': 4704.55, '2025-05': 500.00, '2025-06': 500.00
  }
};

export async function GET() {
  try {
    // Get forecast
    const { data: forecasts } = await supabase
      .from('financial_forecasts')
      .select('id, name, actual_start_month, actual_end_month')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!forecasts || forecasts.length === 0) {
      return NextResponse.json({ error: 'No forecast found' }, { status: 404 });
    }

    const forecast = forecasts[0];

    // Get P&L lines
    const { data: plLines } = await supabase
      .from('forecast_pl_lines')
      .select('account_name, category, actual_months')
      .eq('forecast_id', forecast.id)
      .eq('is_from_xero', true)
      .order('account_name');

    const months = ['2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12',
                    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];

    const comparison: any = {
      forecast: {
        id: forecast.id,
        name: forecast.name,
        period: `${forecast.actual_start_month} to ${forecast.actual_end_month}`
      },
      totalLines: plLines?.length || 0,
      accounts: {},
      monthlyRevenueTotals: {},
      expectedMonthlyRevenueTotals: {}
    };

    // Compare each account
    for (const [accountName, expectedMonths] of Object.entries(xeroData)) {
      const syncedLine = plLines?.find((l: any) => l.account_name === accountName);

      comparison.accounts[accountName] = {
        foundInDB: !!syncedLine,
        category: syncedLine?.category || 'N/A',
        months: {}
      };

      if (syncedLine) {
        for (const [monthKey, expectedValue] of Object.entries(expectedMonths)) {
          const syncedValue = syncedLine.actual_months[monthKey] || 0;
          const match = Math.abs(syncedValue - expectedValue) < 0.01;

          comparison.accounts[accountName].months[monthKey] = {
            expected: expectedValue,
            synced: syncedValue,
            match
          };
        }
      }
    }

    // Calculate monthly revenue totals
    const revenueLines = plLines?.filter((l: any) => l.category === 'Revenue') || [];

    months.forEach(month => {
      // Actual synced total
      const total = revenueLines.reduce((sum: number, line: any) => {
        return sum + (line.actual_months[month] || 0);
      }, 0);
      comparison.monthlyRevenueTotals[month] = total;

      // Expected total from Xero
      const expectedTotal = Object.values(xeroData).reduce((sum, accountData) => {
        return sum + (accountData[month] || 0);
      }, 0);
      comparison.expectedMonthlyRevenueTotals[month] = expectedTotal;
    });

    return NextResponse.json(comparison, { status: 200 });

  } catch (error) {
    console.error('Comparison error:', error);
    return NextResponse.json(
      { error: 'Failed to compare data' },
      { status: 500 }
    );
  }
}
