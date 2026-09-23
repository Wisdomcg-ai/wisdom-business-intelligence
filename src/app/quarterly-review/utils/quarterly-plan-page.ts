/**
 * What goes on the client's one-page plan, and in what order.
 *
 * Kept apart from the drawing so the CONTENT can be pinned by tests without a
 * PDF: which sections appear, what each figure says, how a quarter is named.
 * The renderer takes this and puts ink on paper — it decides nothing.
 *
 * The rule the whole file follows: a section with nothing in it is LEFT OUT.
 * A first session fills three of these blocks and leaves the rest empty, and a
 * page of empty headings reads as a form the owner failed to fill in, rather
 * than the plan they just built.
 */
import type { QuarterlyReview, QuarterlyTargets, Rock, PersonalCommitments, YearType } from '../types';

export type PlanBlock =
  | { kind: 'figures'; title: string; note?: string; items: { label: string; value: string }[] }
  /** One line of supporting figures — "Revenue $400,000 · Gross profit $160,000". */
  | { kind: 'inline'; title: string; items: { label: string; value: string }[]; footnote?: string }
  | { kind: 'numbered'; title: string; items: { text: string; detail?: string }[] }
  | { kind: 'bullets'; title: string; items: { text: string; detail?: string }[] }
  | { kind: 'text'; title: string; body: string }
  | { kind: 'checklist'; title: string; items: string[] };

export interface PlanPage {
  businessName: string | null;
  /** "Q2 FY2027 Plan" */
  title: string;
  /** "October to December 2026" */
  period: string;
  /** "Prepared 23 September 2026" */
  preparedOn: string;
  blocks: PlanBlock[];
}

export interface PlanMoneyLines {
  revenue: number | null;
  grossProfit: number | null;
  netProfit: number | null;
}

export interface PlanKpi {
  name: string;
  target?: number | null;
  unit?: string | null;
}

export interface PlanPageInput {
  review: Pick<
    QuarterlyReview,
    'quarter' | 'year' | 'quarterly_targets' | 'quarterly_rocks' | 'personal_commitments' | 'one_thing_answer' | 'one_thing_for_success'
  >;
  businessName: string | null;
  yearType: YearType;
  /** This year's numbers from the plan, and the date the plan year ends. */
  annual: (PlanMoneyLines & { yearEnd?: string | null }) | null;
  /** The plan's own figures for this quarter — used when the review carries none. */
  quarterFromPlan?: PlanMoneyLines | null;
  kpis: PlanKpi[];
  /** Passed in, never read off the clock inside — an unpinned date is a test that fails next month. */
  now: Date;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `$120,000`, `($5,000)` for a planned loss, `—` for a figure nobody set. */
export function planMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = '$' + Math.abs(Math.round(n)).toLocaleString('en-AU');
  return Math.round(n) < 0 ? `(${abs})` : abs;
}

/**
 * The calendar months a quarter covers, with the year they fall in.
 *
 * An FY quarter is not its label's year: Q2 FY2027 is October to December
 * **2026**, and printing "2027" on the page a client pins to the wall is the
 * kind of error that makes them distrust the rest of it.
 */
export function quarterPeriodLabel(quarter: number, year: number, yearType: YearType): string {
  const q = Math.min(Math.max(quarter, 1), 4);
  // FY2027 runs July 2026 → June 2027, so month 0 of the FY is July of year-1.
  const start = yearType === 'FY' ? 6 + (q - 1) * 3 : (q - 1) * 3;
  const baseYear = yearType === 'FY' ? year - 1 : year;
  const startYear = baseYear + Math.floor(start / 12);
  const endIndex = start + 2;
  const endYear = baseYear + Math.floor(endIndex / 12);
  const first = MONTHS[start % 12];
  const last = MONTHS[endIndex % 12];
  return startYear === endYear
    ? `${first} to ${last} ${endYear}`
    : `${first} ${startYear} to ${last} ${endYear}`;
}

/** The last calendar month a quarter covers, as months since year 0 — for comparing against a plan year-end. */
function quarterEndMonths(quarter: number, year: number, yearType: YearType): number {
  const q = Math.min(Math.max(quarter, 1), 4);
  const start = yearType === 'FY' ? 6 + (q - 1) * 3 : (q - 1) * 3;
  const baseYear = yearType === 'FY' ? year - 1 : year;
  return baseYear * 12 + start + 2;
}

