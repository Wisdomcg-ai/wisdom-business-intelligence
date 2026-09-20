/**
 * What the subscription and contractor pages need to state a business with
 * more than one Xero organisation in ONE currency.
 *
 * The page summed each organisation's ledger and each vendor's documents as
 * they came: IICT's Dues & Subscriptions printed 20,024 — $15,647.59 AUD plus
 * $163.64 AUD plus HKD 4,213.13 added one-for-one — where Calxa prints 16,568,
 * the Hong Kong figure at August's average rate (IICT-35). So every
 * organisation whose books are in another currency is translated at the
 * month's average rate, the rate its P&L is translated at, before anything is
 * added.
 *
 * A single-organisation business is never translated: its report is stated in
 * its own organisation's currency.
 *
 * A month with no rate is not a rate of 1. The page cannot be produced for
 * that month, and says so (`missing`), rather than print a figure in two
 * currencies at once.
 */
import { loadFxRates } from '@/lib/consolidation/fx'
import { inDisplayOrder, listNames } from './organisation-order'
import { describeMissingRates, type MissingRate } from './consolidated-fx'

type Client = any

/** The currency every figure a consolidated page prints is stated in. */
export const PRESENTATION_CURRENCY = 'AUD'

export interface SubscriptionOrg {
  tenant_id: string
  name: string
  currency: string | null
}

export interface SubscriptionFx {
  /** The organisations, in the coach's display order. */
  orgs: SubscriptionOrg[]
  /** True when more than one organisation is read, so figures are stated in AUD. */
  translates: boolean
  /** The factor one organisation's figures for a month are multiplied by, or null when the month has no rate. */
  rateFor(tenantId: string, month: string): number | null
  /** Pairs and months a page needs and does not have. */
  missing: MissingRate[]
  /** Organisations whose figures cannot be stated in the presentation currency. */
  untranslatable: string[]
}

export const NO_FX: SubscriptionFx = {
  orgs: [],
  translates: false,
  rateFor: () => 1,
  missing: [],
  untranslatable: [],
}

const upper = (c: unknown) => String(c ?? '').trim().toUpperCase()

/**
 * The rates the months need, read once for the whole page.
 *
 * `connections` is every active organisation (resolveXeroConnections). With
 * one, nothing is translated and nothing is read.
 */
export async function buildSubscriptionFx(
  supabase: Client,
  connections: readonly any[],
  months: readonly string[],
): Promise<SubscriptionFx> {
  const orgsInOrder = inDisplayOrder(connections as { id: string; display_order?: number | null }[]) as any[]
  const orgs: SubscriptionOrg[] = orgsInOrder.map((c) => ({
    tenant_id: c.tenant_id,
    name: c.display_name || c.tenant_name || c.tenant_id,
    currency: upper(c.functional_currency) || null,
  }))
  if (orgs.length <= 1) return { ...NO_FX, orgs }
  // Several organisations and one with no currency recorded: which currency its
  // figures are in is unknown, so nothing is translated and the page says the
  // vendor figures mix currencies, exactly as it did before rates were read.
  if (orgs.some((o) => !o.currency)) return { ...NO_FX, orgs }

  const wanted = [...new Set(months.filter(Boolean))]
  const rates = new Map<string, Map<string, number>>()
  for (const currency of [...new Set(orgs.map((o) => o.currency).filter((c): c is string => !!c && c !== PRESENTATION_CURRENCY))]) {
    try {
      rates.set(currency, await loadFxRates(supabase, `${currency}/${PRESENTATION_CURRENCY}`, 'monthly_average', [...wanted]))
    } catch {
      // A rate that could not be read is a rate we do not have: the caller
      // refuses the page rather than adding two currencies together.
      rates.set(currency, new Map())
    }
  }

  const byTenant = new Map(orgs.map((o) => [o.tenant_id, o.currency]))
  const rateFor = (tenantId: string, month: string): number | null => {
    const currency = byTenant.get(tenantId)
    // A tenant the page did not read (a stored row from another organisation)
    // is left as it is.
    if (!currency || currency === PRESENTATION_CURRENCY) return 1
    return rates.get(currency)?.get(month) ?? null
  }

  const missing: MissingRate[] = []
  const untranslatable: string[] = []
  for (const org of orgs) {
    const gaps = wanted.filter((m) => rateFor(org.tenant_id, m) === null)
    if (gaps.length === 0) continue
    untranslatable.push(org.name)
    // In month order, whatever order the caller asked about them in.
    for (const period of [...gaps].sort()) missing.push({ currency_pair: `${org.currency ?? 'unknown'}/${PRESENTATION_CURRENCY}`, period })
  }

  return { orgs, translates: true, rateFor, missing, untranslatable }
}

/** The sentence a page prints in place of its figures. */
export function translationRefusal(fx: SubscriptionFx): string {
  return `${describeMissingRates(fx.missing)}, so ${listNames(fx.untranslatable)} cannot be shown in ${PRESENTATION_CURRENCY}`
}
