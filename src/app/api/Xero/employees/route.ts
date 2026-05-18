import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { getValidAccessToken } from '@/lib/xero/token-manager';
import { resolveXeroBusinessId } from '@/lib/utils/resolve-xero-business-id';
// Phase 52 (XERO-S4-01..04): mapping helpers extracted to a pure module so
// the route + wizard first-load + Plan 52-01 import modal all share one
// canonical Xero-→-wizard mapping path.
import {
  mapXeroPayrollCalendarToFrequency,
  normaliseXeroEmployment,
  extractCompensationFromPayTemplate,
  // Phase 54-01: PayRun-history derivation fallback for ENTEREARNINGSRATE
  // employees whose PayTemplate doesn't carry hours/salary. Helper is pure;
  // period-factor constants are encapsulated inside it.
  deriveHoursAndSalaryFromPayRun,
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

// Module-level supabase client REMOVED: a warm Vercel function instance
// shared the same client across requests, and Next.js's patched fetch was
// memoizing the row-lookup HTTP call against PostgREST. Result: requests
// for ~80s after a disconnect/reconnect cycle saw the OLD (now-deleted)
// xero_connections row instead of the freshly-upserted one — diagnosed via
// production logs showing `connection_id: 110c0074` (deleted) when the DB
// only held `77403edc` (current).
//
// Fix: create the supabase client per-request inside GET(). Each request
// gets a fresh client with no shared fetch dedup state.
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
    {
      auth: { persistSession: false },
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) },
    },
  );
}

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
  // Phase 54-01 (XERO-S4-PAYRUN-01): provenance hint for derived fields.
  //   'paytemplate'    — all populated values came from PayTemplate / OrdinaryHoursPerWeek
  //   'payrun_history' — ≥1 value came from PayRun derivation
  //   'mixed'          — some PayTemplate, some derived
  //   undefined        — nothing was populated at all (empty PayTemplate AND no PayRun history)
  // Optional / additive — Step 4 import path ignores it; future UI can show
  // provenance hints (e.g. "estimated from last 4 pay runs").
  derived_from?: 'paytemplate' | 'payrun_history' | 'mixed';
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

    // Per-request supabase client — see getSupabaseAdmin() comment above for
    // why this can't be module-level.
    const supabase = getSupabaseAdmin();

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

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Employees] Connection lookup:', { business_id, found: !!connection, connBizId: connection?.business_id });
    }

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Xero connection found', connected: false },
        { status: 404 }
      );
    }

    // Get a valid access token using the robust token manager
    const tokenResult = await getValidAccessToken(connection, supabase);

    if (!tokenResult.success) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Xero Employees] Token refresh failed:', tokenResult.error, tokenResult.message);
      }

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
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Xero Employees] Deactivating connection with permanent token error:', connection.id);
        }
        await supabase
          .from('xero_connections')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', connection.id);
      }

      return NextResponse.json(
        {
          error: tokenResult.message || 'Xero connection expired. Please reconnect Xero from the Integrations page.',
          expired: true,
          needsReconnect: tokenResult.shouldDeactivate,
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
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Xero Employees] Loaded', calendarById.size, 'payroll calendars');
        }
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Xero Employees] PayrollCalendars fetch failed:', calendarsResponse.status);
        }
      }
    } catch (calErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Xero Employees] PayrollCalendars fetch threw:', calErr);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Phase 54-01 (XERO-S4-PAYRUN-01) — PayRuns aggregator
    //
    // Fetches the most recent PayRuns (Xero's default page size on the list
    // endpoint), filters to POSTED, takes the last 4, and fetches each
    // detail to build a per-employee aggregate map. Used as a fallback for
    // employees whose PayTemplate doesn't supply hours/salary (the common AU
    // ENTEREARNINGSRATE timesheet-driven setup — see 54-RESEARCH.md §1).
    //
    // Rate-limit math (research §6): 1 list + 4 detail = +5 calls. Total per
    // import ≈ 25 for an 18-employee tenant. Xero limits: 60/min, 5000/day.
    // Comfortable margin.
    //
    // Failure-tolerant: 401/403/404 (no payroll history scope, payroll not
    // enabled, or region with no AU payroll) is logged and skipped — the
    // route still returns the existing PayTemplate-derived shape with
    // hours/salary undefined where they would have been derived.
    //
    // Pitfall (research §10): employees with multiple OrdinaryEarnings lines
    // (e.g. primary trade rate + secondary admin rate). Wages aggregates
    // BOTH; we use the primary line's RatePerUnit, so derived hours may be
    // slightly inflated. Operator can correct in Step 4. Future enhancement:
    // weight by line count.
    //
    // Pitfall (research §10): bonuses/overtime/leave loading inflate Wages
    // for affected periods. Mitigated by 4-period averaging; not eliminated.
    // Acceptable for MVP.
    // ────────────────────────────────────────────────────────────────────────
    interface PayRunAggregate {
      totalWages: number;
      periodCount: number;
      // Calendar resolved from per-PayRun PayrollCalendarID join. Stores the
      // first non-undefined calendar we see for an employee — pay calendars
      // don't change run-to-run for a single employee in normal operation. If
      // an employee DOES switch calendars mid-window (rare), derivation uses
      // the earlier calendar's factors, which may produce slightly inflated /
      // deflated hours. Acceptable for MVP per F1 in 54-01-PLAN-CHECK.md;
      // operator can correct in Step 4.
      calendarType: string | undefined;
    }
    const payrunAggregateByEmployeeId = new Map<string, PayRunAggregate>();

    try {
      const payrunsListResponse = await fetch(
        'https://api.xero.com/payroll.xro/1.0/PayRuns?order=PayRunPeriodEndDate%20DESC',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json',
          },
        }
      );
      if (payrunsListResponse.ok) {
        const payrunsListData = await payrunsListResponse.json();
        const allPayRuns: any[] = payrunsListData?.PayRuns ?? [];
        // Filter: POSTED only — DRAFT runs aren't real payroll data
        // (research §5).
        const postedPayRuns = allPayRuns.filter((pr) => pr.PayRunStatus === 'POSTED');
        // Take the last 4 most recent. List is already sorted DESC by
        // PayRunPeriodEndDate via the order= query param above.
        const recentPayRuns = postedPayRuns.slice(0, 4);
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            '[Xero Employees] PayRuns: fetched', allPayRuns.length, 'total,',
            postedPayRuns.length, 'posted, using', recentPayRuns.length, 'most recent'
          );
        }

        // Sequential detail fetches (research §7 — parallel would risk
        // rate-limit pressure spikes; 4 sequential is well within budget).
        for (const pr of recentPayRuns) {
          try {
            const detailResponse = await fetch(
              `https://api.xero.com/payroll.xro/1.0/PayRuns/${pr.PayRunID}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'xero-tenant-id': connection.tenant_id,
                  'Accept': 'application/json',
                },
              }
            );
            if (!detailResponse.ok) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn(
                  '[Xero Employees] PayRun detail fetch failed:',
                  pr.PayRunID, detailResponse.status
                );
              }
              continue;
            }
            const detailData = await detailResponse.json();
            const detail = detailData?.PayRuns?.[0];
            if (!detail) continue;

            // Per-PayRun calendar lookup. Different employees may be on
            // different pay calendars (e.g. weekly admin vs fortnightly
            // trade) — must use the run's own PayrollCalendarID, NOT a
            // single tenant-wide assumption.
            const runCalendarType = detail.PayrollCalendarID
              ? calendarById.get(detail.PayrollCalendarID)
              : undefined;

            for (const slip of detail.Payslips ?? []) {
              if (!slip.EmployeeID || typeof slip.Wages !== 'number') continue;
              const existing = payrunAggregateByEmployeeId.get(slip.EmployeeID);
              if (existing) {
                existing.totalWages += slip.Wages;
                existing.periodCount += 1;
                if (existing.calendarType == null && runCalendarType != null) {
                  existing.calendarType = runCalendarType;
                }
              } else {
                payrunAggregateByEmployeeId.set(slip.EmployeeID, {
                  totalWages: slip.Wages,
                  periodCount: 1,
                  calendarType: runCalendarType,
                });
              }
            }
          } catch (detailErr) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                '[Xero Employees] PayRun detail fetch threw:',
                pr.PayRunID, detailErr
              );
            }
          }
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            '[Xero Employees] PayRuns: aggregated for',
            payrunAggregateByEmployeeId.size, 'employees'
          );
        }
      } else {
        // 401 (missing scope), 403 (payroll not enabled), 404 (region with
        // no AU payroll) — all non-fatal. Existing PayTemplate path still works.
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[Xero Employees] PayRuns list fetch failed:',
            payrunsListResponse.status
          );
        }
      }
    } catch (prErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Xero Employees] PayRuns aggregator threw:', prErr);
      }
    }

    // Fetch employees from Xero Payroll API (AU)
    // Note: Xero has different payroll APIs for different regions
    // We're using the Australian payroll API v1.0
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Employees] Fetching employees from Xero Payroll AU...');
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Employees] Tenant ID:', connection.tenant_id);
    }

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

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Employees] Response status:', employeesResponse.status);
    }

    if (!employeesResponse.ok) {
      const errorText = await employeesResponse.text();
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Xero Employees] Failed to fetch employees:', employeesResponse.status);
      }
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Xero Employees] Error response:', errorText);
      }

      // Handle various error cases
      if (employeesResponse.status === 401) {
        // 401 usually means: payroll scopes not authorized
        // User needs to disconnect and reconnect Xero to authorize payroll
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Xero Employees] 401 error - Payroll scopes likely not authorized');
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Xero Employees] User should reconnect Xero to authorize payroll access');
        }
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
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Xero Employees] Payroll API not available for this org');
        }
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
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Xero Employees] Raw response:', JSON.stringify(employeesData).substring(0, 500));
    }

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
          if (process.env.NODE_ENV !== 'production') {
            console.error(`[Xero Employees] Failed to fetch details for ${emp.EmployeeID}:`, detailError);
          }
        }

        // ────────────────────────────────────────────────────────────────────
        // Phase 54-01 (XERO-S4-PAYRUN-01) — PayRun-derived fallback
        //
        // Only fires when PayTemplate didn't supply a value (the
        // ENTEREARNINGSRATE case — see 54-RESEARCH.md §1). Salaried employees
        // with PayTemplate.AnnualSalary are NEVER overridden — derivation is
        // applied via per-field `if (X == null && derived.X != null)` guards
        // (the explicit form of `??=`).
        //
        // Provenance ('derived_from'):
        //   - 'payrun_history' — every populated value came from derivation
        //   - 'mixed'          — some PayTemplate, some derived
        //   - 'paytemplate'    — derivation contributed nothing (everything
        //                        already populated, or derivation returned
        //                        nothing for this employee)
        //   - undefined        — nothing populated at all (no PayTemplate
        //                        AND no PayRun history)
        // ────────────────────────────────────────────────────────────────────
        let derivedFrom: 'paytemplate' | 'payrun_history' | 'mixed' | undefined;

        const aggregate = payrunAggregateByEmployeeId.get(emp.EmployeeID);
        // Provenance is computed against the THREE derivable fields only —
        // annualSalary, standardHours, hoursPerWeek. hourlyRate and
        // calculationType are never derived (they come from PayTemplate or
        // not at all), so their provenance doesn't affect the
        // 'mixed' vs 'payrun_history' classification.
        //
        // The 'mixed' case fires when at least one of the three derivable
        // fields came from PayTemplate (e.g. NumberOfUnitsPerWeek was set,
        // giving us standardHours from PayTemplate) AND derivation also
        // contributed (e.g. annualSalary derived for an hourly employee
        // where PayTemplate doesn't carry it).
        const hadPayTemplateDerivableValue =
          annualSalary != null ||
          standardHours != null ||
          hoursPerWeek != null;
        // 'paytemplate' provenance also counts hourlyRate / calculationType
        // since the field is reported when ANY value was populated, even
        // ones that aren't themselves derivable.
        const hadAnyPayTemplateValue =
          hadPayTemplateDerivableValue ||
          calculationType != null ||
          hourlyRate != null;

        if (aggregate && aggregate.periodCount > 0) {
          const avgWagesPerPeriod = aggregate.totalWages / aggregate.periodCount;
          const derived = deriveHoursAndSalaryFromPayRun(
            avgWagesPerPeriod,
            hourlyRate,
            aggregate.calendarType,
          );

          // Apply ONLY to undefined fields. PayTemplate values WIN.
          let appliedAnyDerivation = false;
          if (annualSalary == null && derived.annualSalary != null) {
            annualSalary = derived.annualSalary;
            appliedAnyDerivation = true;
          }
          if (standardHours == null && derived.hoursPerWeek != null) {
            standardHours = derived.hoursPerWeek;
            appliedAnyDerivation = true;
          }
          if (hoursPerWeek == null && derived.hoursPerWeek != null) {
            hoursPerWeek = derived.hoursPerWeek;
            appliedAnyDerivation = true;
          }

          if (appliedAnyDerivation) {
            // 'mixed' only if a DERIVABLE field was already filled by
            // PayTemplate. hourlyRate-only-from-PT alongside derived hours
            // is still 'payrun_history' (the operator-visible
            // hours/salary came from derivation).
            derivedFrom = hadPayTemplateDerivableValue ? 'mixed' : 'payrun_history';
          } else if (hadAnyPayTemplateValue) {
            derivedFrom = 'paytemplate';
          }
          // else: nothing populated at all — leave derivedFrom undefined.
        } else if (hadAnyPayTemplateValue) {
          // No PayRun aggregate for this employee. derivedFrom is
          // 'paytemplate' if anything was populated, otherwise undefined.
          derivedFrom = 'paytemplate';
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
          // Phase 54-01 — provenance hint (additive; existing consumers ignore).
          derived_from: derivedFrom,
        });
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Xero Employees] Found ${employees.length} employees`);
    }

    // Sort by name
    employees.sort((a, b) => a.full_name.localeCompare(b.full_name));

    return NextResponse.json({
      success: true,
      employees,
      count: employees.length,
      payroll_available: true
    });

  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Xero Employees] Error:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}
