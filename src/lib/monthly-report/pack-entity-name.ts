/**
 * The name the monthly pack prints on its cover and in every page title.
 *
 * Calxa prints the Xero organisation's name — "Urban Road Pty Ltd" — and the
 * pack printed the app's display name, "Urban Road", on all twenty-odd pages.
 * The client reads the legal entity on every statement their accountant and
 * their bank send them; a management pack that shortens it looks like it came
 * from somewhere less careful.
 *
 * In order:
 *   1. businesses.legal_name — set deliberately, so it wins
 *   2. the Xero organisation name, when the business has exactly ONE active
 *      organisation. Dragon Roofing and IICT Group have two and three, and no
 *      one of them names the business: concatenating them, or picking the
 *      newest, would print a subsidiary's name over the group's figures.
 *   3. businesses.name, the display name — the old behaviour
 *
 * Fail-open: a read that fails returns null and the caller keeps the display
 * name it already has. A title is never worth blocking an export over.
 *
 * Reads only. `xero_connections.business_id` holds either id-space in legacy
 * rows, so the lookup goes through the branded resolver and matches both.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'

type Client = { from: (table: string) => any }

export interface PackEntityNameSources {
  legalName: string | null | undefined
  displayName: string | null | undefined
  /** Organisation names of the business's ACTIVE Xero connections, one per tenant. */
  tenantNames: readonly (string | null | undefined)[]
}

export function resolvePackEntityName(src: PackEntityNameSources): string | null {
  const clean = (s: string | null | undefined) => (typeof s === 'string' ? s.trim() : '')
  const legal = clean(src.legalName)
  if (legal) return legal
  const tenants = [...new Set(src.tenantNames.map(clean).filter(Boolean))]
  if (tenants.length === 1 && src.tenantNames.length === 1) return tenants[0]
  const display = clean(src.displayName)
  return display || null
}

export async function loadPackEntityName(supabase: Client, businessId: string): Promise<string | null> {
  try {
    const ids = await resolveBusinessProfileIds(supabase, businessId)
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('name, legal_name')
      .eq('id', ids.businessId)
      .maybeSingle()
    if (bizErr) return null
    const { data: conns, error: connErr } = await supabase
      .from('xero_connections')
      .select('tenant_id, tenant_name')
      .in('business_id', ids.all)
      .eq('is_active', true)
    // Without the connections we cannot tell a single-org business from a
    // multi-org one, so do not guess from a partial answer.
    const byTenant = new Map<string, string | null>()
    for (const c of connErr ? [] : (conns ?? []) as { tenant_id: string | null; tenant_name: string | null }[]) {
      byTenant.set(c.tenant_id ?? `row-${byTenant.size}`, c.tenant_name)
    }
    return resolvePackEntityName({
      legalName: biz?.legal_name,
      displayName: biz?.name,
      tenantNames: connErr ? [] : [...byTenant.values()],
    })
  } catch {
    return null
  }
}
