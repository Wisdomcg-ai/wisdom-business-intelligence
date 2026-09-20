import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'
import { visionMissionStatus } from '@/lib/vision-mission/status'
import type { EngagementSignal, ModuleStatus } from '@/lib/coach/client-completion'

// VALID-05a (observe mode): GET takes no input.
const CoachClientCompletionQuerySchema = z.object({})

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdeasBreakdown {
  // Plan 61-06 contract — owned/team_shared/total — matches "owned vs shared with the client"
  // For the coach-dashboard headline preservation, we map owned := private (ideas the client
  // owns or that nobody shared) and team_shared := team_shared. total === ideas_total === pre-phase count.
  owned: number
  team_shared: number
  total: number
}

interface ClientCompletion {
  businessId: string
  businessName: string
  ownerId: string | null
  modules: Record<string, ModuleStatus>
  engagement: {
    lastLogin: string | null
    weeklyReviewStreak: number
    daysSinceSession: number | null
    openActions: number
    unreadMessages: number
    /** null when a lookup the score reads failed — see SCORE_SIGNALS. */
    engagementScore: number | null
    /** Signals whose lookup failed. Their values above are placeholders, not answers. */
    unknown: EngagementSignal[]
  }
  alerts: string[]
  /**
   * false when a lookup an alert rule reads failed, so that rule could not run:
   * an empty `alerts` is then "none found by the checks that ran", not "all clear".
   */
  alertsComplete: boolean
  // Phase 61-06 — ideas breakdown additions.
  // ideas_total preserves the pre-phase headline count (sum of all ideas in the
  // client's business). Sharing does NOT shrink the headline.
  // ideas_private + ideas_team_shared === ideas_total.
  // All null when the ideas lookup failed — a failed count is not zero ideas.
  ideas_total: number | null
  ideas_private: number | null
  ideas_team_shared: number | null
  ideas_breakdown: IdeasBreakdown | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rows asked for per page. PostgREST cuts every response to the project's "Max
 * rows" (1,000 on hosted Supabase, and it can be set lower). A lower cap costs
 * pages, never rows: the next page starts after the last row actually received.
 */
const PAGE_ROWS = 1000

/**
 * Past this many pages a read gives up and counts as failed rather than run
 * without bound. 50 pages is ~100× the largest read on 15 Sep 2026 (494
 * strategic_initiatives rows for the 27-client coach). A read that grows that
 * big belongs in SQL, and the Sentry warning names it.
 */
const MAX_PAGES = 50

/** The parts of a PostgREST select builder that safeQuery pages with. */
interface PagedQuery<Row> extends PromiseLike<{ data: Row[] | null; error: any }> {
  order(column: string, options: { ascending: boolean }): PagedQuery<Row>
  gt(column: string, value: string): PagedQuery<Row>
  limit(count: number): PagedQuery<Row>
}

/**
 * Run one read of the batch, to its last row, so a single failure can't take
 * the whole page down and a big table can't quietly shorten an answer.
 *
 * The contract every caller depends on: `null` means we could not read every
 * row (the read failed, threw, or did not reach its end) and `[]` means it ran
 * to the end and found nothing. The two used to be collapsed with
 * `result || []`, so a failed xero_connections read told the coach that every
 * client needed to connect Xero. Record `result !== null` in the route's `read`
 * flags BEFORE building lookups from `result ?? []`.
 *
 * Every read is paged because PostgREST returns a cut-short response as a
 * success. Without an ORDER BY the rows it keeps come first in storage order —
 * on these append-mostly tables, the OLDEST — so a capped read drops exactly
 * the rows that decide "a snapshot in the last 30 days", this week's review in
 * the streak and a new unread message (the same shape left 12 of 15 Xero sync
 * clocks ~3 weeks stale on 15 Sep 2026). Pages follow the primary key, a total
 * order, and each asks for the rows after the last id received, so a row added
 * or deleted mid-read cannot push another into two pages or out of all of them.
 * Only an EMPTY page ends the read: a short page can be the cap, not the end.
 * A read that stops part-way is a failed read — part of the rows would be an
 * answer with the deciding rows missing.
 *
 * `query` must build a fresh select that includes `id` and has no order or
 * limit of its own: safeQuery owns both.
 */
async function safeQuery<Row>(
  source: string,
  query: () => PagedQuery<Row>
): Promise<Row[] | null> {
  const context = {
    level: 'warning',
    tags: { route: 'coach/client-completion', invariant: 'client-completion-load', source },
  }
  const rows: Row[] = []
  let after: string | null = null
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      let pageQuery = query().order('id', { ascending: true })
      if (after !== null) pageQuery = pageQuery.gt('id', after)
      const { data, error } = await pageQuery.limit(PAGE_ROWS)
      if (error) {
        Sentry.captureMessage(`[client-completion] query error: ${error.message}`, context as any)
        return null
      }
      if (!Array.isArray(data)) {
        Sentry.captureMessage('[client-completion] query returned no row array', context as any)
        return null
      }
      if (data.length === 0) return rows
      const lastId = (data[data.length - 1] as { id?: unknown }).id
      if (typeof lastId !== 'string' || lastId === '') {
        Sentry.captureMessage('[client-completion] rows carry no id to page from', context as any)
        return null
      }
      rows.push(...data)
      after = lastId
    }
    Sentry.captureMessage(`[client-completion] read did not reach its end in ${MAX_PAGES} pages`, {
      ...context,
      extra: { rowsRead: rows.length },
    } as any)
    return null
  } catch (e: any) {
    Sentry.captureMessage(`[client-completion] query exception: ${e.message}`, context as any)
    return null
  }
}

