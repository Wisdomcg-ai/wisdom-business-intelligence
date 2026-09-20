/**
 * Bank Balances & Movement — Calxa page 17: what the business holds in the
 * bank at the end of the month, against the end of the month before, account by
 * account, organisation by organisation, and one total.
 *
 * There was no such page (IICT-42). The only bank figure the pack carried was
 * the cashflow's opening balance, and that refuses a foreign organisation
 * outright (opening-bank.ts) — so for IICT Group, whose Hong Kong organisation
 * holds HK$1,237,809, there was nothing at all.
 *
 * WHICH ACCOUNTS. An explicit list of Xero AccountIDs, per business
 * (monthly_report_settings.bank_balance_account_ids, falling back to the
 * cashflow's bank_account_ids). Never a rule over section or account type:
 * Calxa's IICT page counts two Cash on Hand accounts, which Xero files under
 * Current Assets, and the Altitude Business Gold Mastercard, which is a
 * liability (IICT-43). A page that guessed would be a different page each time
 * a bookkeeper re-filed an account. With no list at all it refuses and says so,
 * because "no bank accounts chosen" and "$0 in the bank" look identical once a
 * figure is printed.
 *
 * WHAT A FIGURE MEANS. Every chosen account is shown as money the business
 * HOLDS, so an account Xero's balance sheet files under a liability — a credit
 * card — is printed negative: what is owing on the card is money the group does
 * not hold. The sign comes from the class of the account on that month's Xero
 * balance sheet and from nothing else, so a chart of accounts that cannot be
 * read costs the page no figure.
 *
 * TRANSLATION. A foreign organisation's accounts at the closing rate of each
 * date — the balance-sheet rule (money: balance sheets at closing, P&L at the
 * monthly average). A missing closing rate refuses the page with the date
 * named; Hong Kong dollars are never added to Australian ones.
 *
 * PER ENTITY. A business with more than one Xero organisation gets each
 * organisation's accounts under its own heading with its own subtotal, then one
 * Total Bank. Calxa's page adds two organisations' identically-named credit
 * cards into a single (590) line; each organisation keeps its own here, because
 * a shared account name is not a shared account.
 *
 * NOT FROZEN, deliberately. The balance sheet is frozen into the snapshot at
 * Finalise and kept by Approve & Send (#525, #530) because its page is
 * regenerated from a mirror that moves every six hours, and a finalised August
 * re-exported in October must print the August that went out. This page is
 * built at export like Where Did Our Money Go, which reads the same mirror and
 * is not frozen either: both are one figure per account at two month-ends, both
 * are cheap to rebuild, and the freeze is keyed by comparison mode on the
 * balance sheet's own shape. If a re-export of a sent month ever has to print
 * the same bank page byte for byte, this is the paragraph to come back to — it
 * is a gap, and a stated one, not an oversight.
 *
 * Pure. The loader (bank-balances-load.ts) does the reading.
 */
import type { BalanceSheetRow, BankBalancesData } from '@/app/finances/monthly-report/types'
import {
  balanceSheetColumnLabel,
  balanceSheetDates,
  balanceSheetVariance,
  bsWhole,
} from './balance-sheet-rows'
import type {
  BsCatalogueAccount,
  ConsolidatedBsOrganisation,
  FxRateInput,
  MirrorBsRow,
} from './consolidated-balance-sheet'

export interface BankBalancesInput {
  businessId: string
  /** YYYY-MM */
  month: string
  /** The organisations to show, in display order. */
  organisations: ConsolidatedBsOrganisation[]
  /** xero_bs_lines (basis accruals) at the two printed dates — the WHOLE sheet, not only the chosen accounts. */
  rows: MirrorBsRow[]
  /** null when the chart of accounts could not be read: the page still prints, and says what it could not check. */
  accounts: BsCatalogueAccount[] | null
  rates: FxRateInput[]
  /** The chosen bank, cash-on-hand and credit-card accounts, as Xero AccountIDs. */
  accountIds: string[] | null
}

