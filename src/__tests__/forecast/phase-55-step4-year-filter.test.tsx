/**
 * Phase 55-01 — UX-S4-04: Step 4 year-card filter
 *
 * Three FY summary cards above the team table become a click-to-filter
 * affordance. Selecting a card narrows the visible Team Members /
 * Contractors rows to those on payroll during that fiscal year, surfaces
 * a "Showing FY{N} (...)" pill, and adds Starts/Leaves badges to rows
 * crossing the FY boundary. The filter is local view state — selectedYear
 * is NOT persisted to wizard state, defaults to null on every mount.
 *
 * Tests cover:
 *  - Default mount state: no selection, all rows visible, no pill, no badges
 *  - Click toggles selection: same card twice → cleared
 *  - Filtering by year hides departed members and excludes future hires
 *  - "Starts" / "Leaves" badges only render when a year is selected
 *  - Hint banner is dismissible and persists per-business in localStorage
 *  - "Show all years" pill action clears the selection
 *  - aria-pressed reflects selection state for screen-reader users
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step4Team } from '@/app/finances/forecast/components/wizard-v4/steps/Step4Team';
import type {
  TeamMember,
  NewHire,
  Departure,
  ForecastDuration,
} from '@/app/finances/forecast/components/wizard-v4/types';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

// Wizard fiscalYearStart is the START year (Jul of). The Step4Team
// `fiscalYear` prop is the END-of-FY label, so FY2027 = Jul-2026 → Jun-2027.
const FY_START_YEAR = 2026;
const FISCAL_YEAR_END = FY_START_YEAR + 1; // 2027 → "FY2027"
const FORECAST_DURATION: ForecastDuration = 3;

type SeedMember = Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>;
type SeedHire = Omit<NewHire, 'id' | 'superAmount'>;
type SeedDeparture = Omit<Departure, 'id'>;

interface HarnessProps {
  businessId: string;
  initialMembers?: SeedMember[];
  initialHires?: SeedHire[];
  initialDeparturesByMemberIndex?: { memberIndex: number; endMonth: string }[];
}

function Step4Harness({
  businessId,
  initialMembers = [],
  initialHires = [],
  initialDeparturesByMemberIndex = [],
}: HarnessProps) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  const memberSeedRef = React.useRef(false);
  const departureSeedRef = React.useRef(false);

  // Phase 1: seed members + hires immediately.
  React.useEffect(() => {
    if (memberSeedRef.current) return;
    memberSeedRef.current = true;
    initialMembers.forEach((m) => wizard.actions.addTeamMember(m));
    initialHires.forEach((h) => wizard.actions.addNewHire(h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 2: once members are in state, seed departures referencing real ids.
  React.useEffect(() => {
    if (departureSeedRef.current) return;
    if (wizard.state.teamMembers.length < initialMembers.length) return;
    departureSeedRef.current = true;
    initialDeparturesByMemberIndex.forEach(({ memberIndex, endMonth }) => {
      const teamMemberId = wizard.state.teamMembers[memberIndex]?.id;
      if (teamMemberId) {
        wizard.actions.addDeparture({ teamMemberId, endMonth });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.state.teamMembers.length]);

  // Hold render until full seed completes — otherwise tests assert before
  // departures land.
  const seedComplete =
    wizard.state.teamMembers.length >= initialMembers.length &&
    wizard.state.newHires.length >= initialHires.length &&
    wizard.state.departures.length >= initialDeparturesByMemberIndex.length;

  if (!seedComplete) return null;

  return (
    <Step4Team
      state={wizard.state}
      actions={wizard.actions}
      fiscalYear={FISCAL_YEAR_END}
      forecastDuration={FORECAST_DURATION}
    />
  );
}

function makeMember(name: string, overrides: Partial<SeedMember> = {}): SeedMember {
  return {
    name,
    role: 'Engineer',
    type: 'full-time',
    hoursPerWeek: 38,
    currentSalary: 100_000,
    increasePct: 0,
    isFromXero: false,
    ...overrides,
  };
}

function makeHire(role: string, startMonth: string, overrides: Partial<SeedHire> = {}): SeedHire {
  return {
    role,
    type: 'full-time',
    hoursPerWeek: 38,
    startMonth,
    salary: 90_000,
    ...overrides,
  };
}

describe('Phase 55-01 — UX-S4-04: Step 4 year-card filter', () => {
  it('default mount: no card selected, no filter pill, all rows visible, no badges', async () => {
    render(
      <Step4Harness
        businessId="biz-default"
        initialMembers={[
          makeMember('Alice', { name: 'Alice' }),
          makeMember('Bob', { name: 'Bob' }),
        ]}
      />
    );

    // Three year-cards rendered, none pressed.
    const card1 = await screen.findByTestId('year-card-1');
    const card2 = await screen.findByTestId('year-card-2');
    const card3 = await screen.findByTestId('year-card-3');
    expect(card1).toHaveAttribute('aria-pressed', 'false');
    expect(card2).toHaveAttribute('aria-pressed', 'false');
    expect(card3).toHaveAttribute('aria-pressed', 'false');

    // No filter pill visible.
    expect(screen.queryByTestId('year-filter-pill')).toBeNull();

    // No year-badges anywhere.
    expect(screen.queryByText(/^Starts /)).toBeNull();
    expect(screen.queryByText(/^Leaves /)).toBeNull();

    // Both seeded members are present in the table.
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bob')).toBeInTheDocument();
  });

  it('clicking a card sets aria-pressed and surfaces the filter pill with FY date range', async () => {
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-pill"
        initialMembers={[makeMember('Alice')]}
      />
    );

    const card2 = await screen.findByTestId('year-card-2');
    await user.click(card2);

    expect(card2).toHaveAttribute('aria-pressed', 'true');

    const pill = await screen.findByTestId('year-filter-pill');
    // FY2028 = Jul 2027 – Jun 2028 for default AU FY (yearStartMonth=7)
    expect(pill).toHaveTextContent(/Showing FY2028/);
    expect(pill).toHaveTextContent(/Jul 2027/);
    expect(pill).toHaveTextContent(/Jun 2028/);
  });

  it('clicking the same card twice toggles selection back to null (filter cleared)', async () => {
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-toggle"
        initialMembers={[makeMember('Alice')]}
      />
    );

    const card1 = await screen.findByTestId('year-card-1');
    await user.click(card1);
    expect(card1).toHaveAttribute('aria-pressed', 'true');

    await user.click(card1);
    expect(card1).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('year-filter-pill')).toBeNull();
  });

  it('selecting Y2 hides a Y3 hire and shows a Y2 hire with green Starts badge', async () => {
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-filter"
        initialMembers={[makeMember('Alice')]}
        initialHires={[
          // FY2028 (Y2): startMonth in Aug 2027 → FY2028
          makeHire('Y2 Hire', '2027-08'),
          // FY2029 (Y3): startMonth in Aug 2028 → FY2029
          makeHire('Y3 Hire', '2028-08'),
        ]}
      />
    );

    // Pre-click: all three rows visible (Alice + 2 TBD hires).
    const tbdRows = await screen.findAllByText('TBD');
    expect(tbdRows.length).toBeGreaterThanOrEqual(2);

    // Click Y2 card → only Y2 hire (Aug 2027) should remain among TBD rows.
    const card2 = screen.getByTestId('year-card-2');
    await user.click(card2);

    // Y2 Hire role should be visible; Y3 Hire role should be filtered out.
    const y2RoleInputs = await screen.findAllByDisplayValue('Y2 Hire');
    expect(y2RoleInputs.length).toBe(1);
    expect(screen.queryByDisplayValue('Y3 Hire')).toBeNull();

    // Y2 hire row gets a green "Starts Aug 2027" badge.
    const startsBadge = await screen.findByText(/^Starts Aug 2027$/);
    expect(startsBadge).toBeInTheDocument();
  });

  it('selecting the FY of a departure shows a red Leaves badge on the departing member', async () => {
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-leaves"
        initialMembers={[
          makeMember('Departing Dan'),
          makeMember('Steady Sue'),
        ]}
        // Dan leaves Mar 2028 → FY2028 (Y2 of forecast).
        initialDeparturesByMemberIndex={[{ memberIndex: 0, endMonth: '2028-03' }]}
      />
    );

    await screen.findByDisplayValue('Departing Dan');

    const card2 = screen.getByTestId('year-card-2');
    await user.click(card2);

    // Dan still appears (departed mid-FY → active that year) with Leaves badge.
    const leavesBadge = await screen.findByText(/^Leaves Mar 2028$/);
    expect(leavesBadge).toBeInTheDocument();
    expect(screen.getByDisplayValue('Departing Dan')).toBeInTheDocument();

    // Sue (no departure) still visible.
    expect(screen.getByDisplayValue('Steady Sue')).toBeInTheDocument();
  });

  it('a member who departed BEFORE the selected FY is filtered out', async () => {
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-departed"
        initialMembers={[
          makeMember('Gone Greg'),
          makeMember('Steady Sue'),
        ]}
        // Greg leaves Sep 2026 → FY2027 (Y1). By FY2028 (Y2) he is no longer on payroll.
        initialDeparturesByMemberIndex={[{ memberIndex: 0, endMonth: '2026-09' }]}
      />
    );

    await screen.findByDisplayValue('Gone Greg');

    const card2 = screen.getByTestId('year-card-2');
    await user.click(card2);

    // Greg gone in FY2028 view.
    expect(screen.queryByDisplayValue('Gone Greg')).toBeNull();
    // Sue still visible.
    expect(screen.getByDisplayValue('Steady Sue')).toBeInTheDocument();
  });

  it('hint banner is shown by default and dismiss persists per-business in localStorage', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Step4Harness
        businessId="biz-hint-1"
        initialMembers={[makeMember('Alice')]}
      />
    );

    const hint = await screen.findByTestId('year-filter-hint');
    expect(hint).toBeInTheDocument();

    // Dismiss the hint.
    const dismissBtn = screen.getByLabelText('Dismiss year filter hint');
    await user.click(dismissBtn);
    expect(screen.queryByTestId('year-filter-hint')).toBeNull();

    // localStorage records the dismissal under the business-scoped key.
    expect(window.localStorage.getItem('wizard-v4:step4-yearfilter-hint:biz-hint-1')).toBe('1');

    // Re-render the same business → hint stays dismissed.
    unmount();
    render(
      <Step4Harness
        businessId="biz-hint-1"
        initialMembers={[makeMember('Alice')]}
      />
    );
    // Wait long enough for the seed effect; hint must NOT appear.
    await screen.findByDisplayValue('Alice');
    expect(screen.queryByTestId('year-filter-hint')).toBeNull();
  });

  it('"Show all years" link in the pill clears the selection', async () => {
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="biz-clear"
        initialMembers={[makeMember('Alice')]}
      />
    );

    const card3 = await screen.findByTestId('year-card-3');
    await user.click(card3);
    const pill = await screen.findByTestId('year-filter-pill');

    const clearLink = within(pill).getByRole('button', { name: /Show all years/i });
    await user.click(clearLink);

    expect(screen.queryByTestId('year-filter-pill')).toBeNull();
    expect(card3).toHaveAttribute('aria-pressed', 'false');
  });
});

// CI trigger nudge
