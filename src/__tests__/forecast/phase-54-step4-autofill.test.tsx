/**
 * Phase 54 Plan 02 — XERO-S4-AUTOFILL-01 / XERO-S4-AUTOFILL-02
 *
 *   1. Soft auto-fill on truly-empty Step 4 (no team / hires / departures)
 *      with a per-business localStorage sentinel that suppresses re-fire.
 *   2. New-employees banner on subsequent loads (teamMembers.length > 0):
 *      diff fetched employees against wizard `_xeroEmployeeId` provenance,
 *      render a non-blocking banner above the team table when newOnes > 0.
 *
 * RED expectations on HEAD before Task 2 lands:
 *   - Tests 1, 6, 7, 8: auto-fill never fires because the effect doesn't exist
 *     yet → wizard.state.teamMembers stays empty AND localStorage sentinel
 *     is never written.
 *   - Tests 2, 3, 4, 5: gating tests — they assert the effect did NOT fire.
 *     On HEAD they trivially "pass" the no-fire assertion BUT also assert
 *     the sentinel state matches the spec. Tests 3/4/5 assert that NON-empty
 *     wizards never trigger auto-fill, which on HEAD also holds (no effect
 *     at all). To still distinguish HEAD from GREEN, those tests assert the
 *     banner-probe fetch fired (gated on teamMembers.length > 0) — which on
 *     HEAD also doesn't exist, so they fail.
 *   - Tests 9, 10, 11, 12: assert the new-employees banner renders /
 *     dismisses / opens the existing 52-01 modal pre-checked. On HEAD the
 *     banner DOM never appears → screen.findBy* throws.
 *   - Test 13: StrictMode race — the effect-guards (autoFillRef + cancellation)
 *     prevent double-fire under React StrictMode. On HEAD no effect exists,
 *     so the assertion `teamMembers.length === 2` fails (it stays 0).
 *
 * Test pattern: real-hook Step4Harness mirroring phase-52-step4-reimport.
 * Mocked global.fetch via installFetchSequence chains so successive calls to
 * /api/Xero/employees can return different bodies for sentinel-state tests.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step4Team } from '@/app/finances/forecast/components/wizard-v4/steps/Step4Team';
import type {
  TeamMember,
  NewHire,
  Departure,
  ForecastWizardState,
  XeroFieldFingerprint,
} from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = FY_START_YEAR + 1;

type SeedMember = Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>;
type SeedNewHire = Omit<NewHire, 'id' | 'superAmount'>;
type SeedDeparture = Omit<Departure, 'id'>;

// ────────────────────────────────────────────────────────────────────────────
// Canned employee fixtures (mirrors phase-52-step4-reimport).
// ────────────────────────────────────────────────────────────────────────────
const ALICE_BASE = {
  employee_id: 'emp-alice-1',
  full_name: 'Alice Salaried',
  first_name: 'Alice',
  last_name: 'Salaried',
  job_title: 'Manager',
  email: 'alice@example.com',
  pay_frequency: 'fortnightly' as const,
  standard_hours: 38,
  hours_per_week: 38,
  hourly_rate: undefined as number | undefined,
  annual_salary: 98000 as number | undefined,
  employment_type: 'full-time',
  calculation_type: 'salaried' as const,
  is_active: true,
  from_xero: true,
  start_date: '2024-01-15',
};

const BOB_BASE = {
  employee_id: 'emp-bob-2',
  full_name: 'Bob Casual',
  first_name: 'Bob',
  last_name: 'Casual',
  job_title: 'Designer',
  email: 'bob@example.com',
  pay_frequency: 'weekly' as const,
  standard_hours: 20,
  hours_per_week: 20,
  hourly_rate: 45 as number | undefined,
  annual_salary: undefined as number | undefined,
  employment_type: 'casual',
  calculation_type: 'hourly' as const,
  is_active: true,
  from_xero: true,
  start_date: '2024-06-01',
};

const CHARLIE_BASE = {
  employee_id: 'emp-charlie-3',
  full_name: 'Charlie New',
  first_name: 'Charlie',
  last_name: 'New',
  job_title: 'Analyst',
  email: 'charlie@example.com',
  pay_frequency: 'fortnightly' as const,
  standard_hours: 38,
  hours_per_week: 38,
  hourly_rate: undefined as number | undefined,
  annual_salary: 75000 as number | undefined,
  employment_type: 'full-time',
  calculation_type: 'salaried' as const,
  is_active: true,
  from_xero: true,
  start_date: '2024-03-01',
};

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface FetchHarness {
  callCount: number;
  xeroEmployeesCalls: string[];
}

/**
 * Mock fetch with successive /api/Xero/employees responses. Each successive
 * call shifts off the next array. Non-Xero URLs return `{}`.
 *
 * Returns a harness object whose `callCount` reflects how many times
 * /api/Xero/employees was invoked.
 */