/**
 * Whether this year's plan is the plan for THIS quarter's year.
 *
 * A plan rolls forward. Precision Electrical Group's Q2 FY2026 review (October
 * to December 2025) printed "The year to 30 June 2027" with today's targets on
 * it — figures from a year that quarter knew nothing about. The quarter has to
 * fall inside the plan's own year, or the year block is left off entirely: the
 * plan for that quarter's year is no longer recorded anywhere, and nothing is
 * better than another year's numbers.
 *
 * A plan with no year-end cannot be placed either way, so it is shown — almost
 * every plan is the current one.
 */
export function planYearCoversQuarter(
  yearEnd: string | null | undefined,
  quarter: number,
  year: number,
  yearType: YearType
): boolean {
  const m = /^(\d{4})-(\d{2})/.exec(yearEnd ?? '');
  if (!m) return true;
  const planEnd = Number(m[1]) * 12 + (Number(m[2]) - 1);
  const quarterEnd = quarterEndMonths(quarter, year, yearType);
  return quarterEnd <= planEnd && quarterEnd > planEnd - 12;
}

/** "Q2 FY2027" / "Q2 2027" — the way the workshop header names it. */
export function quarterTitle(quarter: number, year: number, yearType: YearType): string {
  const q = Math.min(Math.max(quarter, 1), 4);
  return yearType === 'FY' ? `Q${q} FY${year}` : `Q${q} ${year}`;
}

/**
 * "30 June 2027" from "2027-06-30".
 *
 * Read off the string, never through a Date: `new Date('2027-06-30')` is UTC
 * midnight, which prints as the 29th anywhere west of Greenwich.
 */
export function formatPlainDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

