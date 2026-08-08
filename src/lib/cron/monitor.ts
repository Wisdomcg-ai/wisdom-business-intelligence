/**
 * Sentry Cron Monitors — the external, independent-failure-domain backstop for
 * the in-app heartbeat watchdog (./watchdog.ts).
 *
 * The watchdog reads cron_heartbeats and alerts on stale/failed crons, but it
 * is itself a Vercel cron behind the same CRON_SECRET gate — so a total outage
 * (e.g. CRON_SECRET unset → every cron 401s, including the watchdog) leaves it
 * blind, exactly as its own docstring notes. This closes that gap: each cron
 * reports a check-in to Sentry Crons, which knows the schedule and alerts when
 * an expected check-in doesn't arrive — even when no Vercel cron runs at all.
 *
 * Config lives ONCE, in watchdog.ts (SENTRY_MONITORED_CRONS); this module only
 * translates a run's outcome into a Sentry check-in.
 *
 * Deliberate choices:
 *  - A 401 reports NOTHING: the scheduled run then produces no check-in, and
 *    Sentry's missed-run alert fires instead (how a CRON_SECRET outage is
 *    caught), and an unauthorized probe can't forge an "ok".
 *  - Fail-soft: a monitoring error can never break a cron run.
 *  - `shouldMonitor` lets a self-chaining cron (sync-all-xero) check in only on
 *    its scheduled run, not on internal chain links.
 */

import * as Sentry from '@sentry/nextjs'
import { getSentryMonitor, type MonitoredCron } from './watchdog'

type CronHandler = (request: Request) => Promise<Response>

/** Sentry monitor slug for a cron path, e.g. '/api/cron/sync-all-xero' → 'sync-all-xero'. */
function slugForPath(path: string): string {
  return path.replace(/^\/api\/cron\//, '')
}

/**
 * Wrap a cron handler so its outcome is reported to Sentry Crons.
 * Status: handler throws OR responds >= 400 (except 401) → `error`; responds
 * < 400 → `ok`; responds 401 → no check-in (see file header). The original
 * response/exception is always passed through unchanged.
 */
export function withCronMonitor(
  monitor: MonitoredCron,
  handler: CronHandler,
  shouldMonitor?: (request: Request) => boolean,
): CronHandler {
  return async (request: Request): Promise<Response> => {
    let res: Response | undefined
    let threw = false
    try {
      res = await handler(request)
      return res
    } catch (err) {
      threw = true
      throw err
    } finally {
      try {
        const monitored = shouldMonitor ? shouldMonitor(request) : true
        // A 401 scheduled run intentionally checks in NOTHING → Sentry's
        // missed-run alert fires instead (catches the CRON_SECRET outage).
        const isUnauthorized = !threw && res?.status === 401
        if (monitored && !isUnauthorized) {
          const status: 'ok' | 'error' =
            !threw && res !== undefined && res.status < 400 ? 'ok' : 'error'
          Sentry.captureCheckIn(
            { monitorSlug: slugForPath(monitor.path), status },
            {
              schedule: { type: 'crontab', value: monitor.schedule },
              checkinMargin: monitor.checkinMarginMinutes ?? 30,
              maxRuntime: monitor.maxRuntimeMinutes ?? 10,
              timezone: 'UTC',
            },
          )
        }
      } catch {
        // A monitoring call must never break a cron run.
      }
    }
  }
}

/**
 * Look up a cron's Sentry monitor by path and wrap its handler. If the path is
 * not registered in SENTRY_MONITORED_CRONS, the handler runs unmonitored (never
 * throws) and Sentry surfaces a "missing monitor" — the safe direction to fail.
 */
export function monitorCron(
  path: string,
  handler: CronHandler,
  shouldMonitor?: (request: Request) => boolean,
): CronHandler {
  const monitor = getSentryMonitor(path)
  if (!monitor) return handler
  return withCronMonitor(monitor, handler, shouldMonitor)
}
