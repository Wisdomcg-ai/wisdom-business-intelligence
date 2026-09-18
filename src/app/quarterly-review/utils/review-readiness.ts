/**
 * Quarterly Review — first-session ("Foundation") detection.
 *
 * A client attending their FIRST workshop has no goals, no targets, no KPIs and
 * no prior rocks. More than half the 12-step flow is data-dependent, so without
 * this the session opens on a wall of empty tables. Foundation mode keeps the
 * same steps and turns the backward-looking ones into baseline capture, so the
 * first session records where the business is starting from and quarter two has
 * something real to compare against.
 *
 * The mode is DERIVED, never stored — no new review_type, no CHECK-constraint
 * migration. Same pattern as the annual-reset gate.
 *
 * The pure decision lives here so it can be tested without a database; the hook
 * that reads the signals is in hooks/useReviewReadiness.ts.
 */

/**
 * A yes/no that is allowed to be neither.
 *
 * `unknown` is not a synonym for `no`. A query that failed tells us nothing, and
 * treating that silence as "this client has no plan" is how a client with a full
 * plan would get walked through building a second one.
 */
export type Signal = 'yes' | 'no' | 'unknown';

export interface ReviewReadiness {
  /** A completed quarterly review already exists for this business. */
  hasPriorReview: Signal;
  /** A business_financial_goals row exists — the root of targets and year type. */
  hasPlan: Signal;
  /** At least one KPI is configured. */
  hasKpis: Signal;
  /** Initiatives exist for the quarter being reflected on. */
  hasPriorRocks: Signal;
}

export const UNKNOWN_READINESS: ReviewReadiness = {
  hasPriorReview: 'unknown',
  hasPlan: 'unknown',
  hasKpis: 'unknown',
  hasPriorRocks: 'unknown',
};

/**
 * Is this a first session?
 *
 * Deliberately requires a positive `no`. On `unknown` we run the normal flow:
 * showing a client an empty-ish scorecard is a poor session, but walking a client
 * who already has a plan through building a second one corrupts their data. The
 * cheaper mistake wins.
 */
export function isFoundationMode(r: ReviewReadiness): boolean {
  return r.hasPriorReview === 'no' || r.hasPlan === 'no';
}

/** True when any signal could not be read — surface it, never paper over it. */
export function couldNotCheck(r: ReviewReadiness): boolean {
  return Object.values(r).some(v => v === 'unknown');
}

/**
 * What a given step should do.
 *
 * Steps ask the signal they actually depend on rather than the blanket mode,
 * because the two signals genuinely come apart: a coach may build the plan in the
 * Goals wizard before the client's first session (plan, no history), and a
 * long-standing client can have history but no current-year plan.
 */
export type StepMode = 'normal' | 'baseline' | 'build';

/** Steps that compare against history: Scorecard, Rocks Accountability, Clear the Decks. */
export function historyStepMode(r: ReviewReadiness): StepMode {
  return r.hasPriorReview === 'no' ? 'baseline' : 'normal';
}

/** Steps that need an annual plan to exist: Annual Plan & Confidence, Quarterly Plan. */
export function planStepMode(r: ReviewReadiness): StepMode {
  return r.hasPlan === 'no' ? 'build' : 'normal';
}
