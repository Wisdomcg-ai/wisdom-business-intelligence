import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { resolveXeroBusinessId } from '@/lib/utils/resolve-xero-business-id';
// Phase 52 (XERO-S4-01..04): mapping helpers extracted to a pure module so
// the route + wizard first-load + Plan 52-01 import modal all share one
// canonical Xero-→-wizard mapping path.
import {
  mapXeroPayrollCalendarToFrequency,
  normaliseXeroEmployment,
  extractCompensationFromPayTemplate,
} from '@/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping';

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

// Phase 52 (XERO-S4-01..04): EMPLOYMENT_TYPE_MAP removed; replaced by
// `normaliseXeroEmployment` in src/app/finances/forecast/components/wizard-v4/
// utils/xero-payroll-mapping.ts. The previous map was keyed off the wrong
// JSON field (`EmploymentType` instead of `EmploymentBasis` — see
// 52-RESEARCH.md Pitfall 2). The helper now reads EmploymentBasis with
// EmploymentType fallback for backward safety.

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
  hours_per_week?: number;
  employment_type?: string;
  is_active: boolean;
  email?: string;
  from_xero: boolean;
  // Phase 52 (XERO-S4-02): pay frequency derived from joining
  // Employee.PayrollCalendarID against the tenant's PayrollCalendars list.
  pay_frequency?: 'weekly' | 'fortnightly' | 'monthly';
  // Phase 52 (XERO-S4-03): hours per pay period from PayTemplate.EarningsLines
  // (when populated) falling back to Employee.OrdinaryHoursPerWeek.
  standard_hours?: number;
  // Phase 52 (XERO-S4-04): branch hint for the import modal UI — does the
  // employee's pay derive from a unit rate (hourly) or an annual salary?
  calculation_type?: 'hourly' | 'salaried';
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

    // Get the Xero connection — try all ID formats directly
    let connection: any = null;

    // Try 1: direct match
    const { data: conn1 } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conn1) connection = conn1;

    // Try 2: resolve businesses.id → business_profiles.id
    if (!connection) {
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('business_id', business_id)
        .maybeSingle();
      if (profile?.id) {
        const { data: conn2 } = await supabase
          .from('xero_connections')
          .select('*')
          .eq('business_id', profile.id)
          .eq('is_active', true)
          .maybeSingle();
        if (conn2) connection = conn2;
      }
    }

    // Try 3: resolve business_profiles.id → businesses.id
    if (!connection) {
      const { data: bp } = await supabase
        .from('business_profiles')
        .select('business_id')
        .eq('id', business_id)
        .maybeSingle();
      if (bp?.business_id) {
        const { data: conn3 } = await supabase
          .from('xero_connections')
          .select('*')
          .eq('business_id', bp.business_id)
          .eq('is_active', true)
          .maybeSingle();
        if (conn3) connection = conn3;
      }
    }

    // Try 4: just find ANY active connection for this business by scanning
    if (!connection) {
      const { data: allActive } = await supabase
        .from('xero_connections')
        .select('*')
        .eq('is_active', true);
      // Check if any connection's business_id resolves to our business
      if (allActive) {
        for (const conn of allActive) {
          if (conn.business_id === business_id) { connection = conn; break; }
          // Check if conn.business_id is a profile ID for our business
          const { data: p } = await supabase
            .from('business_profiles')
            .select('business_id')
            .eq('id', conn.business_id)
            .maybeSingle();
          if (p?.business_id === business_id) { connection = conn; break; }
        }
      }
    }

    console.log('[Xero Employees] Connection lookup:', { business_id, found: !!connection, connBizId: connection?.business_id });

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Xero connection found', connected: false },
        { status: 404 }
      );
    }

    // Get a valid access token using the robust token manager
    const tokenResult = await getValidAccessToken(connection, supabase);

    if (!tokenResult.success) {
      console.error('[Xero Employees] Token refresh failed:', tokenResult.error, tokenResult.message);

      // If the token-manager flagged the connection for deactivation (e.g. refresh
      // token expired beyond Xero's 60-day window), actually deactivate it here so
      // future requests stop picking it up. Without this the dead connection stays
      // is_active=true and competes with the user's reconnected fresh row in the
      // Try-N connection lookup.
      //
      // Phase 53-05: Sentry capture is centralized in token-manager.ts; do NOT add a second capture here.
      // The token-manager already fired Sentry.captureMessage('Xero connection
      // deactivated', { tags: { invariant: 'xero_connection_deactivated', ... } })
      // before returning shouldDeactivate=true. Adding another capture here would
      // double-report the same root cause and violate the "exactly ONE event per
      // failure" invariant in 53-05-PLAN.md must_haves.truths[2]. The DB write
      // below is harmless (idempotent — token-manager already wrote is_active=false).
      if (tokenResult.shouldDeactivate && connection?.id) {
        console.log('[Xero Employees] Deactivating connection with permanent token error:', connection.id);
        await supabase
          .from('xero_connections')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', connection.id);
      }

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

    // Phase 52 (XERO-S4-02): fetch all PayrollCalendars for the tenant once
    // and build a Map<PayrollCalendarID, CalendarType> for join lookup. Single
    // request per import (typically 1-3 calendars per tenant). Failure is
    // non-fatal — pay_frequency just stays undefined and the wizard falls
    // back to its default. See 52-RESEARCH.md "Pitfall 3" for why we fetch
    // once and join in-memory rather than per-employee.
    const calendarById = new Map<string, string>();
    try {
      const calendarsResponse = await fetch(
        'https://api.xero.com/payroll.xro/1.0/PayrollCalendars',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json',
          },
        }
      );
      if (calendarsResponse.ok) {
        const calendarsData = await calendarsResponse.json();
        for (const cal of calendarsData?.PayrollCalendars ?? []) {
          if (cal.PayrollCalendarID && cal.CalendarType) {
            calendarById.set(cal.PayrollCalendarID, cal.CalendarType);
          }
        }
        console.log('[Xero Employees] Loaded', calendarById.size, 'payroll calendars');
      } else {
        console.warn('[Xero Employees] PayrollCalendars fetch failed:', calendarsResponse.status);
      }
    } catch (calErr) {
      console.warn('[Xero Employees] PayrollCalendars fetch threw:', calErr);
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
        let hoursPerWeek: number | undefined;
        let employmentType: string | undefined;
        let standardHours: number | undefined;
        let calculationType: 'hourly' | 'salaried' | undefined;
        let payFrequency: 'weekly' | 'fortnightly' | 'monthly' | undefined;

        // Fetch detailed employee info including pay template.
        // N+1 LIMITATION (documented, NOT refactored): /Employees/{id} is called
        // once per employee. The Xero AU bulk /Employees endpoint does NOT include
        // PayTemplate in the list response, so the N+1 is inherent to the API,
        // not the code. For a 30-person tenant this is 1 + 30 + 1 = 32 requests,
        // well under Xero's 60/min and 5000/day caps. See 52-RESEARCH.md
        // "Rate limit math" for the full analysis. Refactor deferred to a future
        // plan if/when Xero adds a bulk-with-PayTemplate endpoint.
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
              // Phase 52 (XERO-S4-01..04): use shared mapping helpers.
              // EmploymentBasis is the correct AU JSON field name (see
              // 52-RESEARCH.md Pitfall 2). EmploymentType fallback preserves
              // backward compat for any tenant where the legacy field is what
              // the Xero response actually carries.
              const empBasis = employeeDetail.EmploymentBasis ?? employeeDetail.EmploymentType;
              employmentType = normaliseXeroEmployment(empBasis);

              // Extract OrdinaryHoursPerWeek as a parsed number for the helper.
              const ohpwRaw = employeeDetail.OrdinaryHoursPerWeek;
              const ohpwParsed = ohpwRaw != null ? parseFloat(ohpwRaw) : NaN;
              const ohpw = isNaN(ohpwParsed) ? undefined : ohpwParsed;

              // Delegate compensation parsing to the shared helper. Returns
              // { hourlyRate, annualSalary, standardHours, calculationType }
              // — handles salaried (ANNUALSALARY), hourly (USEEARNINGSRATE,
              // ENTEREARNINGSRATE), missing NumberOfUnitsPerWeek fallback,
              // and string-vs-number value normalisation.
              const comp = extractCompensationFromPayTemplate(
                employeeDetail.PayTemplate?.EarningsLines,
                ohpw,
              );
              annualSalary = comp.annualSalary;
              hourlyRate = comp.hourlyRate;
              standardHours = comp.standardHours;
              hoursPerWeek = comp.standardHours ?? ohpw;
              calculationType = comp.calculationType;

              // Phase 52 (XERO-S4-02): join Employee.PayrollCalendarID against
              // the calendarById map built before the loop.
              const payrollCalendarID = employeeDetail.PayrollCalendarID;
              const calendarType = payrollCalendarID
                ? calendarById.get(payrollCalendarID)
                : undefined;
              payFrequency = mapXeroPayrollCalendarToFrequency(calendarType);
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
          hours_per_week: hoursPerWeek,
          employment_type: employmentType,
          is_active: !isTerminated,
          email: emp.Email || undefined,
          from_xero: true,
          // Phase 52 (XERO-S4-02..04) — new fields consumed by Plan 52-01 UI.
          pay_frequency: payFrequency,
          standard_hours: standardHours,
          calculation_type: calculationType,
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
