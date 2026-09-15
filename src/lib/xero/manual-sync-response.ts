/**
 * What POST /api/Xero/sync answers — the KPI dashboard's "Sync Xero" button.
 *
 * One vocabulary for the route and the button, so the button can only say
 * "synced" when the route means it: every Xero org's data landed.
 */
import type { TenantSyncOutcome } from './sync-orchestrator'

export type ManualSyncOutcome =
  /** Every org synced cleanly. The only green outcome. HTTP 200. */
  | 'synced'
  /** Data landed, but at least one org failed, hit Xero's daily limit, synced with gaps, or is disconnected. HTTP 200. */
  | 'partial'
  /** Another sync of this business holds the lock (the cron, or another click). HTTP 409. */
  | 'in_progress'
  /** No org is switched on to sync. `orgs` lists any disconnected ones. HTTP 404. */
  | 'not_connected'
  /** No org's data landed, or the sync could not run or be checked. HTTP 502 / 500. */
  | 'failed'

export interface ManualSyncOrg {
  name: string
  /**
   * The org's outcome in this sync, or `disconnected`: switched off (Xero refused
   * it, or someone did) with no live row, so the sync never touched it. An org
   * retired on purpose is not listed. connection-status.ts decides which is which.
   */
  status: TenantSyncOutcome['status'] | 'disconnected'
}

export interface ManualSyncResponse {
  outcome: ManualSyncOutcome
  /** Every org the sync attempted, in sync order, then every disconnected org. */
  orgs: ManualSyncOrg[]
}
