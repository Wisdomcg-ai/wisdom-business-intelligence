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
 *    given. Reusing it would switch off a client's other KPIs. KPIs here are
 *    written one at a time, each write naming the KPI it changes.
 *
 * business_financial_goals.business_id is UNIQUE, so a second plan cannot exist.
 */
import type { FoundationNumbers, FoundationSplit } from '../utils/foundation-plan';
import { toQuarterlyTargetsJson, marginPercent } from '../utils/foundation-plan';
import type { YearType } from '../types';

type Client = { from: (table: string) => any };

/** A KPI's stored figures, in the shape the Goals wizard's KPI table edits. */
export interface StoredKpiValues {
  currentValue: number;
  year1Target: number;
  year2Target: number;
  year3Target: number;
}

export interface FoundationKpi {
  id: string;
  name: string;
  plainName?: string;
  unit?: string;
  category?: string;
  frequency?: string;
  description?: string;
}

/**
 * Only the columns a first session sets. Nothing else is ever written.
 *
 * The two margins are derived from the three numbers and written WITH them, so
 * they can never disagree: the Goals wizard and the Forecast wizard both read
 * the stored margin, not the dollars (see marginPercent).
 */
const OWNED_ANNUAL_COLUMNS = [
  'revenue_year1',
  'gross_profit_year1',
  'net_profit_year1',
  'gross_margin_year1',
  'net_margin_year1',
  'year_type',
] as const;

// ---------------------------------------------------------------------------
// Saves still in flight.
//
// A step saves on a short delay after typing, and finishes any pending save as
// it closes — so clicking Continue straight after an edit (or straight after
// the suggestion appears) never loses it. But the NEXT step then reads the plan
// while that save may still be on the wire, and would see no plan, or the old
// numbers. Every plan write is tracked here, and a reader awaits them first.
// ---------------------------------------------------------------------------
const inFlight = new Set<Promise<unknown>>();

export function trackPlanWrite<T>(write: Promise<T>): Promise<T> {
  inFlight.add(write);
  const done = () => inFlight.delete(write);
  write.then(done, done);
  return write;
}

/** Resolves once every plan write started so far has finished, failed or not. */
export async function planWritesSettled(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}

/**
 * Save this year's three numbers.
 *
 * New plan → INSERT, with the 2- and 3-year money targets explicitly NULL so a
 *   plan nobody has projected forward reads as "not set", not as a $0 target.
 *   Every reader of those columns already tolerates NULL (checked 22 Sep 2026).
 * Existing plan → UPDATE only revenue/GP/NP year 1, their two margins and the
 *   year type. The plan year-end is filled only if it is empty; it is never moved.
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

  const revenue = Math.round(numbers.revenue);
  const grossProfit = Math.round(numbers.grossProfit);
  const netProfit = Math.round(numbers.netProfit);
  const owned = {
    revenue_year1: revenue,
    gross_profit_year1: grossProfit,
    net_profit_year1: netProfit,
    gross_margin_year1: marginPercent(grossProfit, revenue),
    net_margin_year1: marginPercent(netProfit, revenue),
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
 * Add ONE KPI to the client's list. There is no cap: a first session offers the
 * same library as the Goals wizard, one KPI at a time, as many as the client
 * wants (Matt, 25 Sep 2026 — the old "up to three, added in one go" picker hid
 * itself after JVJ added one, and they could not add a second).
 *
 * Deliberately NOT the Goals wizard's list save: that writes the whole list and
 * DEACTIVATES every KPI it was not handed, so a screen holding a partial or stale
 * list switches off the client's other KPIs. Each write here names the one KPI
 * it changes; target edits and removals go through KPIService's single-KPI
 * updateKPIValue / deleteKPI, which are keyed the same way.
 *
 * A KPI the client had before and removed comes back WITH its old targets: the
 * insert skips a row that already exists, and the second write only switches it
 * back on. It returns what is stored, so the screen shows those targets rather
 * than the zeros it started the new row with.
 */
export async function addFoundationKpi(
  supabase: Client,
  params: { profileId: string; userId: string; kpi: FoundationKpi }
): Promise<StoredKpiValues | null> {
  const { profileId, userId, kpi } = params;
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from('business_kpis').upsert(
    [
      {
        business_id: profileId,
        user_id: userId,
        kpi_id: kpi.id,
        name: kpi.name,
        friendly_name: kpi.plainName || kpi.name,
        description: kpi.description ?? null,
        category: kpi.category ?? null,
        frequency: kpi.frequency ?? null,
        unit: kpi.unit ?? null,
        current_value: 0,
        year1_target: 0,
        is_active: true,
        updated_at: now,
      },
    ],
    { onConflict: 'business_id,kpi_id', ignoreDuplicates: true }
  );
  if (insertError) throw insertError;

  const { data, error: activateError } = await supabase
    .from('business_kpis')
    .update({ is_active: true, updated_at: now })
    .eq('business_id', profileId)
    .eq('kpi_id', kpi.id)
    .select('current_value, year1_target, year2_target, year3_target');
  if (activateError) throw activateError;

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    currentValue: Number(row.current_value) || 0,
    year1Target: Number(row.year1_target) || 0,
    year2Target: Number(row.year2_target) || 0,
    year3Target: Number(row.year3_target) || 0,
  };
}

/** Exported for tests: the complete list of goal columns a first session may write. */
export const FOUNDATION_OWNED_COLUMNS = OWNED_ANNUAL_COLUMNS;

