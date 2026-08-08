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
  /** Alert once the newest completed heartbeat is older than this (hours). */
  maxStaleHours: number
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
// this list — a dead cron can't report itself, so self-monitoring is moot;
// Sentry Cron Monitors (external check-ins) are the backstop for the watchdog.
export const MONITORED_CRONS: readonly MonitoredCron[] = [
  { path: '/api/cron/refresh-xero-tokens', label: 'Refresh Xero tokens', maxStaleHours: 15 }, // every 6h
  // Every 6h since 8 Aug 2026 (was nightly). 13h = 2 windows + drift; a single
  // missed slot is tolerated, two in a row is an alert.
  { path: '/api/cron/sync-all-xero', label: 'Sync all Xero', maxStaleHours: 13 },
  { path: '/api/cron/reconciliation-watch', label: 'Reconciliation watch', maxStaleHours: 30 }, // daily 18:00
  { path: '/api/cron/daily-health-report', label: 'Daily health report', maxStaleHours: 30 }, // daily 07:00
  { path: '/api/cron/weekly-digest', label: 'Weekly digest', maxStaleHours: 24 * 9 }, // weekly Sun
]

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
