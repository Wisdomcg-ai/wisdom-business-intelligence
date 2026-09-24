/**
 * Gather what the one-page plan prints that the review row does not hold: the
 * business's name, this year's numbers, and the KPIs it watches.
 *
 * Everything is read THROUGH THE BUSINESS on the review, never through the
 * logged-in person — a coach exporting a client's plan has no plan of their own,
 * and the summary page's older "try the current user's ids" lookup is exactly
 * how one client's figures end up on another's page.
 *
 * Each read fails on its own. A KPI table that will not answer costs the page
 * its "numbers I'm watching" block, not the whole export, and the caller is told
 * WHICH part is missing so it can say so — a plan silently missing its targets
 * looks like a plan with no targets.
 */
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds';
import { resolveKpiTarget } from '@/lib/kpi/target-source';
import type { QuarterlyReview, YearType } from '../types';
import type { PlanKpi, PlanMoneyLines } from '../utils/quarterly-plan-page';

type Client = { from: (table: string) => any };

export interface PlanPdfData {
  businessName: string | null;
  yearType: YearType;
  annual: (PlanMoneyLines & { yearEnd: string | null }) | null;
  quarterFromPlan: PlanMoneyLines | null;
  kpis: PlanKpi[];
  /** Parts that could not be read, in plain words, for the caller to show. */
  missing: string[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The plan's figures for one quarter, out of the stored `{revenue:{q1..q4}}` shape. */
function quarterSlice(stored: unknown, quarter: number): PlanMoneyLines | null {
  if (!stored) return null;
  const q = typeof stored === 'string' ? safeParse(stored) : (stored as Record<string, any>);
  if (!q) return null;
  const key = `q${Math.min(Math.max(quarter, 1), 4)}`;
  const line = (row: any) => num(row?.[key]);
  const slice = {
    revenue: line(q.revenue),
    grossProfit: line(q.grossProfit),
    netProfit: line(q.netProfit),
  };
  return slice.revenue === null && slice.grossProfit === null && slice.netProfit === null ? null : slice;
}

function safeParse(s: string): Record<string, any> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function loadPlanPdfData(
  supabase: Client,
  review: Pick<QuarterlyReview, 'business_id' | 'quarter'>
): Promise<PlanPdfData> {
  const out: PlanPdfData = {
    businessName: null,
    yearType: 'FY',
    annual: null,
    quarterFromPlan: null,
    kpis: [],
    missing: [],
  };

  // The name, from the businesses row the review belongs to.
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', review.business_id)
      .maybeSingle();
    if (error) throw error;
    out.businessName = data?.name ?? null;
  } catch {
    // A page without the business's name is still the client's plan.
    out.businessName = null;
  }

  let profileId: string | null = null;
  try {
    profileId = await resolveBusinessProfileId(supabase as any, review.business_id);
  } catch {
    profileId = null;
  }

  if (!profileId) {
    out.missing.push('this year’s targets', 'the numbers you’re watching');
    return out;
  }

  const [goals, kpis] = await Promise.allSettled([
    supabase
      .from('business_financial_goals')
      .select('revenue_year1, gross_profit_year1, net_profit_year1, year_type, year1_end_date, quarterly_targets')
      .eq('business_id', profileId)
      .maybeSingle(),
    supabase
      .from('business_kpis')
      .select('name, friendly_name, unit, year1_target, target_value')
      .eq('business_id', profileId)
      .eq('is_active', true),
  ]);

  if (goals.status === 'fulfilled' && !goals.value?.error) {
    const g = goals.value?.data;
    if (g) {
      out.yearType = (g.year_type as YearType) || 'FY';
      out.annual = {
        revenue: num(g.revenue_year1),
        grossProfit: num(g.gross_profit_year1),
        netProfit: num(g.net_profit_year1),
        yearEnd: g.year1_end_date ?? null,
      };
      out.quarterFromPlan = quarterSlice(g.quarterly_targets, review.quarter);
    }
  } else {
    out.missing.push('this year’s targets');
  }

  if (kpis.status === 'fulfilled' && !kpis.value?.error) {
    out.kpis = ((kpis.value?.data as any[]) ?? []).map(k => ({
      // The plain-English name is the one the client chose to see.
      name: k.friendly_name || k.name,
      // A KPI can hold its target in either column (year1_target defaults to 0;
      // Precision keeps its figures in target_value). The One-Page Plan reads
      // them through the same rule, so the two pages cannot disagree on a KPI.
      target: resolveKpiTarget(k.year1_target, k.target_value),
      unit: k.unit ?? null,
    }));
  } else {
    out.missing.push('the numbers you’re watching');
  }

  return out;
}
