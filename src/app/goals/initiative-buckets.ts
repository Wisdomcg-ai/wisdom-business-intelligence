/**
 * The buckets of strategic initiatives the goals page saves, and the
 * `strategic_initiatives.step_type` each one is stored under.
 *
 * One list, so a bucket cannot exist on the client and not on the server. It
 * could before: Step 4's planning-season column sent `current_remainder`, the
 * save route's own copy of this list did not mention it, and the route's loop
 * skips a bucket it does not know — the coach's edits to that column were
 * dropped and the save still answered success.
 */
export interface InitiativeBucket {
  /** The key the client sends inside `initiatives`. */
  key: string
  /** The `step_type` its rows are stored under. */
  stepType: string
}

export const INITIATIVE_BUCKETS: readonly InitiativeBucket[] = [
  { key: 'strategicIdeas', stepType: 'strategic_ideas' },
  { key: 'roadmapSuggestions', stepType: 'roadmap' },
  { key: 'twelveMonthInitiatives', stepType: 'twelve_month' },
  // Step 4's "Current FY remainder" pseudo-quarter, shown in planning season.
  { key: 'current_remainder', stepType: 'current_remainder' },
  { key: 'q1', stepType: 'q1' },
  { key: 'q2', stepType: 'q2' },
  { key: 'q3', stepType: 'q3' },
  { key: 'q4', stepType: 'q4' },
  { key: 'sprintFocus', stepType: 'sprint' },
] as const

/** The bucket keys, for asserting a payload carries nothing the server ignores. */
export const INITIATIVE_BUCKET_KEYS: readonly string[] = INITIATIVE_BUCKETS.map(b => b.key)
