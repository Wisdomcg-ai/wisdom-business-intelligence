/**
 * How a quarter's rocks went — the rocks figures on the review History page.
 *
 * A review is NAMED for the quarter it plans, and the rocks it plans are built
 * from its decisions as 'not_started'. Nothing moves that status on the review,
 * so counting 'completed' among them showed 0% for every review completed since
 * #594 (24 Sep 2026) — a "0%" that meant "not known here".
 *
 * The outcome is recorded one review later. Step 1.3 (`rocks_review`) holds the
 * rocks of the quarter a review looks back on to account, and
 * createQuarterlySnapshot files the same count as that quarter's
 * completion_rate. So a review's figure describes `reviewedQuarterOf(review)` —
 * the Q2 2027 review says how the Q1 2027 rocks went — and a review with no
 * step 1.3 record has no figure: "—", never 0%.
 *
 * Read from the review rather than the snapshot. The snapshot writes 0 when
 * nothing was assessed, and rows filed before the snapshot was fixed carry the
 * old model's counts and quarters.
 */
import { getQuarterLabel, reviewedQuarterOf, ROCK_REVIEW_DECISIONS } from '../types';
import type { QuarterlyReview, QuarterNumber, Rock, RockReviewDecision, RockReviewItem } from '../types';

export interface RocksOutcome {
  /** The quarter the rocks were set for: the one the review looked back on. */
  quarter: QuarterNumber;
  year: number;
  /** "Q1 2027", the way the History page names a quarter. */
  label: string;
  total: number;
  completed: number;
  /** Share completed, as a whole percentage. */
  percentage: number;
  /** How many took each step 1.3 decision. */
  counts: Record<RockReviewDecision, number>;
  /**
   * Typed from memory in a first session: the owner's priorities, which were
   * never rocks the system held (see foundation-rocks).
   */
  selfReported: boolean;
}

/** "Q1 2027": the quarter a review looked back on. */
export function reviewedQuarterName(review: Pick<QuarterlyReview, 'quarter' | 'year'>): string {
  const { quarter, year } = reviewedQuarterOf(review);
  return getQuarterLabel(quarter, year);
}

const isDecision = (value: unknown): value is RockReviewDecision =>
  (ROCK_REVIEW_DECISIONS as readonly unknown[]).includes(value);

/**
 * How the rocks a review held to account went, or null when it holds no
 * assessment — step 1.3 found no rocks, or the review never reached it.
 *
 * Every item counts, as step 1.3's own "N of M completed" and the snapshot
 * count them: a dropped rock is one that did not get done.
 */
export function reviewedRocksOutcome(
  review: Pick<QuarterlyReview, 'quarter' | 'year' | 'rocks_review'>,
): RocksOutcome | null {
  const items: RockReviewItem[] = Array.isArray(review.rocks_review)
    ? review.rocks_review.filter(Boolean)
    : [];
  if (items.length === 0) return null;

  const counts = Object.fromEntries(ROCK_REVIEW_DECISIONS.map(d => [d, 0])) as Record<RockReviewDecision, number>;
  for (const item of items) {
    if (isDecision(item.decision)) counts[item.decision] += 1;
  }

  const { quarter, year } = reviewedQuarterOf(review);
  return {
    quarter,
    year,
    label: getQuarterLabel(quarter, year),
    total: items.length,
    completed: counts.completed,
    percentage: Math.round((counts.completed / items.length) * 100),
    counts,
    selfReported: items.every(item => item.selfReported === true),
  };
}

/**
 * The "Avg Rocks Completion" card: the mean of each quarter's figure over the
 * completed reviews that held rocks to account, oldest quarter first. Null when
 * none did.
 *
 * Left out rather than counted as 0%: a review with no step 1.3 record. Left
 * out on Matt's call (27 Sep 2026), both shown on their own cards instead:
 * - a first session's recalled priorities, which were never rocks;
 * - statuses set by hand on a review's own rocks (Precision's seeded demo
 *   reviews), so the card has one source.
 *
 * Each quarter's percentage is rounded before averaging, so the average is the
 * mean of the figures the timeline shows.
 */
export function rocksCompletionTrend(
  reviews: ReadonlyArray<Pick<QuarterlyReview, 'status' | 'quarter' | 'year' | 'rocks_review'>>,
): { average: number; quarters: RocksOutcome[] } | null {
  const quarters = reviews
    .filter(review => review.status === 'completed')
    .map(review => reviewedRocksOutcome(review))
    .filter((outcome): outcome is RocksOutcome => outcome !== null && !outcome.selfReported)
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  if (quarters.length === 0) return null;

  const average = Math.round(quarters.reduce((sum, q) => sum + q.percentage, 0) / quarters.length);
  return { average, quarters };
}

/**
 * How many of the rocks a review SET are marked completed — only where someone
 * recorded a status on them. Null otherwise.
 *
 * The workshop builds every rock as 'not_started' and never moves it, so for
 * a real review this is null: its rocks' outcome belongs to the next review's
 * step 1.3. Only rocks written outside the workshop carry a status — on 26 Sep
 * 2026, Precision's seeded demo reviews (2 of 3 and 1 of 3 completed).
 */
export function plannedRocksProgress(rocks: ReadonlyArray<Pick<Rock, 'status'>>): { completed: number; total: number } | null {
  if (!rocks.some(rock => rock.status && rock.status !== 'not_started')) return null;
  return { completed: rocks.filter(rock => rock.status === 'completed').length, total: rocks.length };
}