function installFetchSequence(employeesByCall: unknown[][]): FetchHarness {
  const harness: FetchHarness = { callCount: 0, xeroEmployeesCalls: [] };
  let idx = 0;
  vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/Xero/employees')) {
      const employees = employeesByCall[Math.min(idx, employeesByCall.length - 1)] ?? [];
      idx++;
      harness.callCount++;
      harness.xeroEmployeesCalls.push(u);
      return makeJsonResponse({
        success: true,
        employees,
        count: employees.length,
        payroll_available: true,
      });
    }
    return makeJsonResponse({});
  });
  return harness;
}

/** Variant: respond with a custom Response per call (for 404 / expired / throw). */
function installCustomFetch(
  responder: (callIdx: number, url: string) => Response | Promise<Response> | never,
): FetchHarness {
  const harness: FetchHarness = { callCount: 0, xeroEmployeesCalls: [] };
  let idx = 0;
  vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/Xero/employees')) {
      const i = idx++;
      harness.callCount++;
      harness.xeroEmployeesCalls.push(u);
      return await responder(i, u);
    }
    return makeJsonResponse({});
  });
  return harness;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

const WIZARD_VERSION = 10; // Must stay in sync with useForecastWizard.ts.

/**
 * Pre-seed localStorage with a wizard state that already contains the given
 * members / hires / departures. This bypasses the post-mount seeding pattern
 * so the wizard's INITIAL render observes the seeded data — critical for
 * 54-02 because the auto-fill effect inspects state.teamMembers.length on
 * the first render.
 */
function prefillWizardStorage(
  businessId: string,
  fiscalYear: number,
  opts: {
    teamMembers?: TeamMember[];
    newHires?: NewHire[];
    departures?: Departure[];
  },
): void {
  const state = {
    wizardVersion: WIZARD_VERSION,
    businessId,
    fiscalYearStart: fiscalYear,
    status: 'draft',
    forecastDuration: 3,
    durationLocked: false,
    currentStep: 1,
    activeYear: 1,
    businessProfile: null,
    goals: {
      year1: { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
      year2: { revenue: 0, grossProfitPct: 52, netProfitPct: 17 },
      year3: { revenue: 0, grossProfitPct: 55, netProfitPct: 20 },
    },
    priorYear: null,
    currentYTD: null,
    revenuePattern: 'seasonal',
    revenueLines: [],
    cogsLines: [],
    teamMembers: opts.teamMembers ?? [],
    newHires: opts.newHires ?? [],
    departures: opts.departures ?? [],
    bonuses: [],
    commissions: [],
    defaultOpExIncreasePct: 3,
    opexLines: [],
    capexItems: [],
    investments: [],
    plannedSpends: [],
    otherExpenses: [],
  };
  const key = `forecast-wizard-v4-${businessId}-${fiscalYear}`;
  window.localStorage.setItem(key, JSON.stringify(state));
}

let nextIdCounter = 1;
function nextId(): string {
  return `seed-${nextIdCounter++}`;
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  nextIdCounter = 1;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// Step4Harness — real-hook pattern. State is seeded UPFRONT via
// prefillWizardStorage (NOT via post-mount actions) so the auto-fill effect
// observes the truly-empty / truly-non-empty signal on the first render.
// ────────────────────────────────────────────────────────────────────────────
function Step4Harness({
  businessId,
  onState,
}: {
  businessId: string;
  onState?: (state: ForecastWizardState) => void;
}) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);

  React.useEffect(() => {
    onState?.(wizard.state);
  }, [wizard.state, onState]);

  return (
    <Step4Team
      state={wizard.state}
      actions={wizard.actions}
      fiscalYear={FISCAL_YEAR_END}
    />
  );
}

