/**
 * The bank balance the pack's cashflow page opens the year with.
 *
 * Urban Road's August pack opened July at $0 bank. The business has no saved
 * cashflow assumptions, so `loadCashflowForecast` fell back to
 * `getDefaultCashflowAssumptions()` — `opening_bank_balance: 0` — and every
 * closing balance on the page was the year's cumulative movement presented as
 * money in the bank. The real Total Bank at 30 Jun 2026 was $167,629.81, and
 * it was already sitting in the synced balance-sheet mirror (`xero_bs_lines`).
 *
 * Two rules live here so that no second copy can drift:
 *  1. WHAT COUNTS AS BANK — section 'Bank' AND account_type 'asset', unless the
 *     business has chosen its bank accounts (monthly_report_settings.
 *     bank_account_ids), in which case exactly those asset accounts. The same
 *     definition the money-flow page proves itself against (Δbank ≡ sources −
 *     uses). A credit card is a liability even when it is filed near a bank
 *     account, and counting one would overstate cash by whatever is owing on it
 *     — so a chosen account that is not an asset is still not bank, and the
 *     opening balance of a list naming one is unavailable, not a smaller sum.
 *
 *     Why a choice at all: Calxa's Urban Road pack counts CBA Cheque + Bus
 *     Online Saver as bank and treats the Tax Savings account, PayPal and Wise
 *     as balance-sheet movements. On section 'Bank' our 31 Aug figure was
 *     $210,184.59; on Calxa's two accounts it is $117,724.85. Neither is wrong;
 *     which one a client reads is the coach's call, so the default stays the
 *     section and nothing moves for anyone until an account list is saved.
 *  2. WHEN THE YEAR OPENS — the last day before the fiscal year starts, from the
 *     report month and the business's own `fiscal_year_start`. Never the clock:
 *     a pack re-run in October for August must still open at 30 June.
 *
 * Fail-open house rule — three states, never a fabricated zero. "Unavailable"
 * is its own answer, carried to the page so it can say so, because a
 * projection silently built on $0 reads exactly like a real one.
 *
 * Pure — the route is a thin IO wrapper.
 */

export interface BankRowInput {
  tenant_id: string | null
  /** The Xero AccountID. Needed only when the business has chosen its bank accounts. */
  account_id?: string | null
  /** 'asset' | 'liability' | 'equity' (canonical, from the BS mirror). */
  account_type: string
  section: string | null
  /** 'YYYY-MM-DD' */
  balance_date: string
  balance: number | string | null
}

export interface OpeningTenant {
  tenant_id: string
  /** functional_currency from xero_connections; null is treated as AUD. */
  currency: string | null
}

/** An account the balance-sheet mirror holds for an organisation on ANY date. */
export interface KnownAccountInput {
  tenant_id: string | null
  account_id: string | null
  account_type: string
}

export type OpeningBank =
  | { status: 'read'; amount: number; asAt: string }
  | { status: 'unavailable'; asAt: string | null; reason: string }

/**
 * The bank accounts a business has chosen, as Xero AccountIDs — or null for
 * "every Bank-section asset account", the default.
 *
 * Keyed by AccountID, not code: four of Urban Road's bank accounts (Bus Online
 * Saver, AUD PayPal, both Wise accounts) have no code in Xero at all, and a
 * code is not unique across organisations anyway. An empty list is treated as
 * no choice rather than "no bank accounts": a pack with nothing counted as cash
 * is never what a coach meant, and it would print a confident $0.
 *
 * Lower-cased: an AccountID is a case-insensitive GUID and the mirror serves it
 * as a lower-case uuid, so an id pasted in upper case from Xero's API explorer
 * would otherwise match nothing and drop that account out of bank.
 */
export function parseBankAccountIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string').map((v) => v.trim().toLowerCase()).filter(Boolean))]
  return ids.length > 0 ? ids : null
}

/**
 * The money-flow definition of a bank account. Shared, not re-derived.
 *
 * Both sides are normalised here, not only the row's: the list is public input
 * (the loaders' opts.bankAccountIds) and need not have been through
 * parseBankAccountIds. A presence check that matched case-insensitively beside
 * a sum that did not would call an account present and then leave it out.
 */