function formatDay(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const filled = (n: number | null | undefined): boolean => n !== null && n !== undefined && Number.isFinite(n) && n !== 0;
const anyFilled = (m: PlanMoneyLines | null | undefined): boolean =>
  !!m && (filled(m.revenue) || filled(m.grossProfit) || filled(m.netProfit));

const moneyItems = (m: PlanMoneyLines) => [
  { label: 'Revenue', value: planMoney(m.revenue) },
  { label: 'Gross profit', value: planMoney(m.grossProfit) },
  { label: 'Net profit', value: planMoney(m.netProfit) },
];

/** A KPI's target, in its own units — `$40,000`, `35%`, `120`. */
export function kpiTargetLabel(kpi: PlanKpi): string | null {
  const t = kpi.target;
  if (t === null || t === undefined || !Number.isFinite(t) || t === 0) return null;
  if (kpi.unit === '$') return planMoney(t);
  if (kpi.unit === '%') return `${t}%`;
  return `${t.toLocaleString('en-AU')}${kpi.unit ? ` ${kpi.unit}` : ''}`;
}

/**
 * How many KPIs the page prints before it starts costing the client their one
 * page. Precision Electrical Group carries ten active KPIs; listing all ten
 * pushes the plan onto a second sheet.
 */
export const MAX_KPIS_ON_PAGE = 6;

const NEXT_STEPS = [
  'Update your One Page Business Plan',
  'Put your rocks in the calendar',
  'Book your days off in advance',
  'Share this plan with your team',
];

function rockDetail(rock: Rock): string | undefined {
  const parts: string[] = [];
  if (rock.owner?.trim()) parts.push(rock.owner.trim());
  const due = formatPlainDate(rock.targetDate);
  if (due) parts.push(`by ${due}`);
  const done = (rock.successCriteria || rock.doneDefinition || '').trim();
  const who = parts.join(' · ');
  if (who && done) return `${who} — ${done}`;
  return who || done || undefined;
}

/**
 * Hours, days off and the personal goal — one block, not three.
 *
 * These are a line of context under the quarter's numbers, and giving each its
 * own heading and tile is what pushed "Next steps" onto a second, near-empty
 * page in the first render of this page.
 */
function commitmentBlocks(c: PersonalCommitments | null | undefined): PlanBlock[] {
  if (!c) return [];
  const items: { label: string; value: string }[] = [];
  if (filled(c.hoursPerWeekTarget)) items.push({ label: 'Hours a week', value: String(c.hoursPerWeekTarget) });
  if (filled(c.daysOffPlanned)) items.push({ label: 'Days off planned', value: String(c.daysOffPlanned) });
  const goal = c.personalGoal?.trim();
  if (items.length === 0 && !goal) return [];
  if (items.length === 0) return [{ kind: 'text', title: 'My commitments', body: goal as string }];
  return [{ kind: 'inline', title: 'My commitments', items, footnote: goal || undefined }];
}

/**
 * Build the page.
 *
 * The quarter's targets come from the review, which is what the workshop's own
 * summary shows. Older reviews (before the plan steps wrote them back) carry
 * zeroes, so the plan's own figures for that quarter stand in — the number the
 * client agreed to, from wherever it is actually recorded.
 */
export function buildPlanPage(input: PlanPageInput): PlanPage {
  const { review, yearType, annual, kpis, now } = input;
  const reviewTargets = review.quarterly_targets as QuarterlyTargets | null;
  const fromReview: PlanMoneyLines = {
    revenue: reviewTargets?.revenue ?? null,
    grossProfit: reviewTargets?.grossProfit ?? null,
    netProfit: reviewTargets?.netProfit ?? null,
  };
  const quarter = anyFilled(fromReview) ? fromReview : input.quarterFromPlan ?? null;

  const blocks: PlanBlock[] = [];

  // The quarter is the hero — the only figures big enough to read across a room.
  if (anyFilled(quarter)) {
    blocks.push({ kind: 'figures', title: 'My targets this quarter', items: moneyItems(quarter as PlanMoneyLines) });
  }

  // The year is context for those, so it takes one line rather than three tiles —
  // and only when the plan on file is the plan for THIS quarter's year.
  if (anyFilled(annual) && planYearCoversQuarter(annual?.yearEnd, review.quarter, review.year, yearType)) {
    const yearEnd = formatPlainDate(annual?.yearEnd);
    blocks.push({
      kind: 'inline',
      title: yearEnd ? `The year to ${yearEnd}` : 'The year',
      items: moneyItems(annual as PlanMoneyLines),
    });
  }

  // The KPIs THIS QUARTER committed to, not whatever the business tracks today.
  // A review from a year ago targeted three; the business now has ten, and
  // printing today's ten puts numbers on an old plan that nobody agreed to.
  const targetedKpis: PlanKpi[] = (reviewTargets?.kpis ?? []).map(k => ({
    name: k.name,
    target: k.target,
    unit: k.unit ?? null,
  }));
  const watchable = (targetedKpis.length > 0 ? targetedKpis : kpis).filter(k => k?.name?.trim());
  if (watchable.length > 0) {
    const shown = watchable.slice(0, MAX_KPIS_ON_PAGE);
    const items = shown.map(k => {
      const target = kpiTargetLabel(k);
      return { text: k.name.trim(), detail: target ? `Target ${target}` : undefined };
    });
    // Never drop the rest silently — a shortened list that says nothing reads
    // as the whole list.
    const hidden = watchable.length - shown.length;
    if (hidden > 0) {
      items.push({ text: `and ${hidden} more on your KPI dashboard`, detail: undefined });
    }
    blocks.push({ kind: 'bullets', title: 'Numbers I’m watching', items });
  }

  const rocks = (review.quarterly_rocks as Rock[] | null) ?? [];
  const namedRocks = rocks.filter(r => r?.title?.trim());
  if (namedRocks.length > 0) {
    blocks.push({
      kind: 'numbered',
      title: 'My rocks this quarter',
      items: namedRocks.map(r => ({ text: r.title.trim(), detail: rockDetail(r) })),
    });
  }

  const oneThing = (review.one_thing_answer || review.one_thing_for_success || '').trim();
  if (oneThing) {
    blocks.push({ kind: 'text', title: 'The one thing that would make this quarter a success', body: oneThing });
  }

  blocks.push(...commitmentBlocks(review.personal_commitments as PersonalCommitments | null));

  blocks.push({ kind: 'checklist', title: 'Next steps', items: [...NEXT_STEPS] });

  return {
    businessName: input.businessName?.trim() || null,
    title: `${quarterTitle(review.quarter, review.year, yearType)} Plan`,
    period: quarterPeriodLabel(review.quarter, review.year, yearType),
    preparedOn: `Prepared ${formatDay(now)}`,
    blocks,
  };
}

/** "Test ABC - Q2 FY2027 Plan.pdf", in the shape the monthly pack's name follows. */
export function planPdfFilename(businessName: string | null | undefined, title: string): string {
  const name = (businessName ?? '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/, '');
  return `${name ? `${name} - ` : ''}${title}.pdf`;
}
