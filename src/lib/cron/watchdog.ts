/**
 * Cron watchdog — config + pure evaluation.
 *
 * The cron_heartbeats table records every real cron invocation, but until now
 * NOTHING read it for staleness. That is how the CRON_SECRET outage could keep
 * every cron 401-ing for two months with zero alert: heartbeats are written
 * after the auth gate, so the table simply went quiet, and nothing was looking.
 * This watchdog closes the gap: it runs every 2h and, if any monitored cron
 * hasn't logged a heartbeat within its expected cadence (or its last run
 * failed), it fires a Sentry alert.
 *
 * MONITORED_CRONS must be kept in sync with vercel.json `crons` by hand — there
 * is no runtime access to vercel.json. `maxStaleHours` ≈ the cron's interval × a
 * safety factor, so a single missed tick doesn't false-alarm.
 */

export interface MonitoredCron {
  path: string
  label: string
  /**
   * Crontab expression — MUST match this cron's entry in vercel.json. Drives the
   * Sentry Cron Monitor schedule (the external backstop, ./monitor.ts). The
   * in-app staleness reader below uses maxStaleHours instead.
   */
  schedule: string
  /** Alert once the newest completed heartbeat is older than this (hours). */
  maxStaleHours: number
  /** Minutes a Sentry check-in may be late before Sentry marks the run missed. */
  checkinMarginMinutes?: number
  /** Minutes a run may take before Sentry marks it timed-out. */
  maxRuntimeMinutes?: number
  /**
   * When this cron was first deployed (ISO). A brand-new cron has NO heartbeat
   * until its first scheduled slot, so without this the watchdog pages
   * immediately about a cron that is perfectly healthy and simply has not had
   * its turn yet. 'missing' is suppressed until activeFrom + maxStaleHours has
   * elapsed — one full window to have run at least once. After that it alerts
   * normally, so a cron that genuinely never fires is still caught. Omit for
   * long-established crons.
   */
  activeFrom?: string
}

// Keep in sync with vercel.json → crons. The watchdog is intentionally NOT in
// this list — a dead cron can't report itself, so the in-app reader can't watch
// it; its external Sentry check-in (WATCHDOG_SELF_MONITOR, below) is the
// backstop. `schedule` MUST match vercel.json.
export const MONITORED_CRONS: readonly MonitoredCron[] = [
  { path: '/api/cron/refresh-xero-tokens', label: 'Refresh Xero tokens', schedule: '0 */6 * * *', maxStaleHours: 15, checkinMarginMinutes: 30, maxRuntimeMinutes: 8 }, // every 6h
  // Every 6h since 8 Aug 2026 (was nightly). 13h = 2 windows + drift; a single
  // missed slot is tolerated, two in a row is an alert.
  { path: '/api/cron/sync-all-xero', label: 'Sync all Xero', schedule: '0 4,10,16,22 * * *', maxStaleHours: 13, checkinMarginMinutes: 30, maxRuntimeMinutes: 18 },
  { path: '/api/cron/reconciliation-watch', label: 'Reconciliation watch', schedule: '0 18 * * *', maxStaleHours: 30, checkinMarginMinutes: 60, maxRuntimeMinutes: 4 }, // daily 18:00
  { path: '/api/cron/daily-health-report', label: 'Daily health report', schedule: '0 7 * * *', maxStaleHours: 30, checkinMarginMinutes: 60, maxRuntimeMinutes: 8 }, // daily 07:00
  { path: '/api/cron/weekly-digest', label: 'Weekly digest', schedule: '0 20 * * 0', maxStaleHours: 24 * 9, checkinMarginMinutes: 120, maxRuntimeMinutes: 8 }, // weekly Sun
  // Daily 05:00 UTC, 2h before the health report that reads its results. This
  // one guards every other derived number, so its own silence is the worst
  // kind: no violations reported looks identical to no violations existing.
  {
    path: '/api/cron/metric-invariants',
    label: 'Metric invariants',
    schedule: '0 5 * * *',
    maxStaleHours: 30,
    checkinMarginMinutes: 60,
    maxRuntimeMinutes: 8,
    activeFrom: '2026-08-08T08:00:00Z',
  },
]

