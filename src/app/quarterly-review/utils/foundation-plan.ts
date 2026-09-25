/**
 * First-session ("Foundation") plan arithmetic — pure, so it can be pinned by
 * tests without a database.
 *
 * Matt, 22 Sep 2026: a first session sets JUST this year's numbers — revenue,
 * gross profit and net profit, plus the year type. No vision, no 3-year plan.
 * The baseline captured on the Scorecard seeds the annual targets, those split
 * evenly across the four quarters (adjustable), and the client picks their KPIs
 * from the same library the Goals wizard offers (25 Sep 2026 — the old cap of
 * three, added in one go, stranded a client who added one and wanted more).
 */
import type { YearType } from '../types';

/** The three money lines a first session sets. Everything else waits. */
export interface FoundationNumbers {
  revenue: number;
  grossProfit: number;
  netProfit: number;
}

export type QuarterSplit = [number, number, number, number];

export interface FoundationSplit {
  revenue: QuarterSplit;
  grossProfit: QuarterSplit;
  netProfit: QuarterSplit;
}

/** Whole dollars. Money in a plan is never fractional-cent. */
const dollars = (n: number): number => (Number.isFinite(n) ? Math.round(n) : 0);

/**
 * Seed an annual target from one quarter's actual: last quarter × 4.
 *
 * It is a starting point to edit, not a forecast — a first-timer adjusts a
 * number rather than inventing one. A loss (negative net profit) is carried
 * through honestly, not clamped. A line that was never entered seeds NOTHING
 * (null), never $0 — a blank box, not a $0 target someone could save by accident.
 */
export function seedAnnualFromBaseline(quarterActual: number | null | undefined): number | null {
  if (quarterActual === null || quarterActual === undefined || !Number.isFinite(quarterActual)) return null;
  return dollars(quarterActual * 4);
}

export type SeededNumbers = { [K in keyof FoundationNumbers]: number | null };

export function seedAnnualNumbers(baseline: Partial<FoundationNumbers> | null | undefined): SeededNumbers {
  return {
    revenue: seedAnnualFromBaseline(baseline?.revenue),
    grossProfit: seedAnnualFromBaseline(baseline?.grossProfit),
    netProfit: seedAnnualFromBaseline(baseline?.netProfit),
  };
}

export const isComplete = (n: SeededNumbers): n is FoundationNumbers =>
  n.revenue !== null && n.grossProfit !== null && n.netProfit !== null;

/**
 * A margin as the Goals wizard stores it: a percentage to two decimals
 * (160,000 of 500,000 → 32). Zero when there is no revenue to divide by.
 *
 * Stored alongside the dollars because readers use the stored margin, not the
 * dollars: the Forecast wizard seeds `gross_margin_year1 || 50`, so a plan
 * saved without margins opens its forecast at 50% gross / 15% net.
 */
export function marginPercent(part: number, revenue: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(revenue) || revenue <= 0) return 0;
  return Math.round((part / revenue) * 100 * 100) / 100;
}

/**
 * Split an annual figure across four quarters so they sum EXACTLY to the year.
 *
 * Naive annual ÷ 4 rounded per quarter drifts: $100,001 → 25,000 × 4 = $100,000,
 * a dollar short, and the plan no longer reconciles to its own annual target.
 * The remainder goes on Q4 so Q1–Q3 are the clean even figure. Handles
 * negatives (a planned loss) the same way.
 */
export function evenSplit(annual: number): QuarterSplit {
  const total = dollars(annual);
  const base = Math.trunc(total / 4);
  const q4 = total - base * 3;
  return [base, base, base, q4];
}

export function evenSplitAll(annual: FoundationNumbers): FoundationSplit {
  return {
    revenue: evenSplit(annual.revenue),
    grossProfit: evenSplit(annual.grossProfit),
    netProfit: evenSplit(annual.netProfit),
  };
}

export const sumSplit = (split: QuarterSplit): number => split.reduce((a, b) => a + b, 0);

/**
 * The last day of the plan year, as a calendar date string.
 *
 * Built as a string on purpose — never through a Date and toISOString, which in
 * an AEST browser turns local 30 June 00:00 into "29 June" (UTC). That is a live
 * bug in the Goals wizard, which stores 2027-06-29 for an FY27 plan. The
 * annual-reset gate reads this field, so it should say the real date.
 *
 * `planningYear` is the review's year — FY27's quarters carry year 2027 — so an
 * FY plan ends 30 June of that year and a CY plan on 31 December.
 */
export function year1EndDateFor(yearType: YearType, planningYear: number): string {
  return yearType === 'FY' ? `${planningYear}-06-30` : `${planningYear}-12-31`;
}

/**
 * The shape business_financial_goals.quarterly_targets already holds — string
 * values keyed revenue / grossProfit / netProfit → q1..q4. ScorecardReviewStep
 * parses exactly this (`parseFloat(quarterlyTargets.revenue?.[quarterKey])`).
 */
export function toQuarterlyTargetsJson(split: FoundationSplit): Record<
  'revenue' | 'grossProfit' | 'netProfit',
  { q1: string; q2: string; q3: string; q4: string }
> {
  const row = (s: QuarterSplit) => ({ q1: String(s[0]), q2: String(s[1]), q3: String(s[2]), q4: String(s[3]) });
  return {
    revenue: row(split.revenue),
    grossProfit: row(split.grossProfit),
    netProfit: row(split.netProfit),
  };
}

/** The planning quarter's slice, for review.quarterly_targets. */
export function planningQuarterTargets(split: FoundationSplit, planningQuarter: number): FoundationNumbers {
  const i = Math.min(Math.max(planningQuarter, 1), 4) - 1;
  return {
    revenue: split.revenue[i],
    grossProfit: split.grossProfit[i],
    netProfit: split.netProfit[i],
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * "Q1 FY2027 (July to September)" — the quarter the way the workshop header
 * names it, plus the months. "Q1 2027" alone reads as January–March to most
 * people, which is wrong for an FY business.
 */
export function describeQuarter(quarter: number, year: number, yearType: YearType): string {
  const q = Math.min(Math.max(quarter, 1), 4);
  const startMonth = (yearType === 'FY' ? 6 : 0) + (q - 1) * 3; // FY starts July (index 6)
  const first = MONTHS[startMonth % 12];
  const last = MONTHS[(startMonth + 2) % 12];
  const label = yearType === 'FY' ? `Q${q} FY${year}` : `Q${q} ${year}`;
  return `${label} (${first} to ${last})`;
}
