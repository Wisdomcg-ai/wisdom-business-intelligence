/**
 * Phase 74 R-1 — resolveBusinessProfileId: turns any of the three id-spaces
 * (business_profiles.id / businesses.id / user_id) into the canonical
 * business_profiles.id, or null. Must NEVER return a businesses.id.
 */
import { describe, it, expect } from 'vitest';
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds';

const PROFILE_ID = 'profile-aaa';
const BUSINESSES_ID = 'businesses-bbb';
const USER_ID = 'user-ccc';

type Row = { id: string; business_id: string; user_id: string };

/** Mock supabase whose maybeSingle() returns the row matching the last .eq(col,val). */
function makeSupabase(rows: Row[]) {
  return {
    from: (_table: string) => {
      let col = '';
      let val = '';
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: string) => {
          col = c;
          val = v;
          return builder;
        },
        maybeSingle: async () => {
          const match = rows.find((r) => (r as Record<string, string>)[col] === val);
          return { data: match ? { id: match.id } : null, error: null };
        },
      };
      return builder;
    },
  } as never;
}

const ONE: Row = { id: PROFILE_ID, business_id: BUSINESSES_ID, user_id: USER_ID };

describe('resolveBusinessProfileId', () => {
  it('returns the profile id when input IS a business_profiles.id', async () => {
    expect(await resolveBusinessProfileId(makeSupabase([ONE]), PROFILE_ID)).toBe(PROFILE_ID);
  });

  it('returns the profile id when input is a businesses.id', async () => {
    expect(await resolveBusinessProfileId(makeSupabase([ONE]), BUSINESSES_ID)).toBe(PROFILE_ID);
  });

  it('returns the profile id when input is an auth user_id', async () => {
    expect(await resolveBusinessProfileId(makeSupabase([ONE]), USER_ID)).toBe(PROFILE_ID);
  });

  it('returns null for an unknown id', async () => {
    expect(await resolveBusinessProfileId(makeSupabase([ONE]), 'does-not-exist')).toBeNull();
  });

  it('returns null for null/undefined input', async () => {
    expect(await resolveBusinessProfileId(makeSupabase([]), null)).toBeNull();
    expect(await resolveBusinessProfileId(makeSupabase([]), undefined)).toBeNull();
  });

  it('NEVER returns the businesses.id even when input is one', async () => {
    const result = await resolveBusinessProfileId(makeSupabase([ONE]), BUSINESSES_ID);
    expect(result).not.toBe(BUSINESSES_ID);
    expect(result).toBe(PROFILE_ID);
  });
});
