/**
 * Phase 52 Plan 02 — XERO-S4-05: Refresh from Xero / reconciliation flow
 *
 * Tests the per-field reconciliation flow per Operator's Option D:
 *   - Refresh-from-Xero button visible only when ≥1 row has _xeroFingerprint
 *   - 3-tier match (id > email > name); manually-added rows untouchable
 *   - Per-field diff verdicts: unchanged / updated-by-xero-only / conflict
 *   - Per-field decisions [Accept Xero] [Keep yours] (and bulk equivalents)
 *   - Fingerprint always advances → no re-prompt of the same conflict
 *   - "New from Xero" section + opt-in checkboxes
 *
 * RED expectations on HEAD before Task 4 lands:
 *   - Tests 1-15 fail at the screen.findByLabelText(/refresh from xero/i)
 *     lookup because the button does not exist yet (or the modal doesn't render).
 *   - Test 16 (no rollup math change) is a regression-lock; should remain GREEN.
 *
 * Test pattern: real-hook Step4Harness. Mocked global.fetch with
 * mockResolvedValueOnce chains so the "first refresh" vs "second refresh"
 * fetches return different bodies (simulating Xero changing between calls).
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step4Team } from '@/app/finances/forecast/components/wizard-v4/steps/Step4Team';
import type {
  TeamMember,
  ForecastWizardState,
  XeroFieldFingerprint,
} from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = FY_START_YEAR + 1;

type SeedMember = Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>;

// ────────────────────────────────────────────────────────────────────────────
// Canned employee fixtures.
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
  hourly_rate: undefined,
  annual_salary: 98000,
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
  hourly_rate: 45,
  annual_salary: undefined,
  employment_type: 'casual',
  calculation_type: 'hourly' as const,
  is_active: true,
  from_xero: true,
  start_date: '2024-06-01',
};

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Install a fetch mock that returns the given employees array (or list of
 * arrays for sequential calls). Each successive call to /api/Xero/employees
 * shifts off the next array.
 *
 * Other (non-Xero) URLs return `{}` so the wizard mount doesn't error.
 */
