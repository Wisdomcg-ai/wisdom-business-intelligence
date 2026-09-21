/**
 * The workshop readiness list: who is on it, and whose data each row shows.
 *
 * 1. CFO-only clients are not workshop candidates (Matt, 22 Sep 2026: "CFO Only
 *    clients will not be part of the workshop"). Keyed on program_type, never on
 *    is_cfo_client — that flag is also true for 'Coaching + CFO Services', and
 *    excluding on it would drop Efficient Living, which does both and has already
 *    run a workshop.
 *
 * 2. Each business shows ITS OWN profile. The page used to match profiles by
 *    owner, so a person owning two businesses got one profile's data on both
 *    rows. The real link is business_profiles.business_id → businesses.id.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { isInWorkshopProgramme, CFO_ONLY_PROGRAM } from '@/app/quarterly-review/utils/review-readiness';

describe('who takes part in workshops', () => {
  it('drops an explicit CFO-only client', () => {
    expect(isInWorkshopProgramme(CFO_ONLY_PROGRAM)).toBe(false);
  });

  it('keeps a client who does coaching AND CFO', () => {
    expect(isInWorkshopProgramme('Coaching + CFO Services')).toBe(true);
  });

  it('keeps every coaching program', () => {
    expect(isInWorkshopProgramme('1:1 Coaching')).toBe(true);
    expect(isInWorkshopProgramme('Think Bigger')).toBe(true);
  });

  it('keeps a client whose program is not set', () => {
    // Blank means "not recorded", not "CFO-only". Dropping a coaching client is
    // the costlier mistake.
    expect(isInWorkshopProgramme(null)).toBe(true);
    expect(isInWorkshopProgramme(undefined)).toBe(true);
    expect(isInWorkshopProgramme('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
const SAME_OWNER = 'owner-with-two';

const BUSINESSES = [
  { id: 'b-coach', name: 'Coaching Co', owner_id: 'o1', review_session_mode: 'auto', program_type: '1:1 Coaching' },
  { id: 'b-both', name: 'Efficient Living', owner_id: 'o2', review_session_mode: 'auto', program_type: 'Coaching + CFO Services' },
  { id: 'b-cfo1', name: 'Urban Road', owner_id: 'o3', review_session_mode: 'auto', program_type: 'CFO Services Only' },
  { id: 'b-cfo2', name: 'Dragon Roofing', owner_id: 'o4', review_session_mode: 'auto', program_type: 'CFO Services Only' },
  { id: 'b-unset', name: 'Unset Co', owner_id: 'o5', review_session_mode: 'auto', program_type: null },
  // One person owns two businesses, each with its own profile and its own data.
  { id: 'b-twin-a', name: 'Twin A', owner_id: SAME_OWNER, review_session_mode: 'auto', program_type: null },
  { id: 'b-twin-b', name: 'Twin B', owner_id: SAME_OWNER, review_session_mode: 'auto', program_type: null },
];

const PROFILES = [
  { id: 'p-coach', business_id: 'b-coach', business_name: 'Coaching Co' },
  { id: 'p-both', business_id: 'b-both', business_name: 'Efficient Living' },
  { id: 'p-cfo1', business_id: 'b-cfo1', business_name: 'Urban Road' },
  { id: 'p-cfo2', business_id: 'b-cfo2', business_name: 'Dragon Roofing' },
  { id: 'p-unset', business_id: 'b-unset', business_name: 'Unset Co' },
  { id: 'p-twin-a', business_id: 'b-twin-a', business_name: 'Twin A' },
  { id: 'p-twin-b', business_id: 'b-twin-b', business_name: 'Twin B' },
];

// Only Twin A has a plan. If profiles were matched by owner, Twin B would
// borrow Twin A's (or vice versa) and the two rows would read the same.
const GOALS = [{ business_id: 'p-twin-a' }];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const data =
        table === 'businesses' ? BUSINESSES
        : table === 'business_profiles' ? PROFILES
        : table === 'business_financial_goals' ? GOALS
        : [];
      const b: any = {
        select: () => b, in: () => b, eq: () => b, update: () => b,
        then: (r: any) => Promise.resolve({ data, error: null }).then(r),
      };
      return b;
    },
  }),
}));

vi.mock('@/hooks/useBusinessContext', () => ({
  useBusinessContext: () => ({ currentUser: { role: 'admin' }, isLoading: false }),
}));

import ReviewReadinessPage from '@/app/quarterly-review/readiness/page';

const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('tbody tr')).map(tr => ({
    name: tr.querySelector('td .font-medium')?.textContent ?? '',
    planCell: tr.querySelectorAll('td')[1]?.innerHTML ?? '',
  }));

describe('the readiness list', () => {
  it('leaves CFO-only clients off and says how many', async () => {
    const { container } = render(<ReviewReadinessPage />);
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0));

    const names = rows(container).map(r => r.name);
    expect(names).not.toContain('Urban Road');
    expect(names).not.toContain('Dragon Roofing');
    expect(container.textContent).toMatch(/2 CFO-only clients/);
  });

  it('keeps a client who does both, and one whose program is unset', async () => {
    const { container } = render(<ReviewReadinessPage />);
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0));

    const names = rows(container).map(r => r.name);
    expect(names).toContain('Efficient Living');
    expect(names).toContain('Unset Co');
    expect(names).toContain('Coaching Co');
  });

  it('shows each business its OWN profile when one person owns two', async () => {
    const { container } = render(<ReviewReadinessPage />);
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0));

    const twinA = rows(container).find(r => r.name === 'Twin A');
    const twinB = rows(container).find(r => r.name === 'Twin B');
    expect(twinA).toBeDefined();
    expect(twinB).toBeDefined();
    // Only Twin A has a plan. Matched by owner, both rows would read alike.
    expect(twinA!.planCell).toContain('aria-label="yes"');
    expect(twinB!.planCell).toContain('aria-label="no"');
  });
});
