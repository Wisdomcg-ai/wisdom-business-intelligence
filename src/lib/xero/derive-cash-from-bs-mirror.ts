/**
 * Cash balance derived from the balance-sheet mirror.
 *
 * FLEET-02 (26 Aug 2026). `financial_metrics.total_cash` was 0.00 in every row
 * fleet-wide (verified in prod: 27 of 28 rows exactly 0, 1 null, across 6
 * businesses). Three writers — Xero/sync, Xero/callback, Xero/complete-connection
 * — all fetched `api.xro/2.0/BankSummary` and parsed `bankData.BankSummary` as
 * an array of `{ ClosingBalance }`. Xero's BankSummary is a REPORT
 * (`/api.xro/2.0/Reports/BankSummary`) returning `{ Reports: [{ Rows: [...] }] }`,
 * so the property never existed and `totalCash` could only ever be its
 * initialiser. `/cfo` then rendered "Cash $0" for every client as fact.
 *
 * Rather than re-fetch from Xero in three places, derive from the mirror we
 * already sync 6-hourly (`xero_bs_lines`): it is fresher (to 2026-08-31),
 * broader (945 bank rows / 11 businesses), costs no Xero API budget, keeps
 * working while Xero is down, and is naturally multi-org.
 *
 * TWO RULES THIS MODULE EXISTS TO ENFORCE:
 *  1. "No data" is NOT "$0". A business with no bank rows returns
 *     `amount: null` so the UI can render "—". Rendering 0 as a fact is the
 *     failure this replaces.
 *  2. Never sum a foreign currency at 1:1. IICT Group holds HK$1,833,977 in
 *     its HK entity. Without a closing-spot rate that would land as ~$1.8M of
 *     phantom AUD — the same defect as FX-01. An untranslatable tenant is
 *     EXCLUDED from the total and reported in `missing_fx`, so the caller warns
 *     instead of quietly overstating.
 */

export interface DerivedCash {
  /** Total in AUD, or null when nothing could be determined. Never a fabricated 0. */
  amount: number | null
  /** Balance date the figure is drawn from ('YYYY-MM-DD'), or null. */
  as_at: string | null
  /** Tenants excluded because their currency had no closing-spot rate. */
  missing_fx: { currency_pair: string; period: string }[]
  /** True when at least one tenant was excluded — the total is INCOMPLETE. */
  partial: boolean
}

interface BsRow {
  business_id: string
  tenant_id: string | null
  balance_date: string
  balance: number | string | null
  section: string | null
}

const isBankSection = (section: string | null) =>
  !!section && section.toLowerCase().includes('bank')

/**
 * Derive cash for many businesses in one pass.
 *
 * @param businessIdsByKey maps the caller's canonical business key to EVERY id
 *   that business may be stored under (dual-ID: businesses.id and
 *   business_profiles.id both appear across tables).
 */
export async function deriveCashFromBSMirror(
  supabase: { from: (table: string) => any },
  businessIdsByKey: Map<string, string[]>,
): Promise<Map<string, DerivedCash>> {
  const out = new Map<string, DerivedCash>()
  const allIds = Array.from(new Set(Array.from(businessIdsByKey.values()).flat()))
  if (allIds.length === 0) return out

  const { data: rows, error } = await supabase
    .from('xero_bs_lines')
    .select('business_id, tenant_id, balance_date, balance, section')
    .in('business_id', allIds)

  if (error || !rows) {
    // Caller decides how to surface this; returning an empty map means every
    // business reports `amount: null` (unknown) rather than a false zero.
    return out
  }

  const bankRows = (rows as BsRow[]).filter((r) => isBankSection(r.section))

  // Currency per tenant — only non-AUD tenants need translating.
  const tenantIds = Array.from(
    new Set(bankRows.map((r) => r.tenant_id).filter((t): t is string => !!t)),
  )
  const currencyByTenant = new Map<string, string>()
  if (tenantIds.length > 0) {
    const { data: conns } = await supabase
      .from('xero_connections')
      .select('tenant_id, functional_currency')
      .in('tenant_id', tenantIds)
    for (const c of conns ?? []) {
      currencyByTenant.set(c.tenant_id, (c.functional_currency || 'AUD').toUpperCase())
    }
  }

  for (const [key, ids] of businessIdsByKey.entries()) {
    const mine = bankRows.filter((r) => ids.includes(r.business_id))
    if (mine.length === 0) {
      out.set(key, { amount: null, as_at: null, missing_fx: [], partial: false })
      continue
    }

    // Use each business's own newest balance date — businesses sync on
    // different cadences and one stale tenant must not drag the date back.
    const asAt = mine.reduce((max, r) => (r.balance_date > max ? r.balance_date : max), mine[0].balance_date)
    const atDate = mine.filter((r) => r.balance_date === asAt)

    let total = 0
    let sawAny = false
    const missing_fx: { currency_pair: string; period: string }[] = []

    // Group by tenant so each entity is translated (or excluded) as a unit.
    const byTenant = new Map<string, BsRow[]>()
    for (const r of atDate) {
      const t = r.tenant_id ?? '__none__'
      byTenant.set(t, [...(byTenant.get(t) ?? []), r])
    }

    for (const [tenantId, tRows] of byTenant.entries()) {
      const native = tRows.reduce((s, r) => s + Number(r.balance ?? 0), 0)
      const ccy = currencyByTenant.get(tenantId) ?? 'AUD'

      if (ccy === 'AUD') {
        total += native
        sawAny = true
        continue
      }

      const pair = `${ccy}/AUD`
      const { data: fx } = await supabase
        .from('fx_rates')
        .select('rate')
        .eq('currency_pair', pair)
        .eq('rate_type', 'closing_spot')
        .eq('period', asAt)

      const rate = (fx ?? [])[0]?.rate
      if (rate == null) {
        // Excluded, not summed at 1:1 — see rule 2 above.
        missing_fx.push({ currency_pair: pair, period: asAt })
        continue
      }
      total += native * Number(rate)
      sawAny = true
    }

    out.set(key, {
      amount: sawAny ? Math.round(total * 100) / 100 : null,
      as_at: asAt,
      missing_fx,
      partial: missing_fx.length > 0,
    })
  }

  return out
}
