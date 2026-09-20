/**
 * The order a business's Xero organisations are read and printed in.
 *
 * xero_connections.display_order is the coach's order — the one the
 * consolidation engine prints entity columns in (Admin > Consolidation, per
 * tenant). Ties break on the connection id, never on created_at: every
 * organisation connected in one sign-in shares created_at to the microsecond
 * (Dragon's two, IICT's three), so "newest first" is whatever row Postgres
 * hands back first (DRG-19, IICT-24). A connection with no display_order is 0,
 * as the engine reads it.
 */
export interface OrderableConnection {
  id: string
  display_order?: number | null
}

export function inDisplayOrder<C extends OrderableConnection>(connections: readonly C[]): C[] {
  return [...connections].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** "A", "A and B", "A, B and C". */
export function listNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
