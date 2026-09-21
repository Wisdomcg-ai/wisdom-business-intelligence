/**
 * Writes for the first-session ("Foundation") plan.
 *
 * Every write here is NON-DESTRUCTIVE by construction, because the coach can
 * force a first session for a client who already HAS a plan (the review_session
 * override). So nothing in this file may clear, zero or replace data the first
 * session did not set.
 *
 *  - The Goals wizard saves with a FULL-ROW upsert (every column, untouched ones
 *    defaulting to 0). Copying that here would wipe an existing client's 3-year
 *    ladder, core metrics and plan dates the moment a forced first session saved
 *    three numbers. So the annual plan INSERTS a new row, or UPDATES only the
 *    columns this session owns — never both at once.
 *  - The Goals wizard's KPI save DEACTIVATES every KPI not in the list it is
 *    given. Reusing it would switch off a client's other KPIs. KPIs here are only
 *    ever ADDED, and only when the client has none.
 *
 * business_financial_goals.business_id is UNIQUE, so a second plan cannot exist.
 */
import type { FoundationNumbers, FoundationSplit } from '../utils/foundation-plan';
import { toQuarterlyTargetsJson, FOUNDATION_KPI_LIMIT } from '../utils/foundation-plan';
import type { YearType } from '../types';

type Client = { from: (table: string) => any };

export interface FoundationKpi {
  id: string;
  name: string;
  plainName?: string;
  unit?: string;
  category?: string;
  frequency?: string;
  description?: string;
}

/** Only the columns a first session sets. Nothing else is ever written. */
const OWNED_ANNUAL_COLUMNS = ['revenue_year1', 'gross_profit_year1', 'net_profit_year1', 'year_type'] as const;

/**
 * Save this year's three numbers.
 *
 * New plan → INSERT, with the 2- and 3-year money targets explicitly NULL so a
 *   plan nobody has projected forward reads as "not set", not as a $0 target.
 *   Every reader of those columns already tolerates NULL (checked 22 Sep 2026).
 * Existing plan → UPDATE only revenue/GP/NP year 1 and the year type. The plan
 *   year-end is filled only if it is empty; it is never moved.
 */
export async function saveFoundationAnnualPlan(
  supabase: Client,
  params: {
    profileId: string;
    userId: string;
    numbers: FoundationNumbers;
    yearType: YearType;
    year1EndDate: string;
  }
): Promise<{ created: boolean }> {
  const { profileId, userId, numbers, yearType, year1EndDate } = params;

  const { data: existing, error: readError } = await supabase
    .from('business_financial_goals')
    .select('id, year1_end_date')
    .eq('business_id', profileId)
    .maybeSingle();
  if (readError) throw readError;

  const owned = {
    revenue_year1: Math.round(numbers.revenue),
    gross_profit_year1: Math.round(numbers.grossProfit),
    net_profit_year1: Math.round(numbers.netProfit),
    year_type: yearType,
  };

  const update = async (currentEnd: string | null | undefined) => {
    const patch: Record<string, unknown> = { ...owned, updated_at: new Date().toISOString() };
    if (!currentEnd) patch.year1_end_date = year1EndDate;
    const { error } = await supabase.from('business_financial_goals').update(patch).eq('business_id', profileId);
    if (error) throw error;
  };

  if (existing) {
    await update(existing.year1_end_date);
    return { created: false };
  }

  const { error: insertError } = await supabase.from('business_financial_goals').insert({
    business_id: profileId,
    user_id: userId,
    ...owned,
    year1_end_date: year1EndDate,
    revenue_year2: null,
    revenue_year3: null,
    gross_profit_year2: null,
    gross_profit_year3: null,
    net_profit_year2: null,
    net_profit_year3: null,
  });

  if (insertError) {
    // Another tab created the plan between our read and our insert. The row is
    // unique on business_id, so fall back to updating the columns we own.
    if (insertError.code === '23505') {
      const { data: raced } = await supabase
        .from('business_financial_goals')
        .select('year1_end_date')
        .eq('business_id', profileId)
        .maybeSingle();
      await update(raced?.year1_end_date);
      return { created: false };
    }
    throw insertError;
  }
  return { created: true };
}

/**
 * Save the quarterly split — only the quarterly_targets column, merged over what
 * is there so quarters the first session did not touch survive.
 */
export async function saveFoundationQuarterlyTargets(
  supabase: Client,
  params: { profileId: string; split: FoundationSplit }
): Promise<void> {
  const { data: row, error: readError } = await supabase
    .from('business_financial_goals')
    .select('quarterly_targets')
    .eq('business_id', params.profileId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error('No plan to split yet — save the annual numbers first');

  const existing =
    (typeof row.quarterly_targets === 'string' ? JSON.parse(row.quarterly_targets) : row.quarterly_targets) || {};
  const next = { ...existing, ...toQuarterlyTargetsJson(params.split) };

  const { error } = await supabase
    .from('business_financial_goals')
    .update({ quarterly_targets: next, updated_at: new Date().toISOString() })
    .eq('business_id', params.profileId);
  if (error) throw error;
}

/**
 * Add the client's first KPIs. Additive only, capped, and refused outright if
 * the client already has KPIs — this is first-time setup, not KPI management.
 */
export async function addFoundationKpis(
  supabase: Client,
  params: { profileId: string; userId: string; kpis: FoundationKpi[] }
): Promise<{ added: number }> {
  if (params.kpis.length === 0) return { added: 0 };
  if (params.kpis.length > FOUNDATION_KPI_LIMIT) {
    throw new Error(`A first session sets at most ${FOUNDATION_KPI_LIMIT} KPIs`);
  }

  const { count, error: countError } = await supabase
    .from('business_kpis')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', params.profileId)
    .eq('is_active', true);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error('This client already has KPIs — manage them in the Goals wizard');
  }

  const now = new Date().toISOString();
  const rows = params.kpis.map(k => ({
    business_id: params.profileId,
    user_id: params.userId,
    kpi_id: k.id,
    name: k.name,
    friendly_name: k.plainName || k.name,
    description: k.description ?? null,
    category: k.category ?? null,
    frequency: k.frequency ?? null,
    unit: k.unit ?? null,
    current_value: 0,
    year1_target: 0,
    is_active: true,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('business_kpis')
    .upsert(rows, { onConflict: 'business_id,kpi_id', ignoreDuplicates: true });
  if (error) throw error;
  return { added: rows.length };
}

/** Exported for tests: the complete list of goal columns a first session may write. */
export const FOUNDATION_OWNED_COLUMNS = OWNED_ANNUAL_COLUMNS;

