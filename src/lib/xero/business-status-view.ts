/**
 * The /api/Xero/status answer as the pages read it: the wire shape, the one way
 * to turn a response into "the answer" or "we could not check", and the words
 * every surface uses to describe it.
 *
 * Client-safe — no server imports. The classification itself runs on the server
 * (`classifyBusinessConnections` in `connection-status.ts`); this module only
 * reads its result, so the monthly-report banner, the forecast panel, the
 * cashflow page, the integrations page and the token keepalive can never
 * disagree about the same business.
 */
import type { XeroConnectionStatus } from './connection-status'

/** One Xero org of the business, as the status route classified it. */
export interface XeroStatusOrg {
  connection_id: string | null
  tenant_id: string | null
  tenant_name: string | null
  /** The name an admin gave the org on the consolidation page, if any. Lists show it; status wording uses tenant_name, as the pill and board do. */
  display_name?: string | null
  status: XeroConnectionStatus
  /** Last successful data sync for THIS org, on its own tenant's clock. */
  last_sync_at: string | null
  /** Last time Xero granted this org a token. */
  last_refresh_at: string | null
}

/** Kept for older readers: the headline org, in the pre-multi-org row shape. */
export interface XeroStatusConnection {
  id: string | null
  tenant_name: string | null
  is_active: boolean
  /** The headline org's data clock (its column folded with sync_jobs), not the raw column. */
  last_synced_at: string | null
  expires_at: string | null
}

export interface XeroStatusResponse {
  /** The business's status: its worst org's. */
  status: XeroConnectionStatus
  /** "IICT Group Pty Ltd" or "2 of 3 orgs" when only part of the business has the status; null when business-wide. */
  status_scope: string | null
  /** Other orgs needing attention in a lesser state than `status`. */
  more_orgs_needing_attention: number
  /** The headline org's data clock — when every org is connected, the oldest sync. */
  last_sync_at: string | null
  /** Every org that counts, worst first. */
  orgs: XeroStatusOrg[]
  /** Orgs switched off and excluded from consolidation on purpose. They set nothing. */
  retired_orgs: XeroStatusOrg[]
  /**
   * The caller may connect, reconnect, sync and disconnect (owner, assigned coach,
   * super admin). A team member may look but those routes refuse them, so their
   * buttons are not shown.
   */
  can_manage: boolean
  /** Legacy: at least one org is live, so Xero actions (sync, keepalive) can run. Says nothing about health. */
  connected: boolean
  /** Legacy: the headline org is disconnected or has stopped refreshing. */
  expired: boolean
  /** Some org — not only the headline — is disconnected or has stopped refreshing. */
  needsReconnect: boolean
  connection: XeroStatusConnection | null
  health?: { isHealthy: boolean; expiresInMinutes: number | null; warnings: string[] }
  error?: string
  message?: string
}

const STATUSES: readonly XeroConnectionStatus[] = [
  'none',
  'dead',
  'unknown',
  'auth_stale',
  'pending_first_sync',
  'data_stale',
  'connected',
]

const isStatus = (value: unknown): value is XeroConnectionStatus =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value)

const isOrgList = (value: unknown): value is XeroStatusOrg[] =>
  Array.isArray(value) && value.every((o) => !!o && typeof o === 'object' && isStatus((o as XeroStatusOrg).status))

/**
 * The response body if it is a status answer, else null. A 200 carrying an error
 * body, or a shape from before every org was classified, is not an answer — the
 * caller renders "could not check" rather than guessing from what is there.
 */
export function parseXeroStatusResponse(body: unknown): XeroStatusResponse | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Partial<XeroStatusResponse>
  if (!isStatus(b.status) || !isOrgList(b.orgs)) return null
  return {
    ...(b as XeroStatusResponse),
    retired_orgs: isOrgList(b.retired_orgs) ? b.retired_orgs : [],
    more_orgs_needing_attention: typeof b.more_orgs_needing_attention === 'number' ? b.more_orgs_needing_attention : 0,
    // Only an explicit false hides actions; the routes behind them enforce access regardless.
    can_manage: b.can_manage !== false,
  }
}

/** A status answer, or the fact that there is none. Never a guess. */
export type XeroStatusCheck = { ok: true; data: XeroStatusResponse } | { ok: false }

const isAbortError = (err: unknown) => (err as { name?: unknown } | null)?.name === 'AbortError'

/**
 * Ask the status route about one business. A non-2xx, a network failure or a
 * body that is not a status answer are all `{ ok: false }` — none of them is
 * evidence the business is not connected. An abort is rethrown, so a caller that
 * cancelled its own request does not count it as a failed check.
 */