/**
 * Resolve a module from its evidence, strongest rung first.
 *
 * A row we SAW is real, so a rung whose evidence was seen decides — even when
 * part of its lookup failed (a goal found under the owner's user_id is a goal,
 * whatever happened to the profile-keyed half). A rung that saw nothing only
 * means "not there" if its lookup was fully read; otherwise the walk stops at
 * 'unknown', because the row it missed could be the one that decides.
 */
function resolveModule(
  ...rungs: Array<{ status: 'completed' | 'in_progress'; seen: unknown; read: boolean }>
): ModuleStatus {
  for (const rung of rungs) {
    if (rung.seen) return rung.status
    if (!rung.read) return 'unknown'
  }
  return 'not_started'
}

/** A module answered by "does any row exist for this client". */
function presence(seen: unknown, read: boolean): ModuleStatus {
  return resolveModule({ status: 'completed', seen, read })
}

/**
 * Postgres rejects a non-uuid string in an `in (...)` list against a uuid
 * column ("invalid input syntax for type uuid"), so an EMPTY id list must be
 * stood in for by a value that is a valid uuid and matches nothing — not a
 * placeholder word. WISDOM-BI-S was every profile-keyed query failing this
 * way whenever the profile list came back empty.
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const idsOrNil = (ids: string[]): string[] => (ids.length > 0 ? ids : [NIL_UUID])

/** Calculate days between two dates */
function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

/** Calculate weekly review streak (consecutive completed weeks, most recent first) */
function calcStreak(
  reviews: Array<{ week_start_date: string; is_completed: boolean }> | null
): number {
  if (!reviews || reviews.length === 0) return 0

  // Sort by week_start_date descending
  const sorted = [...reviews]
    .filter((r) => r.is_completed)
    .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date))

  if (sorted.length === 0) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].week_start_date)
    const curr = new Date(sorted[i].week_start_date)
    const diff = daysBetween(prev, curr)
    // Allow 6-8 day gap to account for slight date variations
    if (diff >= 5 && diff <= 9) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/**
 * The signals calcEngagementScore reads. The score is four 0-25 parts; with any
 * part's lookup failed it is not a score (a failed session_actions read used to
 * count as "no open actions" and award the full 25).
 */
const SCORE_SIGNALS: EngagementSignal[] = ['lastLogin', 'weeklyReviewStreak', 'daysSinceSession', 'openActions']

/** Score engagement 0-100 based on multiple signals */
function calcEngagementScore(engagement: {
  lastLogin: string | null
  weeklyReviewStreak: number
  daysSinceSession: number | null
  openActions: number
  unreadMessages: number
}): number {
  let score = 0

  // Login recency (0-25)
  if (engagement.lastLogin) {
    const daysSinceLogin = daysBetween(new Date(), new Date(engagement.lastLogin))
    if (daysSinceLogin <= 1) score += 25
    else if (daysSinceLogin <= 3) score += 20
    else if (daysSinceLogin <= 7) score += 15
    else if (daysSinceLogin <= 14) score += 8
    else if (daysSinceLogin <= 30) score += 3
  }

  // Weekly review streak (0-25)
  if (engagement.weeklyReviewStreak >= 8) score += 25
  else if (engagement.weeklyReviewStreak >= 4) score += 20
  else if (engagement.weeklyReviewStreak >= 2) score += 12
  else if (engagement.weeklyReviewStreak >= 1) score += 6

  // Session recency (0-25)
  if (engagement.daysSinceSession !== null) {
    if (engagement.daysSinceSession <= 7) score += 25
    else if (engagement.daysSinceSession <= 14) score += 20
    else if (engagement.daysSinceSession <= 30) score += 12
    else if (engagement.daysSinceSession <= 60) score += 5
  }

  // Action responsiveness (0-25): fewer open = more responsive
  if (engagement.openActions === 0) score += 25
  else if (engagement.openActions <= 2) score += 18
  else if (engagement.openActions <= 5) score += 10
  else if (engagement.openActions <= 10) score += 5

  return Math.min(100, score)
}

/**
 * Generate alert strings based on engagement data and module status.
 *
 * An alert is an instruction to the coach ("chase their Xero connection"), so a
 * rule whose input could not be checked stays silent — and marks the list
 * incomplete, so an empty list is not read as "all clear" either.
 */
