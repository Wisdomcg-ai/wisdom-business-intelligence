/**
 * Phase 52-00 Task 2 RED:
 *   ALL tests fail on HEAD because the /api/Xero/employees route does not yet:
 *     - fetch /PayrollCalendars and join CalendarType → pay_frequency
 *     - read EmploymentBasis (currently reads EmploymentType which is the wrong
 *       AU JSON field name — see 52-RESEARCH.md Pitfall 2)
 *     - return standard_hours / calculation_type fields
 *   Becomes GREEN in Task 4 once the route is extended.
 *
 * Tests use mocked global.fetch + mocked supabase + mocked token-manager;
 * no live Xero tenant access. No skip-on-no-credentials gate needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Module mocks (must be declared before importing the route) ──────────────

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({
    success: true,
    accessToken: 'access-token-mock',
  })),
}));

vi.mock('@/lib/utils/resolve-xero-business-id', () => ({
  resolveXeroBusinessId: vi.fn(async (id: string) => id),
}));

// Module-level Supabase client (`const supabase = createClient(...)`) — mock
// `@supabase/supabase-js` to return a stub whose `.from('xero_connections')`
// chain resolves to a single active connection.
const FAKE_CONNECTION = {
  id: 'conn-1',
  business_id: 'biz-1',
  tenant_id: 'tenant-1',
  is_active: true,
  access_token: 'enc-tok',
  refresh_token: 'enc-refresh',
  updated_at: new Date().toISOString(),
};

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string): any => {
    const ctx: any = { _table: table };
    ctx.select = () => ctx;
    ctx.eq = () => ctx;
    ctx.order = () => ctx;
    ctx.limit = () => ctx;
    ctx.update = () => Promise.resolve({ data: null, error: null });
    ctx.maybeSingle = async () => {
      if (table === 'xero_connections') return { data: FAKE_CONNECTION, error: null };
      return { data: null, error: null };
    };
    ctx.then = (resolve: any, reject: any) => {
      if (table === 'xero_connections') {
        return Promise.resolve({ data: [FAKE_CONNECTION], error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    };
    return ctx;
  };
  return {
    createClient: () => ({ from: builder }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeJsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as any;
}

function makeRequest(url = 'http://test.local/api/Xero/employees?business_id=biz-1') {
  return new NextRequest(url);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/Xero/employees — PayrollCalendars join + new fields', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
  });

  it('Test A — fetches PayrollCalendars first, then joins CalendarType to populate pay_frequency + standard_hours + calculation_type', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      // 1. /PayrollCalendars
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-fortnight', CalendarType: 'FORTNIGHTLY', Name: 'Fortnightly' },
        ],
      }))
      // 2. /Employees list
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-1', FirstName: 'Pat', LastName: 'Test', Status: 'ACTIVE' },
        ],
      }))
      // 3. /Employees/emp-1 detail
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-1',
          PayrollCalendarID: 'cal-fortnight',
          EmploymentBasis: 'FULLTIME',
          OrdinaryHoursPerWeek: '38',
          PayTemplate: {
            EarningsLines: [
              { EarningsRateID: 'er-1', CalculationType: 'ANNUALSALARY', AnnualSalary: '98000' },
            ],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.employees).toHaveLength(1);
    const e = data.employees[0];
    expect(e.pay_frequency).toBe('fortnightly');
    expect(e.standard_hours).toBe(38);
    expect(e.calculation_type).toBe('salaried');
    expect(e.annual_salary).toBe(98000);
    expect(e.employment_type).toBe('full-time');

    // Verify call order: PayrollCalendars first, then Employees, then Employees/{id}
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('/PayrollCalendars');
    expect(urls[1]).toContain('/Employees');
    expect(urls[1]).not.toContain('/Employees/emp-1');
    expect(urls[2]).toContain('/Employees/emp-1');
  });

  it('Test B — reads EmploymentBasis (not EmploymentType) when both differ', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({ PayrollCalendars: [] }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-2', FirstName: 'Sam', LastName: 'Casual', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-2',
          // EmploymentBasis is the correct AU JSON field — should win.
          EmploymentBasis: 'CASUAL',
          // EmploymentType set to a different value (the SDK's other-meaning enum).
          // Existing route reads this field — it would map to 'full-time' fallback.
          EmploymentType: 'EMPLOYEE',
          OrdinaryHoursPerWeek: '20',
          PayTemplate: { EarningsLines: [] },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    const data: any = await res.json();
    expect(data.employees[0].employment_type).toBe('casual');
  });

  it('Test C — falls back to EmploymentType when EmploymentBasis is missing', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({ PayrollCalendars: [] }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-3', FirstName: 'Pat', LastName: 'Part', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-3',
          // EmploymentBasis missing — fallback to legacy EmploymentType field.
          EmploymentType: 'PARTTIME',
          OrdinaryHoursPerWeek: '20',
          PayTemplate: { EarningsLines: [] },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    const data: any = await res.json();
    expect(data.employees[0].employment_type).toBe('part-time');
  });

  it('Test D — PayrollCalendars failure is non-fatal; employees still returned with undefined pay_frequency', async () => {
    vi.spyOn(global, 'fetch')
      // PayrollCalendars returns 500 — must be tolerated
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }) as any)
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-4', FirstName: 'Joe', LastName: 'NoCal', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-4',
          PayrollCalendarID: 'cal-missing',
          EmploymentBasis: 'FULLTIME',
          OrdinaryHoursPerWeek: '38',
          PayTemplate: {
            EarningsLines: [
              { EarningsRateID: 'er-x', CalculationType: 'ANNUALSALARY', AnnualSalary: '98000' },
            ],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.employees[0].pay_frequency).toBeUndefined();
    expect(data.employees[0].annual_salary).toBe(98000);
  });

  it('Test E — hourly employee yields hourly_rate + standard_hours + calculation_type=hourly', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-weekly', CalendarType: 'WEEKLY' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-5', FirstName: 'Bea', LastName: 'Hourly', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-5',
          PayrollCalendarID: 'cal-weekly',
          EmploymentBasis: 'CASUAL',
          OrdinaryHoursPerWeek: '20',
          PayTemplate: {
            EarningsLines: [{
              EarningsRateID: 'er-h',
              CalculationType: 'USEEARNINGSRATE',
              RatePerUnit: '45.00',
              NumberOfUnitsPerWeek: '20',
            }],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    const data: any = await res.json();
    const e = data.employees[0];
    expect(e.hourly_rate).toBe(45);
    expect(e.standard_hours).toBe(20);
    expect(e.calculation_type).toBe('hourly');
    expect(e.annual_salary).toBeUndefined();
    expect(e.pay_frequency).toBe('weekly');
  });
});