/** Convert a SeedMember to a fully-typed TeamMember (assigns id). */
function asTeamMember(seed: SeedMember): TeamMember {
  return { id: nextId(), ...seed } as TeamMember;
}

/** Convert a SeedNewHire to a fully-typed NewHire (assigns id). */
function asNewHire(seed: SeedNewHire): NewHire {
  return { id: nextId(), ...seed } as NewHire;
}

/** Convert a SeedDeparture to a fully-typed Departure (assigns id). */
function asDeparture(seed: SeedDeparture): Departure {
  return { id: nextId(), ...seed } as Departure;
}

// ────────────────────────────────────────────────────────────────────────────
// Test fixtures — seedXeroMember helper for non-empty wizards.
// ────────────────────────────────────────────────────────────────────────────
function seedXeroMember(opts: {
  name: string;
  xeroEmployeeId: string;
  email?: string;
  currentSalary?: number;
  hourlyRate?: number;
  standardHours?: number;
  payFrequency?: 'weekly' | 'fortnightly' | 'monthly';
  fingerprint?: XeroFieldFingerprint;
  role?: string;
  type?: 'full-time' | 'part-time' | 'casual' | 'contractor';
}): SeedMember {
  return {
    name: opts.name,
    role: opts.role ?? 'Engineer',
    type: opts.type ?? 'full-time',
    hoursPerWeek: opts.standardHours ?? 38,
    standardHours: opts.standardHours ?? 38,
    hourlyRate: opts.hourlyRate,
    currentSalary: opts.currentSalary ?? 98000,
    increasePct: 0,
    isFromXero: true,
    payFrequency: opts.payFrequency,
    _xeroEmployeeId: opts.xeroEmployeeId,
    _xeroImportedAt: '2026-04-01T00:00:00.000Z',
    _xeroFingerprint: opts.fingerprint ?? {
      name: opts.name,
      role: opts.role ?? 'Engineer',
      type: opts.type ?? 'full-time',
      payFrequency: opts.payFrequency ?? 'fortnightly',
      standardHours: opts.standardHours ?? 38,
      currentSalary: opts.currentSalary ?? 98000,
    },
  };
}

