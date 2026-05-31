/**
 * R1b — write-path id guardrail for Xero money/line tables.
 *
 * `xero_pl_lines` and `xero_bs_lines` key their `business_id` column on
 * `business_profiles.id` — NOT `businesses.id`, and NOT a user-auth id. The
 * platform carries three disjoint UUID id-spaces (see
 * business/resolveBusinessProfileIds.ts), and `resolveBusinessProfileIds()` has
 * a deliberate fallback branch: when it cannot resolve the input against
 * `business_profiles`, it returns the SAME unresolved id for both `businessId`
 * and `profileId` so that read paths (`.in(all)`) degrade to "no rows" rather
 * than throwing.
 *
 * That fallback is safe for reads but dangerous for writes. If a wrong-id-class
 * value (a `businesses.id` or a user-auth id) reaches a money-table upsert via
 * `profileId`, one of two bad things happens:
 *   (a) in environments where the FK `xero_pl_lines.business_id → business_profiles(id)`
 *       is present, Postgres rejects the insert with a cryptic constraint error; or
 *   (b) in environments where that FK has drifted away (the exact failure class
 *       the R1a corrective migration addresses), the row is SILENTLY ORPHANED —
 *       money data written against an id that points at nothing, invisible to
 *       every downstream resolver. This is the recurring "report shows wrong /
 *       missing numbers" incident class.
 *
 * This guard turns both outcomes into one loud, diagnostic application error
 * raised BEFORE any write, so a misrouted id never reaches the money tables.
 * It performs a single indexed primary-key lookup; cheap relative to a full
 * Xero sync.
 */

type MinimalSupabase = { from: (table: string) => any }

export interface AssertProfileIdContext {
  /** The original id passed into the sync (for diagnostics). */
  input?: string
  /** The resolved businesses.id sibling (for diagnostics). */
  bizId?: string
}

/**
 * Assert that `profileId` references a real `business_profiles` row.
 *
 * Throws (loudly, with diagnostics) when:
 *   - the lookup itself errors, or
 *   - no `business_profiles` row exists with `id = profileId` (wrong-id-class).
 *
 * Returns void on success. Call this once, before any `xero_pl_lines` /
 * `xero_bs_lines` write in a sync run.
 */
export async function assertBusinessProfileId(
  supabase: MinimalSupabase,
  profileId: string,
  context: AssertProfileIdContext = {},
): Promise<void> {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error(
      `assertBusinessProfileId: profileId is missing or not a string ` +
        `(got ${JSON.stringify(profileId)}; input=${context.input ?? 'n/a'}). ` +
        `Refusing to write xero_pl_lines/xero_bs_lines money rows.`,
    )
  }

  const { data, error } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `assertBusinessProfileId: business_profiles lookup failed for ` +
        `profileId=${profileId}: ${(error as any)?.message ?? String(error)}`,
    )
  }

  if (!data?.id) {
    throw new Error(
      `assertBusinessProfileId: '${profileId}' is not a valid business_profiles.id ` +
        `(input=${context.input ?? 'n/a'}, bizId=${context.bizId ?? 'n/a'}). ` +
        `xero_pl_lines/xero_bs_lines.business_id must reference business_profiles(id); ` +
        `refusing to write money-table rows with a wrong-id-class value.`,
    )
  }
}
