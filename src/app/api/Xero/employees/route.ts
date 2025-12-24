import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface XeroEmployee {
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  job_title?: string;
  start_date?: string;
  termination_date?: string;
  annual_salary?: number;
  hourly_rate?: number;
  employment_type?: 'FULLTIME' | 'PARTTIME' | 'CASUAL' | 'CONTRACTOR';
  is_active: boolean;
  email?: string;
  from_xero: boolean;
}

async function refreshTokenIfNeeded(connection: any): Promise<string | null> {
  const now = new Date();
  const expiry = new Date(connection.expires_at);

  console.log('[Xero Employees] Token check - now:', now.toISOString(), 'expiry:', expiry.toISOString());

  const decryptedAccessToken = decrypt(connection.access_token);
  const decryptedRefreshToken = decrypt(connection.refresh_token);

  // Add 1 minute buffer before expiry to avoid edge cases
  const bufferTime = new Date(expiry.getTime() - 60000);

  // If token hasn't expired (with buffer), return it
  if (bufferTime > now) {
    console.log('[Xero Employees] Using existing token (not expired)');
    return decryptedAccessToken;
  }

  console.log('[Xero Employees] Token expired or expiring soon, refreshing...');

  // Refresh the token
  const refreshResponse = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(
        `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
      ).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptedRefreshToken
    })
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    console.error('[Xero Employees] Token refresh failed:', refreshResponse.status, errorText);

    // Mark connection as inactive if refresh fails
    await supabase
      .from('xero_connections')
      .update({ is_active: false })
      .eq('id', connection.id);

    console.error('[Xero Employees] Connection marked as inactive - user needs to reconnect');
    return null;
  }

  const tokens = await refreshResponse.json();
  console.log('[Xero Employees] Token refresh successful, new expiry in', tokens.expires_in, 'seconds');

  // Update tokens in database
  const newExpiry = new Date();
  newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

  const { error: updateError } = await supabase
    .from('xero_connections')
    .update({
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
      expires_at: newExpiry.toISOString()
    })
    .eq('id', connection.id);

  if (updateError) {
    console.error('[Xero Employees] Failed to save refreshed tokens:', updateError);
  } else {
    console.log('[Xero Employees] Refreshed tokens saved, new expiry:', newExpiry.toISOString());
  }

  return tokens.access_token;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const business_id = searchParams.get('business_id');
    const include_terminated = searchParams.get('include_terminated') === 'true';

    if (!business_id) {
      return NextResponse.json(
        { error: 'business_id is required' },
        { status: 400 }
      );
    }

    // Get the Xero connection
    const { data: connection, error: connError } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'No active Xero connection found', connected: false },
        { status: 404 }
      );
    }

    // Get a valid access token
    const accessToken = await refreshTokenIfNeeded(connection);

    if (!accessToken) {
      return NextResponse.json(
        {
          error: 'Xero connection expired. Please reconnect Xero from the Integrations page.',
          expired: true
        },
        { status: 401 }
      );
    }

    // Fetch employees from Xero Payroll API (AU)
    // Note: Xero has different payroll APIs for different regions
    // We're using the Australian payroll API v1.0
    console.log('[Xero Employees] Fetching employees from Xero Payroll AU...');
    console.log('[Xero Employees] Tenant ID:', connection.tenant_id);

    const employeesResponse = await fetch(
      'https://api.xero.com/payroll.xro/1.0/Employees',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': connection.tenant_id,
          'Accept': 'application/json'
        }
      }
    );

    console.log('[Xero Employees] Response status:', employeesResponse.status);

    if (!employeesResponse.ok) {
      const errorText = await employeesResponse.text();
      console.error('[Xero Employees] Failed to fetch employees:', employeesResponse.status);
      console.error('[Xero Employees] Error response:', errorText);

      // Handle various error cases
      if (employeesResponse.status === 401) {
        // 401 usually means: payroll scopes not authorized
        // User needs to disconnect and reconnect Xero to authorize payroll
        console.log('[Xero Employees] 401 error - Payroll scopes likely not authorized');
        console.log('[Xero Employees] User should reconnect Xero to authorize payroll access');
        return NextResponse.json({
          success: true,
          employees: [],
          payroll_available: false,
          needs_reconnect: true,
          message: 'Payroll access not authorized. Please disconnect and reconnect Xero from the Integrations page to grant payroll access.'
        });
      }

      // If payroll API not available (403/404)
      if (employeesResponse.status === 403 || employeesResponse.status === 404) {
        console.log('[Xero Employees] Payroll API not available for this org');
        return NextResponse.json({
          success: true,
          employees: [],
          payroll_available: false,
          message: 'Xero Payroll is not enabled for this organization. You can still manually add team members.'
        });
      }

      return NextResponse.json(
        { error: 'Failed to fetch employees from Xero', details: errorText },
        { status: employeesResponse.status }
      );
    }

    const employeesData = await employeesResponse.json();
    console.log('[Xero Employees] Raw response:', JSON.stringify(employeesData).substring(0, 500));

    const employees: XeroEmployee[] = [];

    // Parse Xero Payroll AU employee response
    if (employeesData?.Employees) {
      for (const emp of employeesData.Employees) {
        // Check if employee is terminated
        const isTerminated = emp.Status === 'TERMINATED' || emp.TerminationDate;

        // Skip terminated employees unless requested
        if (isTerminated && !include_terminated) {
          continue;
        }

        // Get salary information - need to fetch individual employee details
        let annualSalary: number | undefined;
        let hourlyRate: number | undefined;
        let employmentType: XeroEmployee['employment_type'];

        // Fetch detailed employee info including pay template
        try {
          const detailResponse = await fetch(
            `https://api.xero.com/payroll.xro/1.0/Employees/${emp.EmployeeID}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'xero-tenant-id': connection.tenant_id,
                'Accept': 'application/json'
              }
            }
          );

          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            const employeeDetail = detailData?.Employees?.[0];

            if (employeeDetail) {
              // Parse employment type
              if (employeeDetail.EmploymentType) {
                employmentType = employeeDetail.EmploymentType.toUpperCase() as XeroEmployee['employment_type'];
              }

              // Get salary from pay template
              const payTemplate = employeeDetail.PayTemplate;
              if (payTemplate?.EarningsLines) {
                for (const line of payTemplate.EarningsLines) {
                  // Look for ordinary earnings (base salary)
                  if (line.EarningsRateID && line.AnnualSalary) {
                    annualSalary = parseFloat(line.AnnualSalary);
                  } else if (line.RatePerUnit) {
                    hourlyRate = parseFloat(line.RatePerUnit);
                  }
                }
              }
            }
          }
        } catch (detailError) {
          console.error(`[Xero Employees] Failed to fetch details for ${emp.EmployeeID}:`, detailError);
        }

        employees.push({
          employee_id: emp.EmployeeID,
          first_name: emp.FirstName || '',
          last_name: emp.LastName || '',
          full_name: `${emp.FirstName || ''} ${emp.LastName || ''}`.trim(),
          job_title: emp.JobTitle || emp.Title || undefined,
          start_date: emp.StartDate ? new Date(emp.StartDate).toISOString().split('T')[0] : undefined,
          termination_date: emp.TerminationDate ? new Date(emp.TerminationDate).toISOString().split('T')[0] : undefined,
          annual_salary: annualSalary,
          hourly_rate: hourlyRate,
          employment_type: employmentType,
          is_active: !isTerminated,
          email: emp.Email || undefined,
          from_xero: true
        });
      }
    }

    console.log(`[Xero Employees] Found ${employees.length} employees`);

    // Sort by name
    employees.sort((a, b) => a.full_name.localeCompare(b.full_name));

    return NextResponse.json({
      success: true,
      employees,
      count: employees.length,
      payroll_available: true
    });

  } catch (error) {
    console.error('[Xero Employees] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}
