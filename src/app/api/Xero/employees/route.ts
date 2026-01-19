import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/xero/token-manager';

export const dynamic = 'force-dynamic';

// Helper to parse Xero's date format: /Date(timestamp+0000)/ or /Date(timestamp)/
function parseXeroDate(dateStr: string | undefined | null): string | undefined {
  if (!dateStr) return undefined;
  try {
    // Match /Date(1234567890000+0000)/ or /Date(1234567890000)/
    const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//);
    if (match) {
      const timestamp = parseInt(match[1], 10);
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    // Try direct parsing as fallback
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Ignore parsing errors
  }
  return undefined;
}

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

    // Get a valid access token using the robust token manager
    const tokenResult = await getValidAccessToken(connection, supabase);

    if (!tokenResult.success) {
      console.error('[Xero Employees] Token refresh failed:', tokenResult.error, tokenResult.message);
      return NextResponse.json(
        {
          error: tokenResult.message || 'Xero connection expired. Please reconnect Xero from the Integrations page.',
          expired: true,
          needsReconnect: tokenResult.shouldDeactivate
        },
        { status: 401 }
      );
    }

    const accessToken = tokenResult.accessToken!;

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
          start_date: parseXeroDate(emp.StartDate),
          termination_date: parseXeroDate(emp.TerminationDate),
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
