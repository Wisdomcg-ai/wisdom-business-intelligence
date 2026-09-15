/**
 * Wire vocabulary shared by GET /api/coach/client-completion and the coach
 * engagement dashboard (ClientCompletionDashboard) that renders it.
 */

/**
 * A module's status for one client.
 *
 * 'unknown' means the lookup that answers the module FAILED — we could not
 * check. It is not 'not_started': that is an answer ("this client has no
 * forecast") and it hands the coach an action. A failed lookup must never
 * inherit that action, so 'unknown' raises no alert and is never drawn as done
 * or as not started.
 */
export type ModuleStatus = 'completed' | 'in_progress' | 'not_started' | 'unknown'

/** The engagement signals the route derives, each from its own lookup. */
export type EngagementSignal =
  | 'lastLogin'
  | 'weeklyReviewStreak'
  | 'daysSinceSession'
  | 'openActions'
  | 'unreadMessages'