// The heartbeat-watchdog itself. Excluded from MONITORED_CRONS above (the in-app
// reader can't watch the reader), but Sentry CAN watch it externally — so it
// carries its own monitor spec, used ONLY for the Sentry Cron Monitor check-in.
export const WATCHDOG_SELF_MONITOR: MonitoredCron = {
  path: '/api/cron/heartbeat-watchdog',
  label: 'Heartbeat watchdog',
  schedule: '0 */2 * * *',
  maxStaleHours: 5,
  checkinMarginMinutes: 30,
  maxRuntimeMinutes: 2,
}

// Single source of truth for the Sentry Cron Monitor backstop: every
// in-app-monitored cron PLUS the watchdog itself. Keep new crons here AND in
// vercel.json.
export const SENTRY_MONITORED_CRONS: readonly MonitoredCron[] = [
  ...MONITORED_CRONS,
  WATCHDOG_SELF_MONITOR,
]

/** The Sentry monitor spec for a cron path, or undefined if it isn't monitored. */
export function getSentryMonitor(path: string): MonitoredCron | undefined {
  return SENTRY_MONITORED_CRONS.find((c) => c.path === path)
}

export interface HeartbeatSnapshot {
  /**
   * ms epoch of the newest COMPLETED heartbeat for this cron, or null if it has
   * never completed one. Start-marker rows ("run started — not yet completed")
   * are excluded on purpose, twice over:
   *
   *   - for freshness: a cron that starts every slot but is always killed
   *     before finishing must read as stale, not healthy — start-markers prove
   *     invocation, never completion;
   *   - for status: reading the start-marker's 'partial' as the outcome is how
   *     the Pulse fork's watchdog pages "degraded" about perfectly healthy
   *     chaining crons whose latest row is their own in-flight marker.
   */
  ranAtMs: number | null
  /** status of that newest completed heartbeat. */
  status: string | null
}

export interface CronAlert {
  path: string
  label: string
  reason: 'missing' | 'stale' | 'failed' | 'degraded'
  /** Age of the newest completed heartbeat in hours (null when missing). */
  ageHours: number | null
}

/**
 * Pure: given the newest completed heartbeat per cron path + `nowMs`, return
 * the crons that need an alert. A never-seen cron is 'missing'; one past its
 * window is 'stale' (staleness wins over a failed status); an in-window cron
 * whose last run failed is 'failed'; a 'partial' last run is 'degraded'.
 */
export function evaluateCronHealth(
  monitored: readonly MonitoredCron[],
  latest: Record<string, HeartbeatSnapshot | undefined>,
  nowMs: number,
): CronAlert[] {
  const alerts: CronAlert[] = []
  for (const m of monitored) {
    const snap = latest[m.path]
    if (!snap || snap.ranAtMs == null) {
      // A newly-deployed cron has not missed anything yet — it just has not
      // reached its first scheduled slot. Stay quiet for one full window, then
      // treat silence as real.
      const activeFromMs = m.activeFrom ? Date.parse(m.activeFrom) : NaN
      if (Number.isFinite(activeFromMs) && nowMs < activeFromMs + m.maxStaleHours * 3_600_000) {
        continue
      }
      alerts.push({ path: m.path, label: m.label, reason: 'missing', ageHours: null })
      continue
    }
    const ageHours = (nowMs - snap.ranAtMs) / 3_600_000
    if (ageHours > m.maxStaleHours) {
      alerts.push({ path: m.path, label: m.label, reason: 'stale', ageHours })
    } else if (snap.status === 'failed') {
      alerts.push({ path: m.path, label: m.label, reason: 'failed', ageHours })
    } else if (snap.status === 'partial') {
      // 'partial' silently treated as healthy is how a night on which the
      // entire fleet failed to sync raises nothing at all — the cron itself ran
      // to completion and said so. Ranked below 'failed': the job did run and
      // some work landed. But it is an alert, because "some clients have no
      // numbers this morning" is not a state anyone should have to go looking
      // for.
      alerts.push({ path: m.path, label: m.label, reason: 'degraded', ageHours })
    }
  }
  return alerts
}