function generateAlerts(
  modules: Record<string, ModuleStatus>,
  engagement: ClientCompletion['engagement']
): { alerts: string[]; complete: boolean } {
  const alerts: string[] = []
  let complete = true
  const known = (signal: EngagementSignal) => !engagement.unknown.includes(signal)

  // Login alerts
  if (!known('lastLogin')) {
    complete = false
  } else if (!engagement.lastLogin) {
    alerts.push('Never logged in')
  } else {
    const daysSinceLogin = daysBetween(new Date(), new Date(engagement.lastLogin))
    if (daysSinceLogin >= 30) alerts.push(`No login ${daysSinceLogin}d+`)
    else if (daysSinceLogin >= 14) alerts.push(`No login ${daysSinceLogin}d`)
  }

  // Session alerts
  if (!known('daysSinceSession')) {
    complete = false
  } else if (engagement.daysSinceSession === null) {
    alerts.push('No sessions yet')
  } else if (engagement.daysSinceSession >= 30) {
    alerts.push(`No session ${engagement.daysSinceSession}d`)
  }

  // Key module alerts
  const moduleAlert = (key: string, text: string) => {
    if (modules[key] === 'unknown') complete = false
    else if (modules[key] === 'not_started') alerts.push(text)
  }
  moduleAlert('forecast', 'No forecast')
  moduleAlert('assessment', 'Assessment incomplete')
  moduleAlert('xero_connected', 'Xero not connected')
  moduleAlert('goals', 'No goals set')

  // Action overload
  if (!known('openActions')) {
    complete = false
  } else if (engagement.openActions >= 10) {
    alerts.push(`${engagement.openActions} open actions`)
  }

  // Stalled weekly reviews
  if (!known('weeklyReviewStreak') || modules['weekly_reviews'] === 'unknown') {
    complete = false
  } else if (engagement.weeklyReviewStreak === 0 && modules['weekly_reviews'] === 'not_started') {
    alerts.push('No weekly reviews')
  }

  return { alerts, complete }
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

async function getHandler() {
  const supabase = await createRouteHandlerClient()

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || (roleData.role !== 'coach' && roleData.role !== 'super_admin')) {
      return NextResponse.json(
        { error: 'Access denied. Coach privileges required.' },
        { status: 403 }
      )
    }

    // ── Step 1: Get all businesses assigned to this coach ─────────
    const { data: businesses, error: bizError } = await supabase
      .from('businesses')
      .select('id, business_name, name, owner_id, status')
      .eq('assigned_coach_id', user.id)
      .order('business_name', { ascending: true })

    if (bizError) {
      Sentry.captureException(bizError, { tags: { route: 'coach/client-completion' }, extra: { context: "[client-completion] businesses query error" } } as any)
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
    }

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({ clients: [] })
    }

    // ── Step 2: Collect all IDs ──────────────────────────────────
    const businessIds = businesses.map((b) => b.id)
    const ownerIds = businesses.map((b) => b.owner_id).filter(Boolean) as string[]

    // Get business_profiles.id (profileIds) for tables that use that FK
    type ProfileRow = { id: string; business_id: string; user_id: string; business_name: string; owner_info: any }
    const profilesResult = await safeQuery<ProfileRow>('business_profiles', () =>
      supabase
        .from('business_profiles')
        .select('id, business_id, user_id, business_name, owner_info')
        .in('business_id', businessIds)
    )
    const profiles = profilesResult ?? []
    const profileIds = profiles.map((p: ProfileRow) => p.id)

    // Build lookup maps
    const profileByBusinessId = new Map(profiles.map((p: ProfileRow) => [p.business_id, p]))
    const profileByUserId = new Map(profiles.map((p: ProfileRow) => [p.user_id, p]))

    // ── Step 3: Pre-build OR filter strings ────────────────────────
    const q = (ids: string[]) => ids.join(',')
    const allXeroIds = [...businessIds, ...profileIds]
    const xeroFilter = `business_id.in.(${q(allXeroIds)})`
    const ownerOrBizFilter = ownerIds.length > 0
      ? `user_id.in.(${q(ownerIds)}),business_id.in.(${q(businessIds)})`
      : `business_id.in.(${q(businessIds)})`
    const ownerOrProfileFilter = ownerIds.length > 0
      ? `user_id.in.(${q(ownerIds)}),business_id.in.(${q(idsOrNil(profileIds))})`
      : `business_id.in.(${q(idsOrNil(profileIds))})`
    const qrIds = [...profileIds, ...ownerIds]

    // ── Row type aliases for safeQuery generics ──────────────────
    type R = Record<string, any>

    // ── Step 3b: Parallel batch queries ──────────────────────────
    // safeQuery reads each one to its last row, paging by id — so every select
    // below includes `id` and none adds an order or a limit of its own.
    const [
      // SETUP
      assessmentsResult,
      visionMissionResult,
      xeroConnectionsResult,
      // PLAN
      swotResult,
      goalsResult,
      planSnapshotsResult,
      initiativesResult,
      // FINANCE
      forecastsResult,
      metricsSnapshotsResult,
      // EXECUTE
      weeklyReviewsResult,
      quarterlyReviewsResult,
      issuesResult,
      ideasResult,
      openLoopsResult,
      stopDoingResult,
      // TEAM
      teamDataResult,
      // SYSTEMS
      processesResult,
      // COACHING
      sessionNotesResult,
      chatMessagesResult,
      // ENGAGEMENT
      usersResult,
      coachingSessionsResult,
      sessionActionsResult,
    ] = await Promise.all([
      // ── SETUP ──
      // 2. Assessments
      safeQuery<R>('assessments', () =>
        supabase
          .from('assessments')
          .select('id, user_id, status')
          .in('user_id', idsOrNil(ownerIds))
          .eq('status', 'completed')
      ),
      // 4. Vision & Mission — strategy_data.vision_mission, keyed by the
      // owner's user_id (the /vision-mission page's only write path).
      safeQuery<R>('strategy_data', () =>
        supabase
          .from('strategy_data')
          .select('id, user_id, vision_mission')
          .in('user_id', idsOrNil(ownerIds))
      ),
      // 3. Xero Connected — check both businessIds and profileIds.
      // is_active filter: a dead connection (Xero terminally refused the
      // refresh) previously still counted as "Xero Connected" on the coach
      // completion dashboard, hiding exactly the clients who need chasing.
      safeQuery<R>('xero_connections', () =>
        supabase
          .from('xero_connections')
          .select('id, business_id')
          .eq('is_active', true)
          .or(xeroFilter)
      ),
      // ── PLAN ──
      // 5. SWOT (uses user_id as business_id — legacy pattern)
      safeQuery<R>('swot_analyses', () =>
        supabase
          .from('swot_analyses')
          .select('id, business_id')
          .in('business_id', idsOrNil(ownerIds))
      ),
      // 6. Goals
      safeQuery<R>('business_financial_goals', () =>
        supabase
          .from('business_financial_goals')
          .select('id, business_id, user_id')
          .or(ownerOrProfileFilter)
      ),
      // 7. One-Page Plan snapshots
      safeQuery<R>('plan_snapshots', () =>
        supabase
          .from('plan_snapshots')
          .select('id, business_id')
          .in('business_id', idsOrNil(profileIds))
      ),
      // 8. Strategic Initiatives (uses business_profiles.id)
      safeQuery<R>('strategic_initiatives', () =>
        supabase
          .from('strategic_initiatives')
          .select('id, business_id')
          .in('business_id', idsOrNil(profileIds))
      ),
      // ── FINANCE ──
      // 9. Forecast
      safeQuery<R>('financial_forecasts', () =>
        supabase
          .from('financial_forecasts')
          .select('id, business_id, is_completed')
          .in('business_id', idsOrNil(profileIds))
      ),
      // 10/12. Weekly Metrics Snapshots
      safeQuery<R>('weekly_metrics_snapshots', () =>
        supabase
          .from('weekly_metrics_snapshots')
          .select('id, business_id, week_ending_date, created_at')
          .in('business_id', idsOrNil(profileIds))
      ),
      // ── EXECUTE ──
      // 13. Weekly Reviews (keyed by business_profiles.id, like strategic_initiatives/forecasts)
      safeQuery<R>('weekly_reviews', () =>
        supabase
          .from('weekly_reviews')
          .select('id, business_id, user_id, is_completed, week_start_date')
          .in('business_id', idsOrNil(profileIds))
      ),
      // 14. Quarterly Reviews (uses business_id — either profileId or ownerIds)
      safeQuery<R>('quarterly_reviews', () =>
        supabase
          .from('quarterly_reviews')
          .select('id, business_id, status')
          .in('business_id', idsOrNil(qrIds))
      ),
      // 15. Issues List (has both user_id and business_id)
      safeQuery<R>('issues_list', () =>
        supabase
          .from('issues_list')
          .select('id, user_id, business_id')
          .or(ownerOrBizFilter)
      ),
      // 16. Ideas (has both user_id and business_id)
      // Phase 61-06: also fetch shared_with_all + shared_with so the per-client
      // breakdown can split private vs team_shared without an additional query.
      // The filter is unchanged — we still pull the same business-wide row set
      // as the pre-phase route, preserving the headline ideas_total.
      safeQuery<R>('ideas', () =>
        supabase
          .from('ideas')
          .select('id, user_id, business_id, shared_with_all, shared_with')
          .or(ownerOrBizFilter)
      ),
      // 17. Open Loops (has both user_id and business_id)
      safeQuery<R>('open_loops', () =>
        supabase
          .from('open_loops')
          .select('id, user_id, business_id')
          .or(ownerOrBizFilter)
      ),
      // 18. Stop Doing Items
      safeQuery<R>('stop_doing_items', () =>
        supabase
          .from('stop_doing_items')
          .select('id, user_id')
          .in('user_id', idsOrNil(ownerIds))
      ),
      // ── TEAM ──
      // 19/20. Team Data (accountability_chart + org_chart)
      safeQuery<R>('team_data', () =>
        supabase
          .from('team_data')
          .select('id, user_id, accountability_chart, org_chart')
          .in('user_id', idsOrNil(ownerIds))
      ),
      // ── SYSTEMS ──
      // 22. Processes
      safeQuery<R>('process_diagrams', () =>
        supabase
          .from('process_diagrams')
          .select('id, user_id')
          .in('user_id', idsOrNil(ownerIds))
      ),
      // ── COACHING ──
      // 23. Session Notes
      safeQuery<R>('session_notes', () =>
        supabase
          .from('session_notes')
          .select('id, business_id')
          .in('business_id', businessIds)
      ),
      // 24. Messages
      safeQuery<R>('messages', () =>
        supabase
          .from('messages')
          .select('id, business_id, sender_id, read, created_at')
          .in('business_id', businessIds)
      ),
      // ── ENGAGEMENT ──
      // Last login
      safeQuery<R>('users', () =>
        supabase
          .from('users')
          .select('id, last_login_at')
          .in('id', idsOrNil(ownerIds))
      ),
      // Coaching sessions (for days-since-session). Pages arrive in id order,
      // so the latest session is found below, not assumed to come first.
      safeQuery<R>('coaching_sessions', () =>
        supabase
          .from('coaching_sessions')
          .select('id, business_id, scheduled_at, status')
          .in('business_id', businessIds)
          .eq('status', 'completed')
      ),
      // Session actions (for open action count)
      safeQuery<R>('session_actions', () =>
        supabase
          .from('session_actions')
          .select('id, business_id, status')
          .in('business_id', businessIds)
          .in('status', ['open', 'in_progress', 'pending'])
      ),
    ])

    // ── Step 3c: Which lookups actually answered ─────────────────
    // A null result is a FAILED read. Everything below builds its lookups from
    // `result ?? []`, so these flags are the only record of the failure: every
    // status, signal and alert consults them, and a failed read can resolve to
    // 'unknown' — never to an empty answer.
    //
    // A profile-keyed read also depends on the profiles read: with
    // business_profiles failed, those queries ran against the nil uuid and
    // "succeeded" with nothing, which is not the same as the client having nothing.
    const profilesRead = profilesResult !== null
    const read = {
      assessments: assessmentsResult !== null,
      visionMission: visionMissionResult !== null,
      xero: xeroConnectionsResult !== null && profilesRead,
      swot: swotResult !== null,
      goals: goalsResult !== null && profilesRead,
      planSnapshots: planSnapshotsResult !== null && profilesRead,
      initiatives: initiativesResult !== null && profilesRead,
      forecasts: forecastsResult !== null && profilesRead,
      metrics: metricsSnapshotsResult !== null && profilesRead,
      weeklyReviews: weeklyReviewsResult !== null && profilesRead,
      quarterlyReviews: quarterlyReviewsResult !== null && profilesRead,
      issues: issuesResult !== null,
      ideas: ideasResult !== null,
      openLoops: openLoopsResult !== null,
      stopDoing: stopDoingResult !== null,
      teamData: teamDataResult !== null,
      processes: processesResult !== null,
      sessionNotes: sessionNotesResult !== null,
      messages: chatMessagesResult !== null,
      users: usersResult !== null,
      coachingSessions: coachingSessionsResult !== null,
      sessionActions: sessionActionsResult !== null,
    }

    const unknownSignals: EngagementSignal[] = []
    if (!read.users) unknownSignals.push('lastLogin')
    if (!read.weeklyReviews) unknownSignals.push('weeklyReviewStreak')
    if (!read.coachingSessions) unknownSignals.push('daysSinceSession')
    if (!read.sessionActions) unknownSignals.push('openActions')
    if (!read.messages) unknownSignals.push('unreadMessages')
    const canScore = !SCORE_SIGNALS.some((signal) => unknownSignals.includes(signal))

    // ── Step 4: Build lookup indexes ─────────────────────────────

    // Helper to group array items by a key
    function groupBy<T>(items: T[] | null, key: keyof T): Map<string, T[]> {
      const map = new Map<string, T[]>()
      if (!items) return map
      for (const item of items) {
        const k = String(item[key])
        const arr = map.get(k) || []
        arr.push(item)
        map.set(k, arr)
      }
      return map
    }

    // Build sets/maps for quick lookups
    const assessmentsByUser = new Set(
      (assessmentsResult ?? []).map((a) => a.user_id)
    )

    const visionMissionByUser = new Map(
      (visionMissionResult ?? []).map((v) => [v.user_id, v.vision_mission])
    )

    const xeroByBusiness = new Set(
      (xeroConnectionsResult ?? []).map((x) => x.business_id)
    )

    const swotByUser = new Set(
      (swotResult ?? []).map((s) => s.business_id) // business_id = user_id in this table
    )

    const goalsByUser = groupBy(goalsResult, 'user_id')
    const goalsByProfile = groupBy(goalsResult, 'business_id')

    const planSnapshotsByProfile = groupBy(planSnapshotsResult, 'business_id')
    const initiativesByProfile = groupBy(initiativesResult, 'business_id')

    const forecastsByProfile = groupBy(forecastsResult, 'business_id')
    const metricsByProfile = groupBy(metricsSnapshotsResult, 'business_id')

    const weeklyReviewsByBusiness = groupBy(weeklyReviewsResult, 'business_id')
    const quarterlyReviewsByBusiness = groupBy(quarterlyReviewsResult, 'business_id')

    const issuesByUser = groupBy(issuesResult, 'user_id')
    const issuesByBusiness = groupBy(issuesResult, 'business_id')

    const ideasByUser = groupBy(ideasResult, 'user_id')
    const ideasByBusiness = groupBy(ideasResult, 'business_id')

    const openLoopsByUser = groupBy(openLoopsResult, 'user_id')
    const openLoopsByBusiness = groupBy(openLoopsResult, 'business_id')

    const stopDoingByUser = groupBy(stopDoingResult, 'user_id')

    const teamDataByUser = new Map(
      (teamDataResult ?? []).map((t) => [t.user_id, t])
    )

    const processesByUser = groupBy(processesResult, 'user_id')

    const sessionNotesByBusiness = groupBy(sessionNotesResult, 'business_id')
    const chatMessagesByBusiness = groupBy(chatMessagesResult, 'business_id')

    const userLoginMap = new Map(
      (usersResult ?? []).map((u) => [u.id, u.last_login_at])
    )

    const coachingSessionsByBusiness = groupBy(coachingSessionsResult, 'business_id')
    const actionsByBusiness = groupBy(sessionActionsResult, 'business_id')

    // ── Step 5: Build per-client results ─────────────────────────
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const clients: ClientCompletion[] = businesses.map((biz) => {
      const ownerId = biz.owner_id || null
      const profile = profileByBusinessId.get(biz.id)
      const profileId = profile?.id || null

      // ── Module completion ──────────────────────────────────────
      // Every status goes through presence()/resolveModule() with the read
      // flag of each lookup it depends on, so a failed read is 'unknown'.
      const modules: Record<string, ModuleStatus> = {}

      // 1. Business Profile
      modules['business_profile'] = presence(profile?.business_name, profilesRead)

      // 2. Assessment
      modules['assessment'] = presence(ownerId && assessmentsByUser.has(ownerId), read.assessments)

      // 3. Xero Connected (check both businesses.id and business_profiles.id).
      // Presence only — any active xero_connections row. Connection HEALTH is
      // the coach dashboard pill's job (/api/Xero/connection-health).
      modules['xero_connected'] = presence(
        xeroByBusiness.has(biz.id) || (profileId && xeroByBusiness.has(profileId)),
        read.xero
      )

      // 4. Vision & Mission — read from strategy_data (owner-keyed). The
      // previous read selected business_profiles.mission / .vision, columns
      // that have never existed (WISDOM-BI-T); prod has zero owner_info rows
      // carrying vision/mission keys, so that legacy fallback is dropped too.
      modules['vision_mission'] = read.visionMission
        ? visionMissionStatus(ownerId ? visionMissionByUser.get(ownerId) : undefined)
        : 'unknown'

      // 5. SWOT (uses user_id as business_id in swot_analyses)
      modules['swot'] = presence(ownerId && swotByUser.has(ownerId), read.swot)

      // 6. Goals
      const hasGoals =
        (ownerId && (goalsByUser.get(ownerId)?.length || 0) > 0) ||
        (profileId && (goalsByProfile.get(profileId)?.length || 0) > 0)
      modules['goals'] = presence(hasGoals, read.goals)

      // 7. One-Page Plan
      const hasSnapshot = profileId && (planSnapshotsByProfile.get(profileId)?.length || 0) > 0
      const hasInitiativesForPlan = profileId && (initiativesByProfile.get(profileId)?.length || 0) > 0
      modules['one_page_plan'] = resolveModule(
        { status: 'completed', seen: hasSnapshot, read: read.planSnapshots },
        { status: 'in_progress', seen: hasInitiativesForPlan, read: read.initiatives }
      )

      // 8. Strategic Initiatives
      const initiativeCount = profileId
        ? (initiativesByProfile.get(profileId)?.length || 0)
        : 0
      modules['strategic_initiatives'] = presence(initiativeCount > 0, read.initiatives)

      // 9. Forecast
      const forecasts = profileId ? (forecastsByProfile.get(profileId) || []) : []
      const hasCompletedForecast = forecasts.some((f) => f.is_completed)
      const hasAnyForecast = forecasts.length > 0
      modules['forecast'] = resolveModule(
        { status: 'completed', seen: hasCompletedForecast, read: read.forecasts },
        { status: 'in_progress', seen: hasAnyForecast, read: read.forecasts }
      )

      // 10. Monthly Report
      const snapshots = profileId ? (metricsByProfile.get(profileId) || []) : []
      modules['monthly_report'] = presence(snapshots.length > 0, read.metrics)

      // 11. Cashflow (derives from forecast)
      modules['cashflow'] = modules['forecast']

      // 12. KPI Dashboard (recent metrics snapshot within 30 days)
      const hasRecentMetrics = snapshots.some((s) => {
        const snapshotDate = new Date(s.week_ending_date || s.created_at)
        return snapshotDate >= thirtyDaysAgo
      })
      modules['kpi_dashboard'] = resolveModule(
        { status: 'completed', seen: hasRecentMetrics, read: read.metrics },
        { status: 'in_progress', seen: snapshots.length > 0, read: read.metrics }
      )

      // 13. Weekly Reviews (keyed by business_profiles.id — look up by profileId)
      const weeklyReviews = (profileId ? weeklyReviewsByBusiness.get(profileId) : null) || []
      const completedReviews = weeklyReviews.filter((r) => r.is_completed)
      modules['weekly_reviews'] = resolveModule(
        { status: 'completed', seen: completedReviews.length >= 4, read: read.weeklyReviews },
        { status: 'in_progress', seen: completedReviews.length > 0, read: read.weeklyReviews }
      )

      // 14. Quarterly Review (check both profileId and ownerId keys)
      const qReviews = [
        ...(profileId ? (quarterlyReviewsByBusiness.get(profileId) || []) : []),
        ...(ownerId ? (quarterlyReviewsByBusiness.get(ownerId) || []) : []),
      ]
      const hasCompletedQR = qReviews.some((r) => r.status === 'completed')
      modules['quarterly_review'] = resolveModule(
        { status: 'completed', seen: hasCompletedQR, read: read.quarterlyReviews },
        { status: 'in_progress', seen: qReviews.length > 0, read: read.quarterlyReviews }
      )

      // 15. Issues List
      const issueCount =
        (ownerId ? (issuesByUser.get(ownerId)?.length || 0) : 0) +
        (issuesByBusiness.get(biz.id)?.length || 0)
      modules['issues_list'] = presence(issueCount > 0, read.issues)

      // 16. Ideas
      const ideaCount =
        (ownerId ? (ideasByUser.get(ownerId)?.length || 0) : 0) +
        (ideasByBusiness.get(biz.id)?.length || 0)
      modules['ideas'] = presence(ideaCount > 0, read.ideas)

      // 17. Open Loops
      const loopCount =
        (ownerId ? (openLoopsByUser.get(ownerId)?.length || 0) : 0) +
        (openLoopsByBusiness.get(biz.id)?.length || 0)
      modules['open_loops'] = presence(loopCount > 0, read.openLoops)

      // 18. To-Do / Stop Doing
      const stopDoingCount = ownerId ? (stopDoingByUser.get(ownerId)?.length || 0) : 0
      modules['stop_doing'] = presence(stopDoingCount > 0, read.stopDoing)

      // 19. Accountability Chart
      const teamData = ownerId ? teamDataByUser.get(ownerId) : null
      const hasAccChart = !!(
        teamData?.accountability_chart &&
        typeof teamData.accountability_chart === 'object' &&
        Object.keys(teamData.accountability_chart as Record<string, unknown>).length > 0
      )
      modules['accountability_chart'] = presence(hasAccChart, read.teamData)

      // 20. Org Chart
      const hasOrgChart = !!(
        teamData?.org_chart &&
        typeof teamData.org_chart === 'object' &&
        Object.keys(teamData.org_chart as Record<string, unknown>).length > 0
      )
      modules['org_chart'] = presence(hasOrgChart, read.teamData)

      // 21. Value Proposition (check business_profiles for value prop in owner_info)
      const hasValueProp = !!(
        profile?.owner_info &&
        typeof profile.owner_info === 'object' &&
        ((profile.owner_info as any).value_proposition ||
          (profile.owner_info as any).valueProposition ||
          (profile.owner_info as any).unique_value)
      )
      modules['value_proposition'] = presence(hasValueProp, profilesRead)

      // 22. Processes
      const processCount = ownerId ? (processesByUser.get(ownerId)?.length || 0) : 0
      modules['processes'] = presence(processCount > 0, read.processes)

      // 23. Session Notes (count-based, not boolean)
      const noteCount = sessionNotesByBusiness.get(biz.id)?.length || 0
      modules['session_notes'] = presence(noteCount > 0, read.sessionNotes)

      // 24. Messages (count-based)
      const msgCount = chatMessagesByBusiness.get(biz.id)?.length || 0
      modules['messages'] = presence(msgCount > 0, read.messages)

      // ── Engagement signals ─────────────────────────────────────
      const lastLogin = ownerId ? (userLoginMap.get(ownerId) || null) : null

      const streak = calcStreak(
        weeklyReviews.map((r) => ({
          week_start_date: r.week_start_date,
          is_completed: !!r.is_completed,
        }))
      )

      // The most recent completed session — rows arrive in id order, not date order.
      let lastSessionAt: number | null = null
      for (const session of coachingSessionsByBusiness.get(biz.id) || []) {
        const at = new Date(session.scheduled_at).getTime()
        if (lastSessionAt === null || at > lastSessionAt) lastSessionAt = at
      }
      const daysSinceSession = lastSessionAt !== null
        ? daysBetween(now, new Date(lastSessionAt))
        : null

      const openActions = actionsByBusiness.get(biz.id)?.length || 0

      const bizMessages = chatMessagesByBusiness.get(biz.id) || []
      const unreadMessages = bizMessages.filter(
        (m) => m.sender_id !== user.id && !m.read
      ).length

      const engagement: ClientCompletion['engagement'] = {
        lastLogin,
        weeklyReviewStreak: streak,
        daysSinceSession,
        openActions,
        unreadMessages,
        engagementScore: null, // calculated below
        unknown: [...unknownSignals],
      }
      engagement.engagementScore = canScore ? calcEngagementScore(engagement) : null

      // ── Alerts ─────────────────────────────────────────────────
      const { alerts, complete: alertsComplete } = generateAlerts(modules, engagement)

      // Convert module keys from snake_case to camelCase to match frontend component
      const camelModules: Record<string, ModuleStatus> = {}
      const keyMap: Record<string, string> = {
        business_profile: 'businessProfile',
        xero_connected: 'xeroConnected',
        vision_mission: 'visionMission',
        one_page_plan: 'onePagePlan',
        strategic_initiatives: 'strategicInitiatives',
        monthly_report: 'monthlyReport',
        kpi_dashboard: 'kpiDashboard',
        weekly_reviews: 'weeklyReviews',
        quarterly_review: 'quarterlyReview',
        issues_list: 'issuesList',
        open_loops: 'openLoops',
        stop_doing: 'stopDoing',
        accountability_chart: 'accountability',
        org_chart: 'orgChart',
        hiring_roadmap: 'hiringRoadmap',
        value_proposition: 'valueProposition',
        session_notes: 'sessionNotes',
      }
      for (const [key, value] of Object.entries(modules)) {
        camelModules[keyMap[key] || key] = value as ModuleStatus
      }

      // ── Phase 61-06 — ideas breakdown ──────────────────────────
      // ideas_total PRESERVES the pre-phase headline count (sum of all idea
      // rows visible to this client via the existing ownerOrBizFilter — i.e.
      // owner-owned ideas OR business-scoped ideas). Sharing does NOT shrink
      // the headline; it only decomposes it into private vs team-shared.
      //
      // Definitions:
      //   ideas_private      = rows with shared_with_all = false AND
      //                        coalesce(array_length(shared_with, 1), 0) = 0
      //   ideas_team_shared  = ideas_total - ideas_private (everything else)
      //
      // ideasResult is null if the SELECT failed (safeQuery returns null and
      // writes a Sentry warning). The breakdown is then null, not zero — a
      // count that could not be taken is not "no ideas" — and the route still
      // returns 200 for everything else.
      let ideas_total = 0
      let ideas_private = 0
      let ideas_team_shared = 0
      if (read.ideas) {
        const ownerIdeas = ownerId ? (ideasByUser.get(ownerId) || []) : []
        const bizIdeas = ideasByBusiness.get(biz.id) || []
        // Dedup by id — an idea owned by the client AND tagged with the
        // business will appear in both maps. The pre-phase route counted such
        // a row once, so we preserve that semantic here.
        const seen = new Set<string>()
        const all: any[] = []
        for (const row of [...ownerIdeas, ...bizIdeas]) {
          if (!seen.has(row.id)) {
            seen.add(row.id)
            all.push(row)
          }
        }
        ideas_total = all.length
        for (const row of all) {
          const sharedAll = row.shared_with_all === true
          const sharedWith = Array.isArray(row.shared_with) ? row.shared_with : []
          if (!sharedAll && sharedWith.length === 0) {
            ideas_private++
          }
        }
        ideas_team_shared = ideas_total - ideas_private
      }

      return {
        businessId: biz.id,
        businessName: biz.business_name || biz.name || 'Unnamed',
        ownerId,
        modules: camelModules,
        engagement,
        alerts,
        alertsComplete,
        ideas_total: read.ideas ? ideas_total : null,
        ideas_private: read.ideas ? ideas_private : null,
        ideas_team_shared: read.ideas ? ideas_team_shared : null,
        ideas_breakdown: read.ideas
          ? {
              owned: ideas_private,
              team_shared: ideas_team_shared,
              total: ideas_total,
            }
          : null,
      }
    })

    return NextResponse.json({ clients })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'coach/client-completion' }, extra: { context: "[client-completion] Unexpected error" } } as any)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export const GET = withQuerySchema('coach/client-completion', CoachClientCompletionQuerySchema, getHandler)