describe('Phase 54-02 — Soft auto-fill + new-employees banner', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Auto-fill on truly-empty
  // ─────────────────────────────────────────────────────────────────────────

  it('Test 1: Auto-fill fires on first mount when wizard is truly empty AND Xero returns employees', async () => {
    const harness = installFetchSequence([[ALICE_BASE, BOB_BASE]]);
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-af-1"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(
      () => {
        expect(latestState).not.toBeNull();
        const members = latestState!.teamMembers;
        const hires = latestState!.newHires ?? [];
        expect(members.length + hires.length).toBe(2);
      },
      { timeout: 3000 },
    );
    // Both rows carry the import provenance.
    const allXeroIds = [
      ...latestState!.teamMembers.map((m) => m._xeroEmployeeId),
      ...(latestState!.newHires ?? []).map((h) => h._xeroEmployeeId),
    ];
    expect(allXeroIds).toContain('emp-alice-1');
    expect(allXeroIds).toContain('emp-bob-2');
    // Provenance fields populated on every imported row.
    for (const m of latestState!.teamMembers) {
      if (m._xeroEmployeeId) {
        expect(m._xeroFingerprint).toBeTruthy();
        expect(typeof m._xeroImportedAt).toBe('string');
      }
    }
    // Sentinel set.
    expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-1')).toBe('1');
    // Auto-fill fired once, then banner probe fired again after the import
    // transitioned teamMembers.length 0→N (gated re-arm — by design). The
    // banner probe finds all returned employees in knownIds and renders no
    // banner. Total: 2 calls.
    expect(harness.callCount).toBe(2);
    // Banner must NOT render — every fetched employee was just imported.
    expect(screen.queryByRole('button', { name: /review new xero employees/i })).toBeNull();
  });

  it('Test 2: Sentinel suppresses auto-fill on subsequent mounts', async () => {
    window.localStorage.setItem('wizard-v4:step4-visited:biz-af-2', '1');
    const harness = installFetchSequence([[ALICE_BASE, BOB_BASE]]);
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-af-2"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    // Allow effects to run.
    await waitFor(() => {
      expect(latestState).not.toBeNull();
    });
    // Give any async fetch a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(latestState!.teamMembers.length).toBe(0);
    expect(latestState!.newHires?.length ?? 0).toBe(0);
    // /api/Xero/employees must NOT have been hit by the auto-fill effect.
    // (The banner-probe effect is gated on teamMembers.length > 0 → also no fetch.)
    expect(harness.callCount).toBe(0);
  });

  it('Test 3: Auto-fill does NOT fire when teamMembers is non-empty (banner probe DOES fire)', async () => {
    // Banner-probe fetch returns ALICE only — so newOnes is empty (banner won't render),
    // but the fetch DID fire — this distinguishes the gating from "no effect at all".
    prefillWizardStorage('biz-af-3', FY_START_YEAR, {
      teamMembers: [
        asTeamMember(
          seedXeroMember({
            name: 'Alice Salaried',
            xeroEmployeeId: 'emp-alice-1',
            email: 'alice@example.com',
            currentSalary: 98000,
            payFrequency: 'fortnightly',
          }),
        ),
      ],
    });
    const harness = installFetchSequence([[ALICE_BASE]]);
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-af-3"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect(latestState!.teamMembers.length).toBe(1);
    });
    // Banner probe fetch fired once.
    await waitFor(() => {
      expect(harness.callCount).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    // Auto-fill did NOT add anything (still 1 member, the seeded one).
    expect(latestState!.teamMembers.length).toBe(1);
    // Sentinel NOT set (auto-fill effect short-circuited before sentinel write).
    expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-3')).toBeNull();
    // No banner rendered (Alice was already known).
    expect(screen.queryByRole('button', { name: /review new xero employees/i })).toBeNull();
  });

  it('Test 4: Auto-fill does NOT fire when newHires is non-empty', async () => {
    prefillWizardStorage('biz-af-4', FY_START_YEAR, {
      newHires: [
        asNewHire({
          role: 'Designer',
          type: 'full-time',
          hoursPerWeek: 38,
          startMonth: '2025-09',
          salary: 60000,
        }),
      ],
    });
    const harness = installFetchSequence([[ALICE_BASE, BOB_BASE]]);
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-af-4"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect((latestState!.newHires ?? []).length).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    // Auto-fill blocked. teamMembers stays empty, newHires unchanged at 1.
    expect(latestState!.teamMembers.length).toBe(0);
    expect((latestState!.newHires ?? []).length).toBe(1);
    // Sentinel not set (effect short-circuited).
    expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-4')).toBeNull();
    // Banner probe is also gated (teamMembers.length === 0) → no fetch fired.
    expect(harness.callCount).toBe(0);
  });

  it('Test 5: Auto-fill does NOT fire when departures is non-empty', async () => {
    const aliceMember = asTeamMember(
      seedXeroMember({
        name: 'Alice Salaried',
        xeroEmployeeId: 'emp-alice-1',
        email: 'alice@example.com',
        currentSalary: 98000,
        payFrequency: 'fortnightly',
      }),
    );
    prefillWizardStorage('biz-af-5', FY_START_YEAR, {
      teamMembers: [aliceMember],
      departures: [asDeparture({ teamMemberId: aliceMember.id, endMonth: '2025-12' })],
    });
    const harness = installFetchSequence([[ALICE_BASE, BOB_BASE]]);
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-af-5"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect(latestState!.teamMembers.length).toBe(1);
      expect((latestState!.departures ?? []).length).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    // Auto-fill never adds anything (teamMembers.length===1 already gates it).
    expect(latestState!.teamMembers.length).toBe(1);
    // Sentinel not set.
    expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-5')).toBeNull();
    // Banner probe DID fire once (teamMembers.length > 0 gate satisfied).
    expect(harness.callCount).toBe(1);
  });

  it('Test 6: Auto-fill silent on 404 (no Xero connection) — sentinel still set', async () => {
    const harness = installCustomFetch(() => new Response('Not Found', { status: 404 }));
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-af-6"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestState).not.toBeNull();
    });
    await waitFor(() => {
      expect(harness.callCount).toBe(1);
    });
    expect(latestState!.teamMembers.length).toBe(0);
    expect(consoleErrorSpy.mock.calls.length).toBe(0);
    expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-6')).toBe('1');
  });

  it('Test 7: Auto-fill silent on data.expired || data.needs_reconnect', async () => {
    const harness = installCustomFetch(() =>
      makeJsonResponse({ expired: true, needs_reconnect: true, message: 'reconnect' }),
    );
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-af-7"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestState).not.toBeNull();
    });
    await waitFor(() => {
      expect(harness.callCount).toBe(1);
    });
    expect(latestState!.teamMembers.length).toBe(0);
    expect(consoleErrorSpy.mock.calls.length).toBe(0);
    expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-7')).toBe('1');
  });

  it('Test 8: Auto-fill silent on empty employees array AND on network throw', async () => {
    // Sub-case A: empty employees array.
    {
      const harness = installFetchSequence([[]]);
      let latestState: ForecastWizardState | null = null;
      const { unmount } = render(
        <Step4Harness
          businessId="biz-af-8a"
          onState={(s) => {
            latestState = s;
          }}
        />,
      );
      await waitFor(() => {
        expect(latestState).not.toBeNull();
      });
      await waitFor(() => {
        expect(harness.callCount).toBe(1);
      });
      expect(latestState!.teamMembers.length).toBe(0);
      expect(consoleErrorSpy.mock.calls.length).toBe(0);
      expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-8a')).toBe('1');
      unmount();
      vi.restoreAllMocks();
      // Re-spy console.error since restoreAllMocks cleared the spy.
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    }
    // Sub-case B: network throw.
    {
      const harness = installCustomFetch(() => {
        throw new Error('network down');
      });
      let latestState: ForecastWizardState | null = null;
      render(
        <Step4Harness
          businessId="biz-af-8b"
          onState={(s) => {
            latestState = s;
          }}
        />,
      );
      await waitFor(() => {
        expect(latestState).not.toBeNull();
      });
      await waitFor(() => {
        expect(harness.callCount).toBe(1);
      });
      expect(latestState!.teamMembers.length).toBe(0);
      expect(consoleErrorSpy.mock.calls.length).toBe(0);
      expect(window.localStorage.getItem('wizard-v4:step4-visited:biz-af-8b')).toBe('1');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // New-employees banner
  // ─────────────────────────────────────────────────────────────────────────

  it('Test 9: Banner appears when fetched employees include unknown _xeroEmployeeId', async () => {
    prefillWizardStorage('biz-bn-9', FY_START_YEAR, {
      teamMembers: [
        asTeamMember(
          seedXeroMember({
            name: 'Alice Salaried',
            xeroEmployeeId: 'emp-alice-1',
            email: 'alice@example.com',
            currentSalary: 98000,
            payFrequency: 'fortnightly',
          }),
        ),
      ],
    });
    installFetchSequence([[ALICE_BASE, CHARLIE_BASE]]);
    render(<Step4Harness businessId="biz-bn-9" />);
    // Banner appears with the count + Review button.
    const reviewBtn = await screen.findByRole(
      'button',
      { name: /review new xero employees/i },
      { timeout: 3000 },
    );
    expect(reviewBtn).toBeInTheDocument();
    // Copy includes "1 new employee".
    expect(screen.getByText(/1 new employee in xero/i)).toBeInTheDocument();
    // Dismiss button is present too.
    expect(
      screen.getByRole('button', { name: /dismiss new-employees banner/i }),
    ).toBeInTheDocument();
  });

  it('Test 10: Banner Review opens the existing 52-01 modal pre-checked with new ones only', async () => {
    prefillWizardStorage('biz-bn-10', FY_START_YEAR, {
      teamMembers: [
        asTeamMember(
          seedXeroMember({
            name: 'Alice Salaried',
            xeroEmployeeId: 'emp-alice-1',
            email: 'alice@example.com',
            currentSalary: 98000,
            payFrequency: 'fortnightly',
          }),
        ),
      ],
    });
    let latestState: ForecastWizardState | null = null;
    installFetchSequence([[ALICE_BASE, CHARLIE_BASE]]);
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-bn-10"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    const reviewBtn = await screen.findByRole(
      'button',
      { name: /review new xero employees/i },
      { timeout: 3000 },
    );
    await user.click(reviewBtn);
    // Existing 52-01 import modal opens (matched the same way as 52-01 tests).
    const dialog = await screen.findByRole('dialog', { name: /import.*xero/i });
    // Modal lists Charlie, NOT Alice (filter applied — only newOnes were passed).
    expect(within(dialog).getByText(/charlie new/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/alice salaried/i)).toBeNull();
    // Charlie's checkbox is pre-checked (selectedXeroEmployeeIds initialised).
    const charlieCheckbox = within(dialog).getByRole('checkbox', {
      name: /select charlie new/i,
    }) as HTMLInputElement;
    expect(charlieCheckbox.checked).toBe(true);
    // Confirm only Charlie was added when Import is clicked.
    const importBtn = within(dialog).getByRole('button', { name: /import 1 selected/i });
    await user.click(importBtn);
    await waitFor(() => {
      expect(latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-charlie-3'))
        .toBeDefined();
    });
    // Alice was NOT re-added (still 2 members total: Alice + Charlie).
    expect(
      latestState!.teamMembers.filter((m) => m._xeroEmployeeId === 'emp-alice-1').length,
    ).toBe(1);
  });

  it('Test 11: Banner dismiss hides for the rest of the component lifetime', async () => {
    prefillWizardStorage('biz-bn-11', FY_START_YEAR, {
      teamMembers: [
        asTeamMember(
          seedXeroMember({
            name: 'Alice Salaried',
            xeroEmployeeId: 'emp-alice-1',
            email: 'alice@example.com',
            currentSalary: 98000,
            payFrequency: 'fortnightly',
          }),
        ),
      ],
    });
    installFetchSequence([[ALICE_BASE, CHARLIE_BASE]]);
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-bn-11" />);
    const dismissBtn = await screen.findByRole(
      'button',
      { name: /dismiss new-employees banner/i },
      { timeout: 3000 },
    );
    await user.click(dismissBtn);
    // Banner should be gone.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /review new xero employees/i })).toBeNull();
    });
    expect(screen.queryByText(/new employee in xero/i)).toBeNull();
  });

  it('Test 12: Departures-resolved exclusion — departing Xero member not surfaced as "new"', async () => {
    // Seed Alice as a Xero-imported member, then mark Alice as departing.
    // Fetch returns Alice ONLY → she should appear in knownIds via the
    // departure resolution path → newOnes is empty → no banner.
    const aliceMember = asTeamMember(
      seedXeroMember({
        name: 'Alice Salaried',
        xeroEmployeeId: 'emp-alice-1',
        email: 'alice@example.com',
        currentSalary: 98000,
        payFrequency: 'fortnightly',
      }),
    );
    prefillWizardStorage('biz-bn-12', FY_START_YEAR, {
      teamMembers: [aliceMember],
      departures: [asDeparture({ teamMemberId: aliceMember.id, endMonth: '2025-12' })],
    });
    installFetchSequence([[ALICE_BASE]]);
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-bn-12"
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect((latestState!.departures ?? []).length).toBe(1);
    });
    // Allow banner-probe fetch to settle.
    await new Promise((r) => setTimeout(r, 100));
    // Banner must NOT render — Alice is "known" via the departure resolution.
    expect(screen.queryByRole('button', { name: /review new xero employees/i })).toBeNull();
    expect(screen.queryByText(/new employee in xero/i)).toBeNull();
  });

  it('Test 13a: Banner probe silent on 404', async () => {
    prefillWizardStorage('biz-bn-13a', FY_START_YEAR, {
      teamMembers: [
        asTeamMember(
          seedXeroMember({
            name: 'Alice Salaried',
            xeroEmployeeId: 'emp-alice-1',
            email: 'alice@example.com',
            currentSalary: 98000,
            payFrequency: 'fortnightly',
          }),
        ),
      ],
    });
    const harness = installCustomFetch(() => new Response('Not Found', { status: 404 }));
    render(<Step4Harness businessId="biz-bn-13a" />);
    await waitFor(() => {
      expect(harness.callCount).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: /review new xero employees/i })).toBeNull();
    expect(consoleErrorSpy.mock.calls.length).toBe(0);
  });

  it('Test 13b: Banner probe silent on network throw', async () => {
    prefillWizardStorage('biz-bn-13b', FY_START_YEAR, {
      teamMembers: [
        asTeamMember(
          seedXeroMember({
            name: 'Alice Salaried',
            xeroEmployeeId: 'emp-alice-1',
            email: 'alice@example.com',
            currentSalary: 98000,
            payFrequency: 'fortnightly',
          }),
        ),
      ],
    });
    const harness = installCustomFetch(() => {
      throw new Error('network');
    });
    render(<Step4Harness businessId="biz-bn-13b" />);
    await waitFor(() => {
      expect(harness.callCount).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: /review new xero employees/i })).toBeNull();
    expect(consoleErrorSpy.mock.calls.length).toBe(0);
  });

  it('Test 13c: StrictMode double-mount — auto-fill imports each Xero employee EXACTLY once', async () => {
    const harness = installFetchSequence([[ALICE_BASE, BOB_BASE]]);
    let latestState: ForecastWizardState | null = null;
    render(
      <React.StrictMode>
        <Step4Harness
          businessId="biz-bn-13c"
          onState={(s) => {
            latestState = s;
          }}
        />
      </React.StrictMode>,
    );
    await waitFor(
      () => {
        expect(latestState).not.toBeNull();
        const total = latestState!.teamMembers.length + (latestState!.newHires?.length ?? 0);
        expect(total).toBe(2);
      },
      { timeout: 3000 },
    );
    // Allow any stray double-mount fetch to settle.
    await new Promise((r) => setTimeout(r, 50));
    // Even under StrictMode, the auto-fill effect fires the fetch exactly ONCE
    // (autoFillRef + sentinel-before-fetch prevent re-entry on the StrictMode
    // remount). NOTE: the sentinel-before-fetch guarantees that even if the
    // ref were reset by StrictMode's second mount, the localStorage check
    // would short-circuit on the second pass.
    //
    // After auto-fill imports the 2 employees, teamMembers.length transitions
    // 0→2 → banner probe effect fires once (gated by bannerProbeRef per
    // businessId, so it fires AT MOST once per businessId regardless of
    // StrictMode). Banner probe finds all imports in knownIds → no banner.
    //
    // Total expected fetches: 1 (auto-fill) + 1 (post-import banner probe) = 2.
    expect(harness.callCount).toBe(2);
    // Each Xero employee imported exactly once → no duplicates.
    const allXeroIds = [
      ...latestState!.teamMembers.map((m) => m._xeroEmployeeId),
      ...(latestState!.newHires ?? []).map((h) => h._xeroEmployeeId),
    ];
    expect(allXeroIds.filter((id) => id === 'emp-alice-1').length).toBe(1);
    expect(allXeroIds.filter((id) => id === 'emp-bob-2').length).toBe(1);
  });
});
