import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function syncXeroData(business_id: string) {
  try {
    // Get the Xero connection
    const { data: connection, error: connError } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: 'No Xero connection found' }, { status: 404 });
    }

    // Check if token needs refresh
    const now = new Date();
    const expiry = new Date(connection.expires_at);
    
    let accessToken = connection.access_token;
    
    if (expiry <= now) {
      // Refresh the token
      const refreshResponse = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: connection.refresh_token
        })
      });

      if (!refreshResponse.ok) {
        return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;
      
      // Update tokens in database
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);
      
      await supabase
        .from('xero_connections')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: newExpiry.toISOString()
        })
        .eq('id', connection.id);
    }

    // Get bank accounts
    const bankResponse = await fetch(`https://api.xero.com/api.xro/2.0/BankSummary`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': connection.tenant_id,
        'Accept': 'application/json'
      }
    });

    const bankData = bankResponse.ok ? await bankResponse.json() : null;
    
    // Calculate total cash
    let totalCash = 0;
    if (bankData?.BankSummary) {
      bankData.BankSummary.forEach((account: any) => {
        totalCash += account.ClosingBalance || 0;
      });
    }

    // Get P&L for current month
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const plResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${startOfMonth.toISOString().split('T')[0]}&toDate=${endOfMonth.toISOString().split('T')[0]}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      }
    );

    let monthlyMetrics = {
      revenue_month: 0,
      cogs_month: 0,
      expenses_month: 0,
      net_profit_month: 0
    };

    if (plResponse.ok) {
      const plData = await plResponse.json();
      // Parse P&L data
      if (plData?.Reports?.[0]?.Rows) {
        plData.Reports[0].Rows.forEach((row: any) => {
          if (row.RowType === 'Section') {
            if (row.Title === 'Income' || row.Title === 'Revenue') {
              row.Rows?.forEach((subRow: any) => {
                if (subRow.Cells?.[1]?.Value) {
                  monthlyMetrics.revenue_month += parseFloat(subRow.Cells[1].Value) || 0;
                }
              });
            } else if (row.Title === 'Cost of Sales') {
              row.Rows?.forEach((subRow: any) => {
                if (subRow.Cells?.[1]?.Value) {
                  monthlyMetrics.cogs_month += parseFloat(subRow.Cells[1].Value) || 0;
                }
              });
            } else if (row.Title === 'Operating Expenses' || row.Title === 'Expenses') {
              row.Rows?.forEach((subRow: any) => {
                if (subRow.Cells?.[1]?.Value) {
                  monthlyMetrics.expenses_month += parseFloat(subRow.Cells[1].Value) || 0;
                }
              });
            }
          }
        });
      }
    }

    monthlyMetrics.net_profit_month = monthlyMetrics.revenue_month - monthlyMetrics.cogs_month - monthlyMetrics.expenses_month;

    // Save to financial_metrics table
    const { error: metricsError } = await supabase
      .from('financial_metrics')
      .upsert({
        business_id: business_id,
        metric_date: new Date().toISOString().split('T')[0],
        total_cash: totalCash,
        revenue_month: monthlyMetrics.revenue_month,
        cogs_month: monthlyMetrics.cogs_month,
        expenses_month: monthlyMetrics.expenses_month,
        net_profit_month: monthlyMetrics.net_profit_month,
        gross_profit_month: monthlyMetrics.revenue_month - monthlyMetrics.cogs_month,
        gross_margin_percent: monthlyMetrics.revenue_month > 0 
          ? ((monthlyMetrics.revenue_month - monthlyMetrics.cogs_month) / monthlyMetrics.revenue_month) * 100 
          : 0,
        net_margin_percent: monthlyMetrics.revenue_month > 0 
          ? (monthlyMetrics.net_profit_month / monthlyMetrics.revenue_month) * 100 
          : 0
      });

    // Update last sync time
    await supabase
      .from('xero_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id);

    return NextResponse.json({ 
      success: true, 
      metrics: {
        totalCash,
        ...monthlyMetrics
      }
    });

  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const business_id = searchParams.get('business_id');

  if (!business_id) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
  }

  return syncXeroData(business_id);
}

export async function POST(request: NextRequest) {
  try {
    const { business_id } = await request.json();

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    return syncXeroData(business_id);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}