export function isBankRow(
  r: { section: string | null; account_type: string; account_id?: string | null },
  bankAccountIds: readonly string[] | null = null,
): boolean {
  if (r.account_type !== 'asset') return false
  if (bankAccountIds) {
    const id = (r.account_id ?? '').trim().toLowerCase()
    return !!id && bankAccountIds.some((b) => b.trim().toLowerCase() === id)
  }
  return r.section === 'Bank'
}

/**
 * The balance date the fiscal year containing `reportMonth` opens from: the
 * last day of the month before its first month.
 *
 *   ('2026-08', 7) → '2026-06-30'   FY2027 opens 1 Jul 2026
 *   ('2026-06', 7) → '2025-06-30'   June still belongs to FY2026
 *   ('2026-08', 1) → '2025-12-31'   a calendar-year business
 */
export function openingBalanceDate(reportMonth: string, yearStartMonth: number): string {
  const [y, m] = reportMonth.split('-').map(Number)
  const start = Number.isInteger(yearStartMonth) && yearStartMonth >= 1 && yearStartMonth <= 12
    ? yearStartMonth
    : 7
  // The calendar year the fiscal year STARTED in.
  const startYear = m >= start ? y : y - 1
  // Day 0 of the start month is the last day of the month before it.
  const d = new Date(Date.UTC(startYear, start - 1, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Total Bank at `asAt` across the business's active Xero organisations.
 *
 * @param rows    balance-sheet mirror rows; rows at other dates are ignored
 * @param tenants the business's ACTIVE connections. Tenant ids are shared
 *                between businesses (IICT's orgs appear under two business
 *                ids), so the caller scopes by connection, not by business_id.
 * @param rawBankAccountIds the business's chosen bank accounts, or null for every
 *                Bank-section asset account. Normalised here with parseBankAccountIds,
 *                so a list that has not been through it reads the same.
 * @param opts.knownAccounts the chosen accounts as the mirror holds them on any
 *                date. A chosen asset account the mirror knows but has no row
 *                for at `asAt` is $0 that day — Xero leaves an account with
 *                nothing in it off the balance sheet — provided that sheet
 *                balances. Omitted, an absent account is simply absent.
 */
export function totalBankAt(
  rows: BankRowInput[],
  asAt: string,
  tenants: OpeningTenant[],
  rawBankAccountIds: readonly string[] | null = null,
  opts: { knownAccounts?: readonly KnownAccountInput[] } = {},
): OpeningBank {
  // Normalised once, so the presence checks and the sum read the same list.
  const bankAccountIds = parseBankAccountIds(rawBankAccountIds)
  if (tenants.length === 0) {
    return { status: 'unavailable', asAt, reason: 'no active Xero connection' }
  }

  // Never sum a foreign currency at 1:1 (IICT holds HKD — FX-01). The pack's
  // single-entity cashflow has no translation step, so it declines instead.
  const foreign = tenants.filter((t) => (t.currency || 'AUD').toUpperCase() !== 'AUD')
  if (foreign.length > 0) {
    return { status: 'unavailable', asAt, reason: 'a Xero organisation reports in a foreign currency' }
  }

  const wanted = new Set(tenants.map((t) => t.tenant_id))
  const atDate = rows.filter((r) => r.balance_date === asAt && r.tenant_id !== null && wanted.has(r.tenant_id))

  // Every organisation must have a balance sheet on that date. An org the sync
  // never reached would otherwise contribute nothing and understate the total
  // with no sign that anything was missing.
  const synced = new Set(atDate.map((r) => r.tenant_id))
  if (tenants.some((t) => !synced.has(t.tenant_id))) {
    return { status: 'unavailable', asAt, reason: `no synced balance sheet at ${asAt}` }
  }

  // Every organisation must also have at least one BANK row. A balance sheet
  // with no bank accounts at all is far more likely to be a mirror that dropped
  // or misfiled its sections — the failure the BS-mirror fixes (#373, #376,
  // #389) spent three PRs on — than a trading business that genuinely holds no
  // cash. Reading that as a confident "Opening bank $0" would be the worst of
  // the three states: a wrong number presented as a fact.
  //
  // With a chosen list the same rule reads "none of the chosen accounts is
  // there": a list naming accounts the sync never wrote would otherwise total
  // $0 exactly as confidently.
  // A list that only PARTLY matches is the same failure, smaller: CBA Cheque
  // found and Bus Online Saver not would open Urban Road's year $86,038 short
  // and still read as a fact. Every chosen account must be on the sheet that
  // day, and be an asset there, or the opening balance is not the one chosen.
  //
  // Except an account Xero simply left off that day. The mirror has no row for
  // an account with nothing in it (Urban Road's USD PayPal is on the sheet at
  // $0 on 31 Jul 2026 and gone by 30 Sep; Wise AUD is on one month-end in
  // fifteen), and a chosen account opened mid-year is not on the sheet the year
  // opens on. When the mirror holds that account for this organisation on
  // another date it is a real account at $0 that day — but only if the sheet
  // balances: a sheet that dropped a row holding money would not, and that row
  // must never be read as $0.
  if (bankAccountIds) {
    const onSheet = new Map(atDate.filter((r) => r.account_id).map((r) => [r.account_id!.trim().toLowerCase(), r.account_type]))
    const known = new Map(
      (opts.knownAccounts ?? [])
        .filter((a) => a.account_id && a.tenant_id !== null && wanted.has(a.tenant_id))
        .map((a) => [a.account_id!.trim().toLowerCase(), a.account_type]),
    )
    const chosen = bankAccountIds
    const offSheet = chosen.filter((id) => !onSheet.has(id))
    const leftOffAtZero = offSheet.filter((id) => known.get(id) === 'asset')
    const absent = offSheet.filter((id) => !known.has(id)).length
    const notAsset = chosen.filter((id) => (onSheet.get(id) ?? known.get(id) ?? 'asset') !== 'asset').length
    const of = (k: number) => `${k} of the ${chosen.length} bank accounts chosen for this report ${k === 1 ? 'is' : 'are'}`
    if (absent > 0 && absent < chosen.length) {
      return { status: 'unavailable', asAt, reason: `${of(absent)} not in the synced balance sheet at ${asAt}` }
    }
    if (absent === 0 && notAsset > 0) {
      return { status: 'unavailable', asAt, reason: `${of(notAsset)} not an asset in the synced balance sheet` }
    }
    if (absent === 0 && leftOffAtZero.length > 0 && leftOffAtZero.length < chosen.length) {
      const unbalanced = tenants.some((t) => {
        let a = 0, l = 0, e = 0
        for (const r of atDate) {
          if (r.tenant_id !== t.tenant_id) continue
          if (r.account_type === 'asset') a += num(r.balance)
          else if (r.account_type === 'liability') l += num(r.balance)
          else if (r.account_type === 'equity') e += num(r.balance)
        }
        // The money-flow page's tolerance: accumulated rounding, not a row.
        return Math.abs(a - l - e) > 1
      })
      if (unbalanced) {
        return {
          status: 'unavailable',
          asAt,
          reason: `${of(leftOffAtZero.length)} not in the synced balance sheet at ${asAt}, and that balance sheet does not balance, so ${leftOffAtZero.length === 1 ? 'it' : 'they'} cannot be read as $0`,
        }
      }
    }
  }

  const bankRows = atDate.filter((r) => isBankRow(r, bankAccountIds))
  const withBank = new Set(bankRows.map((r) => r.tenant_id))
  const withoutBank = tenants.filter((t) => !withBank.has(t.tenant_id)).length
  if (withoutBank > 0) {
    return {
      status: 'unavailable',
      asAt,
      reason: !bankAccountIds
        ? 'no bank accounts in the synced balance sheet'
        // A list naming one organisation's accounts on a business with two is
        // found, just not everywhere — say which it is.
        : withoutBank < tenants.length
          ? `no bank account chosen for this report is in the balance sheet of ${withoutBank} of the ${tenants.length} Xero organisations`
          : 'none of the bank accounts chosen for this report is in the synced balance sheet',
    }
  }

  const total = bankRows.reduce((s, r) => s + num(r.balance), 0)
  return { status: 'read', amount: Math.round(total * 100) / 100, asAt }
}