export type BankBalancesResult =
  | { ok: true; data: BankBalancesData }
  /** `reason` completes "This page couldn't be produced: …". */
  | { ok: false; reason: string }

const PRESENTATION = 'AUD'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-08-31' → '31 Aug 2026'. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const cents = (v: number) => {
  const c = Math.round(v * 100) / 100
  return c === 0 ? 0 : c
}

const idKey = (v: string) => v.trim().toLowerCase()

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** One chosen account of one organisation, translated, on each printed date. */
interface BankLine {
  tenant_id: string
  account_id: string
  account_code: string | null
  label: string
  current: number
  prior: number
}

export function buildBankBalances(input: BankBalancesInput): BankBalancesResult {
  const { current, prior } = balanceSheetDates(input.month, 'mom')
  const orgs = [...new Map(input.organisations.map((o) => [o.tenant_id, o])).values()]
  if (orgs.length === 0) return { ok: false, reason: 'no Xero organisation is connected to this business' }

  const chosen = [...new Set((input.accountIds ?? []).map((v) => idKey(String(v))).filter(Boolean))]
  if (chosen.length === 0) {
    return { ok: false, reason: 'no bank accounts have been chosen for this page — choose them in the report settings' }
  }

  const unknownCurrency = orgs.filter((o) => !(o.functional_currency ?? '').trim())
  if (unknownCurrency.length > 0) {
    return {
      ok: false,
      reason: `the reporting currency of ${listOf(unknownCurrency.map((o) => o.name))} is not recorded, so its balances cannot be added to the others — reconnect it in Xero`,
    }
  }
  const currencyOf = (o: ConsolidatedBsOrganisation) => o.functional_currency!.trim().toUpperCase()

  // Rows by organisation and date. A row for an organisation this report does
  // not cover is not this page's, whatever business id it was stored under.
  const wanted = new Set(orgs.map((o) => o.tenant_id))
  const rowsAt = new Map<string, MirrorBsRow[]>()
  for (const r of input.rows) {
    if (!wanted.has(r.tenant_id)) continue
    if (r.balance_date !== current && r.balance_date !== prior) continue
    const key = `${r.tenant_id}@${r.balance_date}`
    rowsAt.set(key, [...(rowsAt.get(key) ?? []), r])
  }
  const sheet = (tenant: string, date: string) => rowsAt.get(`${tenant}@${date}`) ?? []

  // Every organisation needs a sheet at the report date, or the total is short
  // by an organisation with nothing on the page to say so. The comparison
  // column goes only when NO organisation has one — a prior column missing one
  // organisation would print a movement that never happened.
  const noCurrent = orgs.filter((o) => sheet(o.tenant_id, current).length === 0)
  if (noCurrent.length > 0) {
    return { ok: false, reason: `no balance sheet has been synced for ${listOf(noCurrent.map((o) => o.name))} at ${dayLabel(current)}` }
  }
  const noPrior = orgs.filter((o) => sheet(o.tenant_id, prior).length === 0)
  const hasPrior = noPrior.length < orgs.length
  if (hasPrior && noPrior.length > 0) {
    return { ok: false, reason: `no balance sheet has been synced for ${listOf(noPrior.map((o) => o.name))} at ${dayLabel(prior)}` }
  }
  const dates = hasPrior ? [current, prior] : [current]

  // The closing rate on each printed date, for each foreign organisation.
  const closing = new Map<string, number>()
  for (const r of input.rates) {
    const rate = num(r.rate)
    if (rate > 0 && r.rate_type === 'closing_spot') closing.set(`${r.currency_pair}@${r.period.slice(0, 10)}`, rate)
  }
  const pairOf = (o: ConsolidatedBsOrganisation) => `${currencyOf(o)}/${PRESENTATION}`
  const foreignOrgs = orgs.filter((o) => currencyOf(o) !== PRESENTATION)
  const missing: string[] = []
  for (const o of foreignOrgs) {
    for (const d of dates) if (!closing.has(`${pairOf(o)}@${d}`)) missing.push(`${pairOf(o)}@${d}`)
  }
  if (missing.length > 0) {
    const byPair = new Map<string, string[]>()
    for (const k of [...new Set(missing)]) {
      const [pair, date] = k.split('@')
      byPair.set(pair, [...(byPair.get(pair) ?? []), date])
    }
    const clauses = [...byPair.entries()].map(([pair, ds]) => `${pair} closing rate is stored for ${listOf(ds.sort().map(dayLabel))}`)
    return { ok: false, reason: `no ${clauses.join('; no ')}` }
  }

  // Every chosen account has to be an account of one of this business's Xero
  // organisations. Three ways it can fail to be, and they are not the same
  // thing:
  //   - it is on one of the printed sheets, or the chart of accounts has it
  //     under an organisation this report covers — a real account, whether or
  //     not it had a balance in either month (Xero leaves a nil account off);
  //   - the chart of accounts has it under an organisation this report leaves
  //     out — a real account of the business, not this page's. Left out, with
  //     a line under the table saying how many, rather than refused: a coach
  //     excluding an organisation from the consolidation should not have to
  //     retype the account list too;
  //   - nothing knows it: pasted from another client, or left behind when an
  //     organisation was disconnected. That is the one that refuses, because a
  //     total short by a real account looks exactly like a total that is right.
  const tenantsOf = new Map<string, Set<string>>()
  for (const a of input.accounts ?? []) {
    const k = idKey(a.xero_account_id)
    tenantsOf.set(k, (tenantsOf.get(k) ?? new Set<string>()).add(a.tenant_id))
  }
  const onSheet = new Set([...rowsAt.values()].flat().map((r) => idKey(r.account_id)))
  const warnings: string[] = []
  const notes: string[] = []
  let elsewhere = 0
  let strangers = 0
  for (const id of chosen) {
    if (onSheet.has(id)) continue
    const tenants = tenantsOf.get(id)
    if (!tenants) strangers += 1
    else if (![...tenants].some((t) => wanted.has(t))) elsewhere += 1
  }
  if (input.accounts === null) {
    // Without the catalogue, an account with no balance in either month cannot
    // be told from one that is not here at all. Both print as nothing, so no
    // figure on the page moves — say what was not checked and print it.
    if (strangers > 0) {
      warnings.push(
        'The chart of accounts could not be read, so a chosen account with no balance in either month could not be told apart from one this report does not cover.',
      )
    }
  } else if (strangers > 0) {
    return {
      ok: false,
      reason:
        `${strangers} of the ${chosen.length} bank accounts chosen for this page ` +
        `${strangers === 1 ? 'is' : 'are'} not in the Xero organisations this report covers`,
    }
  }

  // ─── The accounts ─────────────────────────────────────────────────────────
  const wantedIds = new Set(chosen)
  const catalogueCode = new Map(
    (input.accounts ?? []).filter((a) => wanted.has(a.tenant_id)).map((a) => [`${a.tenant_id}::${idKey(a.xero_account_id)}`, a.account_code ?? null]),
  )
  const byOrg = new Map<string, Map<string, BankLine>>(orgs.map((o) => [o.tenant_id, new Map()]))
  let sawLiability = false

  for (const o of orgs) {
    const foreign = currencyOf(o) !== PRESENTATION
    const lines = byOrg.get(o.tenant_id)!
    for (const d of dates) {
      const rate = foreign ? closing.get(`${pairOf(o)}@${d}`)! : 1
      for (const r of sheet(o.tenant_id, d)) {
        const id = idKey(r.account_id)
        if (!wantedIds.has(id)) continue
        // Money HELD. Xero's own balance sheet says which side the account is
        // on that month; a credit card sits under liabilities and comes off.
        const reported = r.account_type.trim().toLowerCase()
        if (reported === 'liability') sawLiability = true
        const sign = reported === 'liability' ? -1 : 1
        let line = lines.get(id)
        if (!line) {
          line = {
            tenant_id: o.tenant_id,
            account_id: id,
            account_code: r.account_code ?? catalogueCode.get(`${o.tenant_id}::${id}`) ?? null,
            label: r.account_name,
            current: 0,
            prior: 0,
          }
          lines.set(id, line)
        }
        const value = cents(num(r.balance) * sign * rate)
        if (d === current) line.current = cents(line.current + value)
        else line.prior = cents(line.prior + value)
      }
    }
  }

  // Calxa's order inside a group: account code compared as a string, codeless
  // accounts after them by name — the balance sheet's rule (sortLines).
  const ordered = (lines: BankLine[]) =>
    [...lines].sort((a, b) => {
      const ta = a.account_code ? 0 : 1
      const tb = b.account_code ? 0 : 1
      if (ta !== tb) return ta - tb
      if (ta === 0 && a.account_code !== b.account_code) return a.account_code! < b.account_code! ? -1 : 1
      const na = a.label.toLowerCase()
      const nb = b.label.toLowerCase()
      return na < nb ? -1 : na > nb ? 1 : 0
    })

  const priorOf = (v: number) => (hasPrior ? v : null)
  const figures = (c: number, p: number) => {
    const pr = priorOf(p)
    return { current: c, prior: pr, ...balanceSheetVariance('asset', c, pr) }
  }

  const rows: BalanceSheetRow[] = []
  let totalCurrent = 0
  let totalPrior = 0
  const perEntity = orgs.length > 1

  for (const o of orgs) {
    const lines = ordered([...byOrg.get(o.tenant_id)!.values()])
    let subCurrent = 0
    let subPrior = 0
    if (perEntity) {
      rows.push({ type: 'section_header', label: o.name, current: null, prior: null, variance: null, variance_pct: null, depth: 1 })
    }
    for (const line of lines) {
      subCurrent += line.current
      subPrior += line.prior
      // Hidden from the page, never from the total — the balance sheet's rule.
      // Calxa's page leaves its nil accounts off too.
      if (bsWhole(line.current) === 0 && bsWhole(hasPrior ? line.prior : 0) === 0) continue
      rows.push({ type: 'line_item', label: line.label, ...figures(line.current, line.prior) })
    }
    subCurrent = cents(subCurrent)
    subPrior = cents(subPrior)
    if (perEntity) {
      rows.push({ type: 'subtotal', label: `Total ${o.name}`, ...figures(subCurrent, subPrior), depth: 1 })
    }
    totalCurrent += subCurrent
    totalPrior += subPrior
  }
  rows.push({ type: 'net_assets', label: 'Total Bank', ...figures(cents(totalCurrent), cents(totalPrior)), depth: 0 })

  for (const o of foreignOrgs) {
    const at = dates.map((d) => `${balanceSheetColumnLabel(d)} ${closing.get(`${pairOf(o)}@${d}`)!.toFixed(4)}`).join('; ')
    notes.push(`${o.name} reports in ${currencyOf(o)}, translated at the closing rate on each date (${at}).`)
  }
  if (sawLiability) {
    notes.push('Credit cards are shown as negative assets: what is owing on the card is money the group does not hold.')
  }
  if (elsewhere > 0) {
    notes.push(
      `Leaves out ${elsewhere} chosen ${elsewhere === 1 ? 'account that belongs' : 'accounts that belong'} to a Xero organisation this report does not cover.`,
    )
  }

  return {
    ok: true,
    data: {
      business_id: input.businessId,
      report_date: current,
      prior_date: hasPrior ? prior : null,
      current_label: balanceSheetColumnLabel(current),
      prior_label: hasPrior ? balanceSheetColumnLabel(prior) : '',
      rows,
      organisations: orgs.map((o) => ({ name: o.name, currency: currencyOf(o) })),
      notes,
      warnings,
    },
  }
}