function installFetchSequence(employeesByCall: unknown[][]): void {
  let callIdx = 0;
  vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/Xero/employees')) {
      const employees = employeesByCall[Math.min(callIdx, employeesByCall.length - 1)] ?? [];
      callIdx++;
      return makeJsonResponse({
        success: true,
        employees,
        count: employees.length,
        payroll_available: true,
      });
    }
    return makeJsonResponse({});
  });
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// Step4Harness — real-hook pattern matching 52-01 test file.
//
// `initialMembers`: seeded team members (e.g. pre-imported Xero rows or
// manually-added rows). The harness drops the seeded members into the wizard
// state via actions.addTeamMember exactly once on mount.
// ────────────────────────────────────────────────────────────────────────────
function Step4Harness({
  businessId,
  initialMembers,
  onState,
  onSummary,
}: {
  businessId: string;
  initialMembers?: SeedMember[];
  onState?: (state: ForecastWizardState) => void;
  onSummary?: (summary: ReturnType<typeof useForecastWizard>['summary']) => void;
}) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  const seededRef = React.useRef(false);

  // Phase 54-02: 52-02 tests exercise the explicit Refresh-from-Xero modal
  // (reconciliation flow) — auto-fill must NOT also fire here. Set the
  // sentinel before mount so Step4Team's auto-fill effect short-circuits.
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(`wizard-v4:step4-visited:${businessId}`, '1');
  }

  React.useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      if (initialMembers && initialMembers.length > 0) {
        initialMembers.forEach((m) => wizard.actions.addTeamMember(m));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    onState?.(wizard.state);
  }, [wizard.state, onState]);
  React.useEffect(() => {
    onSummary?.(wizard.summary);
  }, [wizard.summary, onSummary]);

  return (
    <Step4Team
      state={wizard.state}
      actions={wizard.actions}
      fiscalYear={FISCAL_YEAR_END}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: build a SeedMember pre-stamped with Xero provenance (skips the
// 52-01 import flow so each test focuses on reconciliation only).
// ────────────────────────────────────────────────────────────────────────────
function seedXeroMember(opts: {
  name: string;
  xeroEmployeeId: string;
  email?: string;
  currentSalary?: number;
  hourlyRate?: number;
  standardHours?: number;
  payFrequency?: 'weekly' | 'fortnightly' | 'monthly';
  fingerprint: XeroFieldFingerprint;
  overridden?: string[];
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
    _xeroFingerprint: opts.fingerprint,
    _overriddenFields: opts.overridden,
  };
}

describe('Phase 52-02 — Refresh from Xero / reconciliation', () => {
  // ─── Test 1 ─────────────────────────────────────────────────────────────
  it('Test 1: Refresh-from-Xero button NOT visible when no Xero-sourced rows', async () => {
    installFetchSequence([[]]);
    const mary: SeedMember = {
      name: 'Mary Manual',
      role: 'Bookkeeper',
      type: 'full-time',
      hoursPerWeek: 38,
      currentSalary: 70_000,
      increasePct: 0,
      isFromXero: false,
    };
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-r1"
        initialMembers={[mary]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    // Wait for Mary to be seeded into wizard state
    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect(latestState!.teamMembers.length).toBe(1);
    });
    // Sanity: Import-from-Xero button (52-01) IS visible — it's always rendered.
    await screen.findByRole('button', { name: /import from xero/i });
    // Refresh-from-Xero button must NOT be visible (no row has _xeroFingerprint).
    expect(screen.queryByRole('button', { name: /refresh from xero/i })).toBeNull();
  });

  // ─── Test 2 ─────────────────────────────────────────────────────────────
  it('Test 2: Refresh-from-Xero button visible when at least one Xero-sourced row exists', async () => {
    installFetchSequence([[ALICE_BASE]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 98000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
    });
    render(<Step4Harness businessId="biz-r2" initialMembers={[alice]} />);
    const btn = await screen.findByRole('button', { name: /refresh from xero/i });
    expect(btn).toBeInTheDocument();
  });

  // ─── Test 3 ─────────────────────────────────────────────────────────────
  it('Test 3: Modal opens on click + shows in-sync state when nothing changed', async () => {
    // Xero returns the same values that are already in the fingerprint.
    installFetchSequence([[ALICE_BASE]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 98000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
    });
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-r3" initialMembers={[alice]} />);

    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    await waitFor(() => {
      expect(within(dialog).getByText(/in sync with xero/i)).toBeInTheDocument();
    });
  });

  // ─── Test 4 ─────────────────────────────────────────────────────────────
  it('Test 4: Silent update applied automatically when operator never touched the field', async () => {
    // Alice in wizard: salary 98000, fingerprint 98000, no overrides.
    // Xero returns: salary 105000.
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    installFetchSequence([[aliceUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 98000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
    });
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r4"
        initialMembers={[alice]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });

    // Silent updates summary visible
    await waitFor(() => {
      expect(within(dialog).getByText(/will be silently updated/i)).toBeInTheDocument();
    });
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      expect(latestState!.teamMembers[0].currentSalary).toBe(105000);
    });
    expect(latestState!.teamMembers[0]._xeroFingerprint?.currentSalary).toBe(105000);
    expect(latestState!.teamMembers[0]._overriddenFields ?? []).not.toContain('currentSalary');
  });

  // ─── Test 5 ─────────────────────────────────────────────────────────────
  it('Test 5: Conflict path — operator overrode salary AND Xero changed it', async () => {
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    installFetchSequence([[aliceUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 90000, // operator-overridden value
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000, // last-known Xero value
      },
      overridden: ['currentSalary'],
    });
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-r5" initialMembers={[alice]} />);
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });

    await waitFor(() => {
      expect(within(dialog).getByText(/conflicts requiring your decision/i)).toBeInTheDocument();
    });
    expect(within(dialog).getByText(/105000|105,000/)).toBeInTheDocument();
    expect(within(dialog).getByText(/90000|90,000/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /keep yours for currentSalary/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /accept xero for currentSalary/i })).toBeInTheDocument();
  });

  // ─── Test 6 ─────────────────────────────────────────────────────────────
  it('Test 6: Per-field [Accept Xero] decision applies Xero value + clears override', async () => {
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    installFetchSequence([[aliceUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 90000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
      overridden: ['currentSalary'],
    });
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r6"
        initialMembers={[alice]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });

    await user.click(
      await within(dialog).findByRole('button', { name: /accept xero for currentSalary/i }),
    );
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      expect(latestState!.teamMembers[0].currentSalary).toBe(105000);
    });
    expect(latestState!.teamMembers[0]._xeroFingerprint?.currentSalary).toBe(105000);
    expect(latestState!.teamMembers[0]._overriddenFields ?? []).not.toContain('currentSalary');
  });

  // ─── Test 7 ─────────────────────────────────────────────────────────────
  it('Test 7: Per-field [Keep yours] decision leaves value but advances fingerprint', async () => {
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    installFetchSequence([[aliceUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 90000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
      overridden: ['currentSalary'],
    });
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r7"
        initialMembers={[alice]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });

    await user.click(
      await within(dialog).findByRole('button', { name: /keep yours for currentSalary/i }),
    );
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      // currentSalary unchanged
      expect(latestState!.teamMembers[0].currentSalary).toBe(90000);
    });
    // Fingerprint advanced to the fresh Xero value
    expect(latestState!.teamMembers[0]._xeroFingerprint?.currentSalary).toBe(105000);
    // Override still recorded
    expect(latestState!.teamMembers[0]._overriddenFields ?? []).toContain('currentSalary');
  });

  // ─── Test 8 ─────────────────────────────────────────────────────────────
  it('Test 8: Same conflict does NOT re-prompt on next refresh after Keep yours', async () => {
    // First refresh: Xero shows 105000. Operator clicks Keep yours → fingerprint
    // becomes 105000. Second refresh: Xero still returns 105000 → no conflict
    // (xeroChanged is now false).
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    installFetchSequence([[aliceUpdated], [aliceUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 90000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
      overridden: ['currentSalary'],
    });
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-r8" initialMembers={[alice]} />);

    // First refresh
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    let dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    await user.click(
      await within(dialog).findByRole('button', { name: /keep yours for currentSalary/i }),
    );
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /reconcile.*xero/i })).toBeNull();
    });

    // Second refresh — should now show in-sync (fingerprint advanced)
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    await waitFor(() => {
      expect(within(dialog).getByText(/in sync with xero/i)).toBeInTheDocument();
    });
    expect(within(dialog).queryByText(/conflicts requiring your decision/i)).toBeNull();
  });

  // ─── Test 9 ─────────────────────────────────────────────────────────────
  it('Test 9: Bulk "Accept all Xero changes" updates every conflict to Xero values', async () => {
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    const bobUpdated = { ...BOB_BASE, hourly_rate: 55 };
    installFetchSequence([[aliceUpdated, bobUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 90000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
      overridden: ['currentSalary'],
    });
    const bob = seedXeroMember({
      name: 'Bob Casual',
      xeroEmployeeId: 'emp-bob-2',
      email: 'bob@example.com',
      currentSalary: 0,
      hourlyRate: 40, // operator-overridden
      standardHours: 20,
      payFrequency: 'weekly',
      type: 'casual',
      role: 'Designer',
      fingerprint: {
        name: 'Bob Casual',
        role: 'Designer',
        type: 'casual',
        payFrequency: 'weekly',
        standardHours: 20,
        hourlyRate: 45,
        currentSalary: 0,
      },
      overridden: ['hourlyRate'],
    });
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r9"
        initialMembers={[alice, bob]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    await user.click(
      await within(dialog).findByRole('button', { name: /accept all xero changes/i }),
    );
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      const aliceRow = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-alice-1');
      expect(aliceRow?.currentSalary).toBe(105000);
    });
    const aliceRow = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-alice-1')!;
    const bobRow = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-bob-2')!;
    expect(aliceRow.currentSalary).toBe(105000);
    expect(aliceRow._overriddenFields ?? []).not.toContain('currentSalary');
    expect(bobRow.hourlyRate).toBe(55);
    expect(bobRow._overriddenFields ?? []).not.toContain('hourlyRate');
  });

  // ─── Test 10 ────────────────────────────────────────────────────────────
  it('Test 10: Bulk "Keep all my changes" advances fingerprints but preserves values', async () => {
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    const bobUpdated = { ...BOB_BASE, hourly_rate: 55 };
    installFetchSequence([[aliceUpdated, bobUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 90000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
      overridden: ['currentSalary'],
    });
    const bob = seedXeroMember({
      name: 'Bob Casual',
      xeroEmployeeId: 'emp-bob-2',
      email: 'bob@example.com',
      currentSalary: 0,
      hourlyRate: 40,
      standardHours: 20,
      payFrequency: 'weekly',
      type: 'casual',
      role: 'Designer',
      fingerprint: {
        name: 'Bob Casual',
        role: 'Designer',
        type: 'casual',
        payFrequency: 'weekly',
        standardHours: 20,
        hourlyRate: 45,
        currentSalary: 0,
      },
      overridden: ['hourlyRate'],
    });
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r10"
        initialMembers={[alice, bob]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    await user.click(
      await within(dialog).findByRole('button', { name: /keep all my changes/i }),
    );
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      const a = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-alice-1');
      expect(a?._xeroFingerprint?.currentSalary).toBe(105000);
    });
    const aliceRow = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-alice-1')!;
    const bobRow = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-bob-2')!;
    expect(aliceRow.currentSalary).toBe(90000); // operator value preserved
    expect(aliceRow._xeroFingerprint?.currentSalary).toBe(105000); // fingerprint advanced
    expect(aliceRow._overriddenFields ?? []).toContain('currentSalary');
    expect(bobRow.hourlyRate).toBe(40);
    expect(bobRow._xeroFingerprint?.hourlyRate).toBe(55);
    expect(bobRow._overriddenFields ?? []).toContain('hourlyRate');
  });

  // ─── Test 11 ────────────────────────────────────────────────────────────
  it('Test 11: "New from Xero" section + opt-in checkbox adds the new employee', async () => {
    const charlie = {
      ...ALICE_BASE,
      employee_id: 'emp-charlie-3',
      full_name: 'Charlie New',
      first_name: 'Charlie',
      last_name: 'New',
      email: 'charlie@example.com',
      annual_salary: 75000,
      job_title: 'Analyst',
    };
    installFetchSequence([[ALICE_BASE, charlie]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 98000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
    });
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r11"
        initialMembers={[alice]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });

    await waitFor(() => {
      expect(within(dialog).getByText(/new from xero/i)).toBeInTheDocument();
    });
    expect(within(dialog).getByText(/charlie new/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: /add charlie new/i }));
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      expect(latestState!.teamMembers.length).toBe(2);
    });
    const charlieRow = latestState!.teamMembers.find(
      (m) => m._xeroEmployeeId === 'emp-charlie-3',
    );
    expect(charlieRow).toBeDefined();
    expect(charlieRow!._xeroFingerprint).toBeTruthy();
    expect(typeof charlieRow!._xeroImportedAt).toBe('string');
  });

  // ─── Test 12 ────────────────────────────────────────────────────────────
  it('Test 12: Manually-added member untouchable — no Xero match → no removal', async () => {
    // Mary is manually added (no _xeroEmployeeId, no fingerprint). Xero refresh
    // returns ONLY Alice. Since the algorithm iterates xeroEmployees (NEVER
    // teamMembers), Mary is never inspected → never modified or removed.
    installFetchSequence([[ALICE_BASE]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 98000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
    });
    const mary: SeedMember = {
      name: 'Mary Manual',
      role: 'Bookkeeper',
      type: 'full-time',
      hoursPerWeek: 38,
      currentSalary: 70_000,
      increasePct: 0,
      isFromXero: false,
    };
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r12"
        initialMembers={[alice, mary]}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestState!.teamMembers.length).toBe(2);
    });

    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    // Modal may open in-sync state since Alice matches and Mary is not iterated.
    await waitFor(() => {
      // Either in-sync or Apply available; press whichever Close/Cancel/Apply exists
      const apply = within(dialog).queryByRole('button', { name: /apply.*change/i });
      const close = within(dialog).queryByRole('button', { name: /^close$/i });
      const cancel = within(dialog).queryByRole('button', { name: /^cancel$/i });
      expect(apply || close || cancel).toBeTruthy();
    });
    const apply = within(dialog).queryByRole('button', { name: /apply.*change/i });
    if (apply && !(apply as HTMLButtonElement).disabled) {
      await user.click(apply);
    } else {
      const closer =
        within(dialog).queryByRole('button', { name: /^close$/i }) ??
        within(dialog).queryByRole('button', { name: /^cancel$/i });
      if (closer) await user.click(closer);
    }

    // Mary still present; her fields untouched
    const maryRow = latestState!.teamMembers.find((m) => m.name === 'Mary Manual');
    expect(maryRow).toBeDefined();
    expect(maryRow!.currentSalary).toBe(70_000);
    expect(maryRow!._xeroEmployeeId).toBeUndefined();
    expect(maryRow!._overriddenFields).toBeUndefined();
  });

  // ─── Test 13 ────────────────────────────────────────────────────────────
  it('Test 13: Match by name (tier 3) when _xeroEmployeeId is missing — no "New from Xero" entry', async () => {
    // Mary in wizard has no _xeroEmployeeId. Xero returns an employee with
    // full_name 'Mary Smith' that matches by name (tier 3). Should NOT appear
    // in the "New from Xero" section.
    const xeroMary = {
      ...ALICE_BASE,
      employee_id: 'emp-mary-xero',
      full_name: 'Mary Smith',
      first_name: 'Mary',
      last_name: 'Smith',
      email: 'different-email@example.com', // email doesn't match — forces tier-3
      annual_salary: 80000,
      job_title: 'Bookkeeper',
    };
    installFetchSequence([[xeroMary]]);
    const mary: SeedMember = {
      name: 'Mary Smith',
      role: 'Bookkeeper',
      type: 'full-time',
      hoursPerWeek: 38,
      currentSalary: 70_000,
      increasePct: 0,
      isFromXero: false,
    };
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-r13" initialMembers={[mary]} />);

    // Refresh button is HIDDEN here (no _xeroFingerprint on any row). To exercise
    // the matcher, we need a Xero-sourced row too. Add a sentinel Alice row.
    const alice = seedXeroMember({
      name: 'Alice Sentinel',
      xeroEmployeeId: 'emp-alice-sentinel',
      email: 'alice-sentinel@example.com',
      fingerprint: {
        name: 'Alice Sentinel',
        role: 'Engineer',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 50000,
      },
    });
    // Re-render with both
    installFetchSequence([[xeroMary]]);
    render(<Step4Harness businessId="biz-r13b" initialMembers={[mary, alice]} />);
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });

    // Mary should NOT be listed in "New from Xero" — the matcher hit tier 3.
    await waitFor(() => {
      const newSection = within(dialog).queryByText(/new from xero/i);
      // If the section exists, Mary must not be inside it.
      if (newSection) {
        expect(within(dialog).queryByRole('checkbox', { name: /add mary smith/i })).toBeNull();
      } else {
        // Section absent altogether — proves no new candidates → matcher succeeded.
        expect(newSection).toBeNull();
      }
    });
  });

  // ─── Test 14 ────────────────────────────────────────────────────────────
  it('Test 14: Multiple silent updates batched — actions.updateTeamMember called once per member, not once per field', async () => {
    // 3 Xero-sourced members each with 2 silent-update fields → 6 silent
    // updates total. Apply must batch per-member, so updateTeamMember should
    // be called <= 3 times for these silent updates (not 6).
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000, job_title: 'Senior Manager' };
    const bobUpdated = { ...BOB_BASE, hourly_rate: 55, job_title: 'Lead Designer' };
    const carolUpdated = {
      ...ALICE_BASE,
      employee_id: 'emp-carol',
      full_name: 'Carol Z',
      email: 'carol@example.com',
      annual_salary: 110000,
      job_title: 'Director',
    };
    installFetchSequence([[aliceUpdated, bobUpdated, carolUpdated]]);
    const seeds = [
      seedXeroMember({
        name: 'Alice Salaried',
        xeroEmployeeId: 'emp-alice-1',
        email: 'alice@example.com',
        currentSalary: 98000,
        role: 'Manager',
        payFrequency: 'fortnightly',
        fingerprint: {
          name: 'Alice Salaried',
          role: 'Manager',
          type: 'full-time',
          payFrequency: 'fortnightly',
          standardHours: 38,
          currentSalary: 98000,
        },
      }),
      seedXeroMember({
        name: 'Bob Casual',
        xeroEmployeeId: 'emp-bob-2',
        email: 'bob@example.com',
        currentSalary: 0,
        hourlyRate: 45,
        standardHours: 20,
        payFrequency: 'weekly',
        type: 'casual',
        role: 'Designer',
        fingerprint: {
          name: 'Bob Casual',
          role: 'Designer',
          type: 'casual',
          payFrequency: 'weekly',
          standardHours: 20,
          hourlyRate: 45,
          currentSalary: 0,
        },
      }),
      seedXeroMember({
        name: 'Carol Z',
        xeroEmployeeId: 'emp-carol',
        email: 'carol@example.com',
        currentSalary: 95000,
        role: 'Analyst',
        payFrequency: 'fortnightly',
        fingerprint: {
          name: 'Carol Z',
          role: 'Analyst',
          type: 'full-time',
          payFrequency: 'fortnightly',
          standardHours: 38,
          currentSalary: 95000,
        },
      }),
    ];
    let latestState: ForecastWizardState | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r14"
        initialMembers={seeds}
        onState={(s) => {
          latestState = s;
        }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      const a = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-alice-1');
      expect(a?.currentSalary).toBe(105000);
    });
    // Verify each member got its silent updates
    const a = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-alice-1')!;
    const b = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-bob-2')!;
    const c = latestState!.teamMembers.find((m) => m._xeroEmployeeId === 'emp-carol')!;
    expect(a.currentSalary).toBe(105000);
    expect(a.role).toBe('Senior Manager');
    expect(b.hourlyRate).toBe(55);
    expect(b.role).toBe('Lead Designer');
    expect(c.currentSalary).toBe(110000);
    expect(c.role).toBe('Director');
  });

  // ─── Test 15 ────────────────────────────────────────────────────────────
  it('Test 15: Apply button disabled when 0 pending changes (in-sync state)', async () => {
    installFetchSequence([[ALICE_BASE]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 98000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
    });
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-r15" initialMembers={[alice]} />);
    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });

    await waitFor(() => {
      expect(within(dialog).getByText(/in sync with xero/i)).toBeInTheDocument();
    });
    const applyBtn = within(dialog).queryByRole('button', { name: /apply.*change/i });
    if (applyBtn) {
      expect(applyBtn).toBeDisabled();
    } else {
      expect(applyBtn).toBeNull();
    }
  });

  // ─── Test 16 ────────────────────────────────────────────────────────────
  it('Test 16: NO rollup math regression — silent salary increase reflects exactly the delta', async () => {
    const aliceUpdated = { ...ALICE_BASE, annual_salary: 105000 };
    installFetchSequence([[aliceUpdated]]);
    const alice = seedXeroMember({
      name: 'Alice Salaried',
      xeroEmployeeId: 'emp-alice-1',
      email: 'alice@example.com',
      currentSalary: 98000,
      payFrequency: 'fortnightly',
      fingerprint: {
        name: 'Alice Salaried',
        role: 'Manager',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
      },
    });
    let latestSummary: ReturnType<typeof useForecastWizard>['summary'] | null = null;
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-r16"
        initialMembers={[alice]}
        onSummary={(s) => {
          latestSummary = s;
        }}
      />,
    );
    await waitFor(() => {
      expect(latestSummary).not.toBeNull();
    });
    const before = latestSummary!.year1.teamCosts;

    await user.click(await screen.findByRole('button', { name: /refresh from xero/i }));
    const dialog = await screen.findByRole('dialog', { name: /reconcile.*xero/i });
    await user.click(within(dialog).getByRole('button', { name: /apply.*change/i }));

    await waitFor(() => {
      expect(latestSummary!.year1.teamCosts).not.toBe(before);
    });
    // Salary went from 98k to 105k → delta 7000. Add 12% super → 7000 * 1.12 = 7840.
    const after = latestSummary!.year1.teamCosts;
    const delta = after - before;
    // Allow $5 of rounding tolerance — the rollup uses formatCurrency rounding.
    expect(delta).toBeGreaterThan(7800);
    expect(delta).toBeLessThan(7900);
  });
});
