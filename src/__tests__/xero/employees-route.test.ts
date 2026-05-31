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

vi.mock('@/lib/business/resolveXeroBusinessId', () => ({
  resolveXeroBusinessId: vi.fn(async (id: string) => id),
}));

// R24 (SEC-N1): the route now requires an authenticated user with access to
// the requested business. Default both mocks to the happy path (authed user +
// access granted) so the existing payroll-mapping tests below exercise the
// data path unchanged. The auth-gate tests at the bottom override these.
const mockGetUser = vi.fn(
  async (): Promise<{ data: { user: { id: string } | null }; error: null }> => ({
    data: { user: { id: 'user-1' } },
    error: null,
  })
);
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockVerifyBusinessAccess = vi.fn(async (..._args: any[]) => true);
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
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
    // R24: clear accumulated call history, then re-establish auth-gate defaults
    // after restoreAllMocks() so each data-path test sees an authenticated user
    // with access granted and a clean per-test call count.
    mockGetUser.mockReset();
    mockVerifyBusinessAccess.mockReset();
    mockGetUser.mockImplementation(async () => ({
      data: { user: { id: 'user-1' } },
      error: null,
    }));
    mockVerifyBusinessAccess.mockImplementation(async () => true);
  });

  it('Test A — fetches PayrollCalendars first, then PayRuns list, then joins CalendarType to populate pay_frequency + standard_hours + calculation_type', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      // 1. /PayrollCalendars
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-fortnight', CalendarType: 'FORTNIGHTLY', Name: 'Fortnightly' },
        ],
      }))
      // 1b. Phase 54-01 — /PayRuns list (empty: aggregator short-circuits silently)
      .mockResolvedValueOnce(makeJsonResponse({ PayRuns: [] }))
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

    // Verify call order: PayrollCalendars → PayRuns list → Employees → Employees/{id}
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('/PayrollCalendars');
    expect(urls[1]).toContain('/PayRuns');
    expect(urls[2]).toContain('/Employees');
    expect(urls[2]).not.toContain('/Employees/emp-1');
    expect(urls[3]).toContain('/Employees/emp-1');
  });

  it('Test B — reads EmploymentBasis (not EmploymentType) when both differ', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({ PayrollCalendars: [] }))
      // Phase 54-01 — empty PayRuns list short-circuits the aggregator.
      .mockResolvedValueOnce(makeJsonResponse({ PayRuns: [] }))
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
      // Phase 54-01 — empty PayRuns list short-circuits the aggregator.
      .mockResolvedValueOnce(makeJsonResponse({ PayRuns: [] }))
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
      // Phase 54-01 — empty PayRuns list short-circuits the aggregator.
      .mockResolvedValueOnce(makeJsonResponse({ PayRuns: [] }))
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
      // Phase 54-01 — empty PayRuns list short-circuits the aggregator.
      .mockResolvedValueOnce(makeJsonResponse({ PayRuns: [] }))
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

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 54-01 — PayRun-history derivation cases (F–J)
  // ──────────────────────────────────────────────────────────────────────────

  it('Test F — ENTEREARNINGSRATE happy path: derives hours_per_week + annual_salary from PayRun aggregate; DRAFT runs ignored', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      // PayrollCalendars
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-fortnight', CalendarType: 'FORTNIGHTLY' },
        ],
      }))
      // PayRuns list — 4 POSTED + 1 DRAFT (DRAFT must be filtered)
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [
          { PayRunID: 'pr-1', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-fortnight' },
          { PayRunID: 'pr-2', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-fortnight' },
          { PayRunID: 'pr-3', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-fortnight' },
          { PayRunID: 'pr-4', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-fortnight' },
          { PayRunID: 'draft-id', PayRunStatus: 'DRAFT', PayrollCalendarID: 'cal-fortnight' },
        ],
      }))
      // PayRun details × 4 (one payslip each, EmployeeID emp-jds, Wages 6339)
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-1',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-fortnight',
          Payslips: [{ EmployeeID: 'emp-jds', PayslipID: 'ps-1', FirstName: 'Alex', LastName: 'Howard', Wages: 6339, Tax: 1756, Super: 760.68, NetPay: 4583 }],
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-2',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-fortnight',
          Payslips: [{ EmployeeID: 'emp-jds', PayslipID: 'ps-2', FirstName: 'Alex', LastName: 'Howard', Wages: 6339, Tax: 1756, Super: 760.68, NetPay: 4583 }],
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-3',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-fortnight',
          Payslips: [{ EmployeeID: 'emp-jds', PayslipID: 'ps-3', FirstName: 'Alex', LastName: 'Howard', Wages: 6339, Tax: 1756, Super: 760.68, NetPay: 4583 }],
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-4',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-fortnight',
          Payslips: [{ EmployeeID: 'emp-jds', PayslipID: 'ps-4', FirstName: 'Alex', LastName: 'Howard', Wages: 6339, Tax: 1756, Super: 760.68, NetPay: 4583 }],
        }],
      }))
      // Employees list
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-jds', FirstName: 'Alex', LastName: 'Howard', Status: 'ACTIVE' },
        ],
      }))
      // Employees/emp-jds detail — ENTEREARNINGSRATE, no NumberOfUnitsPerWeek, no AnnualSalary
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-jds',
          PayrollCalendarID: 'cal-fortnight',
          EmploymentBasis: 'FULLTIME',
          // OrdinaryHoursPerWeek deliberately omitted — mimics JDS reality
          PayTemplate: {
            EarningsLines: [{
              EarningsRateID: 'er-jds',
              CalculationType: 'ENTEREARNINGSRATE',
              RatePerUnit: '84.52',
            }],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.employees).toHaveLength(1);
    const e = data.employees[0];
    expect(e.hourly_rate).toBe(84.52);
    expect(e.hours_per_week).toBeDefined();
    expect(Math.abs(e.hours_per_week - 37.5)).toBeLessThanOrEqual(0.05);
    expect(e.standard_hours).toBeDefined();
    expect(Math.abs(e.standard_hours - 37.5)).toBeLessThanOrEqual(0.05);
    expect(e.annual_salary).toBe(164814);
    expect(e.calculation_type).toBe('hourly');
    expect(e.pay_frequency).toBe('fortnightly');
    expect(e.derived_from).toBe('payrun_history');

    // DRAFT pay run must NOT have been fetched
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes('/PayRuns/draft-id')).length).toBe(0);
  });

  it('Test G — PayTemplate AnnualSalary WINS over PayRun derivation (no override)', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-fortnight', CalendarType: 'FORTNIGHTLY' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [
          { PayRunID: 'pr-1', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-fortnight' },
        ],
      }))
      // One POSTED detail with Wages=10000 — would derive 10000*26 = 260000
      // if precedence were broken.
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-1',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-fortnight',
          Payslips: [{ EmployeeID: 'emp-sal', PayslipID: 'ps-1', FirstName: 'Sal', LastName: 'Aried', Wages: 10000, Tax: 0, Super: 0, NetPay: 10000 }],
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-sal', FirstName: 'Sal', LastName: 'Aried', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-sal',
          PayrollCalendarID: 'cal-fortnight',
          EmploymentBasis: 'FULLTIME',
          OrdinaryHoursPerWeek: '38',
          PayTemplate: {
            EarningsLines: [
              { EarningsRateID: 'er-s', CalculationType: 'ANNUALSALARY', AnnualSalary: '120000' },
            ],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    const data: any = await res.json();
    const e = data.employees[0];
    // PayTemplate value WINS — not 260000 from derivation.
    expect(e.annual_salary).toBe(120000);
    expect(e.standard_hours).toBe(38);
    expect(e.calculation_type).toBe('salaried');
    // No derivation contributed because nothing was undefined.
    expect(e.derived_from).toBe('paytemplate');
  });

  it('Test H — mixed: PayTemplate supplies hourly_rate + standard_hours; PayRun derives annual_salary only', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-weekly', CalendarType: 'WEEKLY' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [
          { PayRunID: 'pr-1', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-weekly' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-1',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-weekly',
          Payslips: [{ EmployeeID: 'emp-mix', PayslipID: 'ps-1', FirstName: 'Mix', LastName: 'Ed', Wages: 1900, Tax: 0, Super: 0, NetPay: 1900 }],
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-mix', FirstName: 'Mix', LastName: 'Ed', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-mix',
          PayrollCalendarID: 'cal-weekly',
          EmploymentBasis: 'FULLTIME',
          PayTemplate: {
            EarningsLines: [{
              EarningsRateID: 'er-mix',
              CalculationType: 'USEEARNINGSRATE',
              RatePerUnit: '50',
              NumberOfUnitsPerWeek: '38',
            }],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    const data: any = await res.json();
    const e = data.employees[0];
    expect(e.hourly_rate).toBe(50);
    expect(e.standard_hours).toBe(38);
    expect(e.hours_per_week).toBe(38); // PayTemplate-derived, not 1900/50/1=38 derivation (same number)
    // PayTemplate didn't supply annualSalary for hourly → derivation fills it.
    expect(e.annual_salary).toBe(Math.round(1900 * 52)); // 98800
    expect(e.calculation_type).toBe('hourly');
    expect(e.derived_from).toBe('mixed');
  });

  it('Test I — PayRuns 403 (missing payroll history scope) is non-fatal; route returns existing PayTemplate-derived shape', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-fortnight', CalendarType: 'FORTNIGHTLY' },
        ],
      }))
      // PayRuns list returns 403
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }) as any)
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-403', FirstName: 'Far', LastName: 'Bidden', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-403',
          PayrollCalendarID: 'cal-fortnight',
          EmploymentBasis: 'FULLTIME',
          PayTemplate: {
            EarningsLines: [{
              EarningsRateID: 'er-403',
              CalculationType: 'ENTEREARNINGSRATE',
              RatePerUnit: '84.52',
            }],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    const e = data.employees[0];
    expect(e.hourly_rate).toBe(84.52);
    expect(e.hours_per_week).toBeUndefined();
    expect(e.standard_hours).toBeUndefined();
    expect(e.annual_salary).toBeUndefined();
    expect(e.calculation_type).toBe('hourly');
    // hourly_rate + calculation_type came from PayTemplate, so 'paytemplate'.
    expect(e.derived_from).toBe('paytemplate');

    // console.warn should have been called noting the PayRuns failure or 403.
    const warned = warnSpy.mock.calls
      .map((c) => c.map(String).join(' '))
      .join('\n');
    expect(/PayRuns|403/.test(warned)).toBe(true);
  });

  it('Test J — multi-calendar aggregation: per-PayRun calendar lookup picks correct factors per employee', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({
        PayrollCalendars: [
          { PayrollCalendarID: 'cal-weekly', CalendarType: 'WEEKLY' },
          { PayrollCalendarID: 'cal-fortnight', CalendarType: 'FORTNIGHTLY' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [
          { PayRunID: 'pr-w', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-weekly' },
          { PayRunID: 'pr-f', PayRunStatus: 'POSTED', PayrollCalendarID: 'cal-fortnight' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-w',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-weekly',
          Payslips: [{ EmployeeID: 'emp-w', PayslipID: 'ps-w', FirstName: 'Wee', LastName: 'Kly', Wages: 1500, Tax: 0, Super: 0, NetPay: 1500 }],
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        PayRuns: [{
          PayRunID: 'pr-f',
          PayRunStatus: 'POSTED',
          PayrollCalendarID: 'cal-fortnight',
          Payslips: [{ EmployeeID: 'emp-f', PayslipID: 'ps-f', FirstName: 'Fort', LastName: 'Nightly', Wages: 6339, Tax: 0, Super: 0, NetPay: 6339 }],
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [
          { EmployeeID: 'emp-w', FirstName: 'Wee', LastName: 'Kly', Status: 'ACTIVE' },
          { EmployeeID: 'emp-f', FirstName: 'Fort', LastName: 'Nightly', Status: 'ACTIVE' },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-w',
          PayrollCalendarID: 'cal-weekly',
          EmploymentBasis: 'FULLTIME',
          PayTemplate: {
            EarningsLines: [{
              EarningsRateID: 'er-w',
              CalculationType: 'ENTEREARNINGSRATE',
              RatePerUnit: '40',
            }],
          },
        }],
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        Employees: [{
          EmployeeID: 'emp-f',
          PayrollCalendarID: 'cal-fortnight',
          EmploymentBasis: 'FULLTIME',
          PayTemplate: {
            EarningsLines: [{
              EarningsRateID: 'er-f',
              CalculationType: 'ENTEREARNINGSRATE',
              RatePerUnit: '84.52',
            }],
          },
        }],
      }));

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    const data: any = await res.json();
    expect(data.employees).toHaveLength(2);
    const byId: Record<string, any> = Object.fromEntries(
      data.employees.map((e: any) => [e.employee_id, e]),
    );

    // Weekly: 1500/40/1 = 37.5; 1500*52 = 78000
    expect(Math.abs(byId['emp-w'].hours_per_week - 37.5)).toBeLessThanOrEqual(0.05);
    expect(byId['emp-w'].annual_salary).toBe(78000);
    expect(byId['emp-w'].pay_frequency).toBe('weekly');
    expect(byId['emp-w'].derived_from).toBe('payrun_history');

    // Fortnightly: 6339/84.52/2 ≈ 37.5; 6339*26 = 164814
    expect(Math.abs(byId['emp-f'].hours_per_week - 37.5)).toBeLessThanOrEqual(0.05);
    expect(byId['emp-f'].annual_salary).toBe(164814);
    expect(byId['emp-f'].pay_frequency).toBe('fortnightly');
    expect(byId['emp-f'].derived_from).toBe('payrun_history');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // R24 (SEC-N1) — auth gate
  //
  // This route returns live Xero payroll PII. Before R24 it was reachable by
  // any unauthenticated caller with a business_id. These tests lock the gate:
  //   - no authenticated user → 401, no Xero fetch attempted
  //   - authenticated but no access to the business → 403, no Xero fetch
  //   - the data-path tests above implicitly cover the authed+access case.
  // ──────────────────────────────────────────────────────────────────────────

  it('Test K — returns 401 and fetches nothing when there is no authenticated user', async () => {
    mockGetUser.mockImplementation(async () => ({
      data: { user: null },
      error: null,
    }));
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockVerifyBusinessAccess).not.toHaveBeenCalled();
  });

  it('Test L — returns 403 and fetches nothing when the user lacks access to the business', async () => {
    mockVerifyBusinessAccess.mockImplementation(async () => false);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockVerifyBusinessAccess).toHaveBeenCalledWith('user-1', 'biz-1');
  });

  it('Test M — still 400 (no auth work) when business_id is absent', async () => {
    const { GET } = await import('@/app/api/Xero/employees/route');
    const res = await GET(makeRequest('http://test.local/api/Xero/employees'));
    expect(res.status).toBe(400);
    // The presence check runs before the auth gate, so no access check fires.
    expect(mockVerifyBusinessAccess).not.toHaveBeenCalled();
  });
});
