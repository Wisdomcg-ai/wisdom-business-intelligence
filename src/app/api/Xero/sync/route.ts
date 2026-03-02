import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Verify user has access to the business
async function verifyUserAccess(userId: string, businessId: string): Promise<boolean> {
  // Check if user is the owner
  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('owner_id, assigned_coach_id')
    .eq('id', businessId)
    .single();

  if (business?.owner_id === userId || business?.assigned_coach_id === userId) {
    return true;
  }

  // Check if user is a business member
  const { data: membership } = await supabaseAdmin
    .from('business_users')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .single();

  if (membership) {
    return true;
  }

  // Check if user is super_admin
  const { data: role } = await supabaseAdmin
    .from('system_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  return role?.role === 'super_admin';
}

async function syncXeroData(business_id: string) {
  try {
    // Get the Xero connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: 'No Xero connection found' }, { status: 404 });
    }

    // Decrypt tokens from database
    const decryptedAccessToken = decrypt(connection.access_token);
    const decryptedRefreshToken = decrypt(connection.refresh_token);

    // Check if token needs refresh
    const now = new Date();
    const expiry = new Date(connection.expires_at);

    let accessToken = decryptedAccessToken;

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
          refresh_token: decryptedRefreshToken
        })
      });

      if (!refreshResponse.ok) {
        return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;

      // Update tokens in database (encrypted)
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

      await supabaseAdmin
        .from('xero_connections')
        .update({
          access_token: encrypt(tokens.access_token),
          refresh_token: encrypt(tokens.refresh_token),
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
    const { error: metricsError } = await supabaseAdmin
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
    await supabaseAdmin
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
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
  const supabase = await createRouteHandlerClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const business_id = searchParams.get('business_id');

  if (!business_id) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
  }

  // Verify user has access to this business
  const hasAccess = await verifyUserAccess(user.id, business_id);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied to this business' }, { status: 403 });
  }

  return syncXeroData(business_id);
}

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { business_id } = await request.json();

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // Verify user has access to this business
    const hasAccess = await verifyUserAccess(user.id, business_id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to this business' }, { status: 403 });
    }

    return syncXeroData(business_id);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}