/**
 * Phase 52 Plan 01 — XERO-S4-01/03/04: Step 4 "Import from Xero" UI
 *
 * Tests the on-demand Import-from-Xero button + modal + auto-detect-by-
 * EarningsRateCalculationType + per-field "edited" markers per Operator's
 * Option D decision (encoded throughout):
 *   - Hourly employees → annual salary cell read-only by default with edit
 *     affordance; clicking edit switches to manual + adds to _overriddenFields
 *   - Salaried employees → annual salary cell editable by default; edits also
 *     mark _overriddenFields
 *   - Edited pill appears on any field tracked in _overriddenFields
 *   - Manual (non-Xero) rows are untouched by override logic
 *   - Empty state: button disabled with tooltip when no Xero connection
 *   - Rate-limit error: friendly inline message in modal
 *   - Planned-hire branch: StartDate > today + 7d → addNewHire (NewHire list)
 *
 * RED expectations on HEAD before Task 3 lands:
 *   - Tests 1, 3-15 fail at the screen.findByLabelText(/import from xero/i)
 *     lookup because the button does not exist yet.
 *   - Test 2 fails at the same lookup — button doesn't exist to test disabled.
 *   - Test 16 (no rollup math change) is a regression-lock; passes today by
 *     accident, must continue passing after Task 3.
 *
 * Test pattern: real-hook Step4Harness (NOT vi.fn() stubs). Mocked-fetch for
 * /api/Xero/employees responses (NOT live tenant). Mirrors:
 *   - src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx (Step4Harness)
 *   - src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx (extended harness)
 *   - src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx (real-hook + fetch mock)
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
} from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = FY_START_YEAR + 1;

type SeedMember = Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>;

// ────────────────────────────────────────────────────────────────────────────
// Canned /api/Xero/employees response builder. Two employees:
//   - Alice: salaried, fortnightly, $98,000/yr (calculation_type: 'salaried')
//   - Bob:   hourly casual, weekly, $45/hr × 20h (calculation_type: 'hourly')
// ────────────────────────────────────────────────────────────────────────────
const ALICE = {
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

const BOB = {
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

interface FetchMockOptions {
  employees?: unknown[];
  status?: number;
  body?: unknown; // override entire body
}

function installFetchMock(opts: FetchMockOptions = {}): void {
  const employees = opts.employees ?? [ALICE, BOB];
  const status = opts.status ?? 200;
  const body =
    opts.body ?? {
      success: true,
      employees,
      count: employees.length,
      payroll_available: true,
    };
  vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/Xero/employees')) {
      return makeJsonResponse(body, status);
    }
    // Default for any other fetch (goals, business-profile, etc.) — empty success.
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
// Real-hook harness — mirrors phase-51-step4-pt-casual.test.tsx exactly.
// Optionally seeds initial team members so tests can verify edit behaviour
// against pre-existing rows (e.g. manual member Mary in Test 12).
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

describe('Phase 52-01 — Import from Xero modal', () => {
  it('Test 1: Import-from-Xero button is visible in Team Members header', async () => {
    installFetchMock();
    render(<Step4Harness businessId="biz-test-1" />);
    const button = await screen.findByRole('button', { name: /import from xero/i });
    expect(button).toBeInTheDocument();
  });

  it('Test 2: button surfaces "Connect Xero" message when /api/Xero/employees returns 404', async () => {
    installFetchMock({ status: 404, body: { error: 'No active Xero connection', needs_reconnect: false } });
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-2" />);

    const button = await screen.findByRole('button', { name: /import from xero/i });
    await user.click(button);

    // Either the button became disabled OR an inline error appears in the modal.
    await waitFor(() => {
      const disabled = (button as HTMLButtonElement).disabled;
      const errorText = screen.queryByText(/connect xero/i);
      expect(disabled || errorText !== null).toBe(true);
    });
  });

  it('Test 3: clicking Import opens the modal listing both employees', async () => {
    installFetchMock();
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-3" />);

    const button = await screen.findByRole('button', { name: /import from xero/i });
    await user.click(button);

    const dialog = await screen.findByRole('dialog', { name: /import.*xero/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/alice salaried/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/bob casual/i)).toBeInTheDocument();
    // Per-row checkboxes
    expect(within(dialog).getByRole('checkbox', { name: /select alice/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /select bob/i })).toBeInTheDocument();
  });

  it('Test 4: salaried row shows annual salary as primary rate display', async () => {
    installFetchMock();
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-4" />);

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    // Alice: $98,000/yr salaried
    expect(within(dialog).getByText(/\$98,000/)).toBeInTheDocument();
  });

  it('Test 5: hourly row shows $X/hr × Yh AND derived annual hint', async () => {
    installFetchMock();
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-5" />);

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    // Bob: $45/hr × 20h
    expect(within(dialog).getByText(/\$45.*\/hr/)).toBeInTheDocument();
    expect(within(dialog).getByText(/20.*h/)).toBeInTheDocument();
    // Derived: 45 × 20 × 52 = 46,800
    expect(within(dialog).getByText(/46,800/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Xero-derived/i)).toBeInTheDocument();
  });

  it('Test 6: select-all + Import 2 selected adds both members with provenance fields populated', async () => {
    installFetchMock();
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-test-6"
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    const selectAll = within(dialog).getByRole('checkbox', { name: /select all/i });
    await user.click(selectAll);

    const importBtn = within(dialog).getByRole('button', { name: /import 2 selected/i });
    await user.click(importBtn);

    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect(latestState!.teamMembers.length).toBe(2);
    });

    for (const member of latestState!.teamMembers) {
      expect(member._xeroEmployeeId).toBeTruthy();
      expect(member._xeroFingerprint).toBeTruthy();
      expect(typeof member._xeroImportedAt).toBe('string');
      // ISO timestamp roughly recent
      const ts = new Date(member._xeroImportedAt!).getTime();
      expect(Number.isFinite(ts)).toBe(true);
      expect(Date.now() - ts).toBeLessThan(60_000);
    }
  });

  it('Test 7: per-checkbox selection imports only the selected employee with correct fields', async () => {
    installFetchMock();
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-test-7"
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /select bob/i }));

    const importBtn = within(dialog).getByRole('button', { name: /import 1 selected/i });
    await user.click(importBtn);

    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect(latestState!.teamMembers.length).toBe(1);
    });
    const bob = latestState!.teamMembers[0];
    expect(bob.payFrequency).toBe('weekly');
    expect(bob.standardHours).toBe(20);
    expect(bob.hourlyRate).toBe(45);
    expect(bob._xeroEmployeeId).toBe('emp-bob-2');
  });

  it('Test 8: salaried import → editable annual salary cell, no Edit affordance', async () => {
    installFetchMock();
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-8" />);

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /select alice/i }));
    await user.click(within(dialog).getByRole('button', { name: /import 1 selected/i }));

    // Wait for modal close + row to render
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // No "Edit annual salary for Alice" button
    expect(screen.queryByRole('button', { name: /edit annual salary for alice/i })).not.toBeInTheDocument();
    // The row should have an editable salary input — find it via the textbox showing $98,000.
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const aliceSalaryInput = inputs.find((el) => /98,?000/.test(el.value));
    expect(aliceSalaryInput).toBeDefined();
  });

  it('Test 9: hourly import → read-only annual salary cell with Edit affordance', async () => {
    installFetchMock();
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-9" />);

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /select bob/i }));
    await user.click(within(dialog).getByRole('button', { name: /import 1 selected/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Edit button should exist for Bob
    const editBtn = await screen.findByRole('button', { name: /edit annual salary for bob/i });
    expect(editBtn).toBeInTheDocument();
    // (Xero) hint visible somewhere
    expect(screen.getAllByText(/xero/i).length).toBeGreaterThan(0);
  });

  it('Test 10: clicking Edit on hourly row makes salary editable + edit→edited pill', async () => {
    installFetchMock();
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-test-10"
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /select bob/i }));
    await user.click(within(dialog).getByRole('button', { name: /import 1 selected/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Click Edit
    const editBtn = await screen.findByRole('button', { name: /edit annual salary for bob/i });
    await user.click(editBtn);

    // _overriddenFields now includes 'currentSalary' (Edit click marks it).
    await waitFor(() => {
      expect(latestState!.teamMembers[0]._overriddenFields).toContain('currentSalary');
    });
    // Edited pill appears
    expect(await screen.findByText(/^edited$/i)).toBeInTheDocument();
  });

  it('Test 11: editing payFrequency on Xero-sourced row marks payFrequency overridden', async () => {
    installFetchMock();
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-test-11"
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /select alice/i }));
    await user.click(within(dialog).getByRole('button', { name: /import 1 selected/i }));

    await waitFor(() => {
      expect(latestState!.teamMembers.length).toBe(1);
    });

    // Find Alice's pay frequency dropdown (51-04b labeling)
    const dropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    await user.selectOptions(dropdown, 'monthly');

    await waitFor(() => {
      expect(latestState!.teamMembers[0]._overriddenFields).toContain('payFrequency');
    });
  });

  it('Test 12: editing a manual (non-Xero) row does NOT touch _overriddenFields', async () => {
    installFetchMock();
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    const mary: SeedMember = {
      name: 'Mary Manual',
      role: 'Bookkeeper',
      type: 'full-time',
      hoursPerWeek: 38,
      currentSalary: 70_000,
      increasePct: 0,
      isFromXero: false,
    };
    render(
      <Step4Harness
        businessId="biz-test-12"
        initialMembers={[mary]}
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    // Wait for Mary to be seeded
    await waitFor(() => {
      expect(latestState).not.toBeNull();
      expect(latestState!.teamMembers.length).toBe(1);
    });

    // Find Mary's pay frequency dropdown and change it
    const dropdown = (await screen.findByLabelText(/pay frequency for mary/i)) as HTMLSelectElement;
    await user.selectOptions(dropdown, 'weekly');

    await waitFor(() => {
      expect(latestState!.teamMembers[0].payFrequency).toBe('weekly');
    });
    // _overriddenFields untouched on a non-Xero row.
    expect(latestState!.teamMembers[0]._overriddenFields).toBeUndefined();
  });

  it('Test 13: empty employee list shows informational state + import button disabled', async () => {
    installFetchMock({ employees: [] });
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-13" />);

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no employees/i)).toBeInTheDocument();
    // The Import N selected button is either absent or disabled (selection size = 0)
    const importBtn = within(dialog).queryByRole('button', { name: /import \d+ selected/i });
    if (importBtn) {
      expect(importBtn).toBeDisabled();
    }
  });

  it('Test 14: rate-limit error response surfaces friendly message in modal', async () => {
    installFetchMock({ body: { error: 'Rate limit hit (429)' } });
    const user = userEvent.setup();
    render(<Step4Harness businessId="biz-test-14" />);

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/rate limit.*retry/i)).toBeInTheDocument();
  });

  it('Test 15: planned-hire branch — start_date > today + 7 days routes to addNewHire', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().slice(0, 10);
    const PLANNED = { ...ALICE, employee_id: 'emp-future-1', full_name: 'Cara Future', start_date: futureIso };
    installFetchMock({ employees: [PLANNED] });

    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="biz-test-15"
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /select cara/i }));
    await user.click(within(dialog).getByRole('button', { name: /import 1 selected/i }));

    await waitFor(() => {
      expect(latestState!.newHires.length).toBe(1);
    });
    expect(latestState!.teamMembers.length).toBe(0);
    expect(latestState!.newHires[0].startMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(latestState!.newHires[0]._xeroEmployeeId).toBe('emp-future-1');
  });

  it('Test 16: NO rollup math change — importing $0-salary employee leaves teamCosts unchanged', async () => {
    const ZERO = { ...BOB, employee_id: 'emp-zero', full_name: 'Zed Zero', hourly_rate: 0, annual_salary: 0, standard_hours: 0 };
    installFetchMock({ employees: [ZERO] });

    const user = userEvent.setup();
    let latestSummary: ReturnType<typeof useForecastWizard>['summary'] | null = null;
    render(
      <Step4Harness
        businessId="biz-test-16"
        onSummary={(s) => {
          latestSummary = s;
        }}
      />
    );

    // Capture BEFORE
    await waitFor(() => {
      expect(latestSummary).not.toBeNull();
    });
    const before = latestSummary!.year1.teamCosts;

    await user.click(await screen.findByRole('button', { name: /import from xero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /select zed/i }));
    await user.click(within(dialog).getByRole('button', { name: /import 1 selected/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await new Promise((r) => setTimeout(r, 20));

    // $0 salary → teamCosts unchanged
    expect(latestSummary!.year1.teamCosts).toBe(before);
  });
});