export async function fetchXeroBusinessStatus(businessId: string, init?: RequestInit): Promise<XeroStatusCheck> {
  try {
    const res = await fetch(`/api/Xero/status?business_id=${encodeURIComponent(businessId)}`, init)
    if (!res.ok) return { ok: false }
    const data = parseXeroStatusResponse(await res.json())
    return data ? { ok: true, data } : { ok: false }
  } catch (err) {
    if (isAbortError(err)) throw err
    return { ok: false }
  }
}

/**
 * ok        — every org connected
 * pending   — connected, a first sync still to run
 * attention — the numbers are old; a sync may help
 * reconnect — an org is disconnected or stopped refreshing; a person must reconnect
 * unknown   — we could not check; never a green tick
 * none      — no Xero connection at all
 */
export type XeroStatusTone = 'ok' | 'pending' | 'attention' | 'reconnect' | 'unknown' | 'none'

export interface XeroStatusCopy {
  tone: XeroStatusTone
  /** One line. Names the org when only part of the business is in this state. */
  title: string
  detail: string | null
  /** A live org exists, so a sync can run for it. */
  canSync: boolean
  /** Some org needs a reconnect — also when the headline is a worse "couldn't check". */
  needsReconnect: boolean
}

const MAX_NAMED_ORGS = 3

/** The business's orgs by name — "Dragon Roofing Pty Ltd, EASY HAIL CLAIM PTY LTD", or a count past three. */
export function xeroOrgNames(orgs: readonly XeroStatusOrg[]): string | null {
  const names = orgs.map((o) => o.tenant_name?.trim()).filter((n): n is string => !!n)
  if (names.length === 0) return null
  return names.length <= MAX_NAMED_ORGS ? names.join(', ') : `${names.length} organisations`
}

/**
 * The words for a business's Xero status. The same vocabulary as the coach pill
 * and the /cfo board: the org is named when only part of the business is in the
 * state ("IICT Group Pty Ltd: …"), and any other org that also needs attention
 * is counted, so the worst org never hides the next.
 */
export function describeXeroStatus(
  s: XeroStatusResponse,
  formatDate: (iso: string) => string = (iso) => new Date(iso).toLocaleString(),
): XeroStatusCopy {
  const more = s.more_orgs_needing_attention ?? 0
  const moreNote = more > 0 ? ` (+${more} more org${more === 1 ? ' needs' : 's need'} attention)` : ''
  const scoped = (text: string) => `${s.status_scope ? `${s.status_scope}: ` : ''}${text}${moreNote}`
  const canSync = s.orgs.some((o) => o.status !== 'dead')
  const needsReconnect = s.orgs.some((o) => o.status === 'dead' || o.status === 'auth_stale')
  const names = xeroOrgNames(s.orgs)
  const connectedTitle = names ? `Connected to Xero: ${names}` : 'Connected to Xero'
  const lastSynced = s.last_sync_at ? `Last synced: ${formatDate(s.last_sync_at)}` : null
  // A team member cannot reconnect, so do not tell them to.
  const reconnectAsk = (instruction: string) =>
    s.can_manage === false ? 'Ask the business owner or your coach to reconnect Xero.' : instruction

  switch (s.status) {
    case 'none':
      return { tone: 'none', title: 'Not connected to Xero', detail: null, canSync: false, needsReconnect: false }
    case 'connected':
      return { tone: 'ok', title: connectedTitle, detail: lastSynced, canSync, needsReconnect }
    case 'pending_first_sync':
      return {
        tone: 'pending',
        title: connectedTitle,
        detail: s.status_scope
          ? `${s.status_scope}: first sync pending — it runs within a few hours.`
          : 'First sync pending — it runs within a few hours.',
        canSync,
        needsReconnect,
      }
    case 'data_stale':
      return {
        tone: 'attention',
        title: scoped('Xero numbers have not updated recently'),
        detail: lastSynced ?? 'Never synced',
        canSync,
        needsReconnect,
      }
    case 'auth_stale':
      return {
        tone: 'reconnect',
        title: scoped('Xero has stopped refreshing'),
        detail: reconnectAsk('Xero has not granted access in over 12 hours. Reconnect to keep the figures updating.'),
        canSync,
        needsReconnect,
      }
    case 'dead':
      return {
        tone: 'reconnect',
        title: scoped('Xero disconnected'),
        detail: reconnectAsk('Reconnect Xero to sync the latest figures.'),
        canSync,
        needsReconnect,
      }
    case 'unknown':
    default:
      return {
        tone: 'unknown',
        title: scoped("Couldn't check the Xero connection just now"),
        detail: 'This is not a confirmation that it works.',
        canSync,
        needsReconnect,
      }
  }
}
