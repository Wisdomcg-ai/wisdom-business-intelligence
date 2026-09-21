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
 * The coach's standing choice for a client, from businesses.review_session_mode.
 *
 * Detection can only read the data. It cannot know that a half-set-up client, or
 * one whose plan is a year stale, should still be run as a first session — or
 * that a client who looks empty is mid-migration and should not be. That is a
 * coaching judgement, so the coach gets to make it.
 */
export type SessionModeOverride = 'auto' | 'first_session' | 'standard';

export const DEFAULT_SESSION_MODE: SessionModeOverride = 'auto';

/** Anything unrecognised (an older row, a value from a future build) reads as auto. */
export function toSessionModeOverride(value: unknown): SessionModeOverride {
  return value === 'first_session' || value === 'standard' ? value : 'auto';
}

/**
 * Is this a first session, on the data alone?
 *
 * Deliberately requires a positive `no`. On `unknown` we run the normal flow:
 * showing a client an empty-ish scorecard is a poor session, but walking a client
 * who already has a plan through building a second one corrupts their data. The
 * cheaper mistake wins.
 */
export function isFoundationMode(r: ReviewReadiness): boolean {
  return r.hasPriorReview === 'no' || r.hasPlan === 'no';
}

/**
 * What actually runs: the coach's choice, or detection when they haven't made one.
 *
 * An explicit choice wins outright — including over an `unknown` signal. The
 * caution in `isFoundationMode` exists because a GUESS could be wrong in a costly
 * direction; a coach who has ticked the box is not guessing.
 */
export function effectiveFoundationMode(
  override: SessionModeOverride,
  r: ReviewReadiness
): boolean {
  if (override === 'first_session') return true;
  if (override === 'standard') return false;
  return isFoundationMode(r);
}

/** True when the coach's choice is what decided it, rather than the data. */
export function isOverridden(override: SessionModeOverride, r: ReviewReadiness): boolean {
  return override !== 'auto' && effectiveFoundationMode(override, r) !== isFoundationMode(r);
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

/**
 * Steps that compare against history: Scorecard, Rocks Accountability, Clear the Decks.
 *
 * The override is ONE switch (Matt's call — simpler to reason about than two), so
 * forcing a first session forces baseline capture even for a client who has some
 * history. That is the point: the coach has decided this session starts fresh.
 */
export function historyStepMode(
  r: ReviewReadiness,
  override: SessionModeOverride = 'auto'
): StepMode {
  if (override === 'first_session') return 'baseline';
  if (override === 'standard') return 'normal';
  return r.hasPriorReview === 'no' ? 'baseline' : 'normal';
}

/**
 * Steps that need an annual plan to exist: Annual Plan & Confidence, Quarterly Plan.
 *
 * NOTE for the step that consumes this (F4): `build` does NOT mean "no plan
 * exists". A coach can force a first session for a client who already has one, so
 * a build-mode plan step MUST upsert the existing business_financial_goals row
 * rather than insert — otherwise forcing the mode would leave the client with two
 * plans and the readers pick whichever sorts first.
 */
export function planStepMode(
  r: ReviewReadiness,
  override: SessionModeOverride = 'auto'
): StepMode {
  if (override === 'first_session') return 'build';
  if (override === 'standard') return 'normal';
  return r.hasPlan === 'no' ? 'build' : 'normal';
}

/**
 * The program type that means "no coaching" — so no quarterly workshop either.
 *
 * `businesses.program_type` is the system's own record of what a client buys,
 * set from each client's Profile tab. Its options are '1:1 Coaching',
 * 'Think Bigger', 'Coaching + CFO Services' and 'CFO Services Only', and the
 * app's own description of the last is "no coaching program".
 *
 * Deliberately keyed on program_type and NOT on `is_cfo_client`: that flag is
 * true for 'Coaching + CFO Services' too, so excluding on it would drop clients
 * like Efficient Living who do both and run workshops.
 */
export const CFO_ONLY_PROGRAM = 'CFO Services Only';

/**
 * Does this client take part in quarterly workshops?
 *
 * Only an explicit CFO-only program opts a client out. Blank means "not set",
 * and a blank client stays in — dropping a coaching client from the list is the
 * costlier mistake than showing a CFO client who doesn't need it.
 */
export function isInWorkshopProgramme(programType: string | null | undefined): boolean {
  return programType !== CFO_ONLY_PROGRAM;
}
