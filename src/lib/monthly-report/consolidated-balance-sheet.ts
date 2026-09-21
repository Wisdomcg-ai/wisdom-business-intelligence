/**
 * The Balance Sheet page for a business Xero holds as several organisations —
 * Dragon Roofing's two, IICT Group's three (one of them in Hong Kong dollars) —
 * built from the stored balance-sheet mirror, xero_bs_lines, per organisation.
 *
 * The page could not print for either (DRG-41, IICT-45). The single-org route
 * refused a second organisation, and the Consolidated BS tab's engine read the
 * legacy xero_balance_sheet_lines table (53 rows for Dragon, three months) and
 * translated equity at the closing rate, where IICT's HKD net assets came out
 * 13,902,590 with no rate stored and Calxa prints 1,138,758.
 *
 * What it prints is the single-org page, by the single-org page's rules
 * (flatClassSheet): Asset, Liability, Net Assets, Equity, each account in its
 * Xero account Class with credit cards as negative assets (decision 6 — not
 * Calxa's netting of same-named rows across classes), whole dollars, the same
 * variance signs and the same $0.05 proof. On top of that, three things only a
 * group has:
 *
 *   1. TRANSLATION (IAS 21, decision 7). A foreign organisation's assets and
 *      liabilities at the closing rate on each date. Its equity at the rate
 *      when the financial year began, with every movement since at the
 *      average rate of the month it happened in, and the Currency Translation
 *      Difference as what that leaves against its net assets. A missing
 *      closing rate refuses the page, with the dates named — never HKD added
 *      to AUD one for one. Historical rates for earlier years are not stored,
 *      so "brought forward" means at the year's opening rate, and the note
 *      under the table says so. Where even that cannot be done (a month-end
 *      the sync never wrote, an average rate not loaded) the organisation's
 *      equity is translated at the closing rate like everything else, and the
 *      note says why.
 *
 *   2. ELIMINATIONS (decision 5). consolidation_elimination_rules of type
 *      intercompany_loan, which a coach sets: both sides of the loan come off
 *      the sheet, and one line under the table names them. Eliminating a pair
 *      whose sides agree cannot move Net Assets; eliminating one whose sides do
 *      NOT agree would move it by the difference without a word. So a pair
 *      further apart on either date than the $0.05 the sheet proves itself to
 *      is not eliminated at all: both sides stay in full and the page warns
 *      how far apart they are (IICT's three loans are 68,211, 55,052 and 449
 *      apart today — IICT-49). And when nothing came off at all — the state a
 *      group ships in, before a coach has written a rule — one note says the
 *      class totals are gross of intercompany, because Net Assets is right
 *      either way but Total Asset and Total Liability are not.
 *
 *   3. ALIGNMENT. Accounts are placed per organisation and then added by class
 *      and name — the consolidation's rule (account-alignment.ts), never by
 *      code: 26 of the 74 codes Dragon and Easy Hail share name different
 *      accounts (DRG-40). An elimination is applied to the one organisation's
 *      account before it is added to a same-named account of another. An
 *      account sits in ONE class, settled once from the report date, and each
 *      column is restated from the class Xero's report filed THAT column's row
 *      under — never one date's class with another date's sign.
 *
 * And above all of it, the sheet names the organisations it added. Nothing
 * else on the page does, and a group that quietly loses a connection prints
 * every total short, balanced, with no mark of it.
 *
 * Refused, with the reason the page prints, when an organisation has no
 * synced balance sheet at a date the page prints, when an organisation's
 * currency is not recorded, or when a closing rate is missing. Pure: the
 * loader (consolidated-balance-sheet-load.ts) does the reading.
 */
import type { BalanceSheetCompare, BalanceSheetData } from '@/app/finances/monthly-report/types'
import type { EliminationRule } from '@/lib/consolidation/types'
import { matchRuleToLines } from '@/lib/consolidation/eliminations'
import {
  CLASS_OF_XERO,
  NET_ASSETS_TOLERANCE,
  balanceSheetColumnLabel,
  balanceSheetDates,
  bsAmountText,
  flatClassSheet,
  isCurrentYearEarnings,
  type BsClass,
  type PlacedBsLine,
} from './balance-sheet-rows'
import { openingBalanceDate } from './opening-bank'

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface ConsolidatedBsOrganisation {
  tenant_id: string
  name: string
  /** xero_connections.functional_currency; null when it was never recorded. */
  functional_currency: string | null
}

/** A xero_bs_lines row (basis accruals). */
export interface MirrorBsRow {
  tenant_id: string
  account_id: string
  account_code: string | null
  account_name: string
  /** The class Xero's report printed the row under: 'asset' | 'liability' | 'equity'. */
  account_type: string
  section: string | null
  balance_date: string
  balance: number | string | null
}

/** What xero_accounts says about one AccountID in one organisation. */
export interface BsCatalogueAccount {
  tenant_id: string
  xero_account_id: string
  account_code: string | null
  xero_class: string | null
  bank_account_type?: string | null
  last_synced_at?: string | null
}

export interface FxRateInput {
  currency_pair: string
  rate_type: string
  /** 'YYYY-MM-01' for a monthly average; the month-end for a closing rate. */
  period: string
  rate: number | string
}

export interface ConsolidatedBsInput {
  businessId: string
  /** YYYY-MM */
  month: string
  compare: BalanceSheetCompare
  /** business_profiles.fiscal_year_start (7 for every client today). */
  fiscalYearStart: number
  /** The organisations to add together, in display order. */
  organisations: ConsolidatedBsOrganisation[]
  rows: MirrorBsRow[]
  /** null when the catalogue could not be read: each account then keeps the class Xero's report gave it. */
  accounts: BsCatalogueAccount[] | null
  rates: FxRateInput[]
  rules: EliminationRule[]
}

export type ConsolidatedBsResult =
  | { ok: true; data: BalanceSheetData }
  /** `reason` completes "This page couldn't be produced: …". */
  | { ok: false; reason: string }

const PRESENTATION = 'AUD'

/**
 * Dollars. How far apart an intercompany loan's two sides may be and still
 * come off the sheet — the sheet's OWN proof, never a looser figure of this
 * page's choosing. Taking a pair off moves Net Assets by the difference
 * between its sides while Total Equity does not move, so any tolerance wider
 * than the $0.05 the page proves itself to lets the page break its own
 * arithmetic: a pair 50c apart was netted, Net Assets went 50c off Total
 * Equity, and the page then raised two banners about a residual it had created
 * itself, with consolidation.warnings empty. Inside $0.05 the movement is
 * below anything the page can print.
 */
export const ELIMINATION_TOLERANCE = NET_ASSETS_TOLERANCE

// ─── Dates ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-08-31' → '31 Aug 2026'. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

function monthEnd(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Every month-end after `opening` up to and including `asAt`, oldest first. */
function monthEndsAfter(opening: string, asAt: string): string[] {
  const out: string[] = []
  let [y, m] = opening.split('-').map(Number)
  for (let i = 0; i < 240; i++) {
    m += 1
    if (m > 12) { m = 1; y += 1 }
    const end = monthEnd(y, m)
    if (end > asAt) break
    out.push(end)
  }
  return out
}

/**
 * The dates the page reads. Every organisation needs the two it prints; a
 * foreign one also needs the day each column's financial year opened and every
 * month-end from there, to translate its equity (see the header).
 */
export function consolidatedBalanceSheetDates(
  month: string,
  compare: BalanceSheetCompare,
  fiscalYearStart: number,
): { current: string; prior: string; foreign: string[] } {
  const { current, prior } = balanceSheetDates(month, compare)
  const walk = (asAt: string) => {
    const opening = openingBalanceDate(asAt.slice(0, 7), fiscalYearStart)
    return [opening, ...monthEndsAfter(opening, asAt)]
  }
  const foreign = [...new Set([...walk(prior), ...walk(current)])].sort()
  return { current, prior, foreign }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const cents = (v: number) => {
  const c = Math.round(v * 100) / 100
  return c === 0 ? 0 : c
}

const idOf = (tenant: string, accountId: string) => `${tenant}::${accountId.trim().toLowerCase()}`

const isAssetSide = (cls: BsClass) => cls === 'asset'

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function rateText(rate: number): string {
  return rate.toFixed(4)
}

/** One organisation's account, placed in its class and translated, for each printed date. */
interface OrgLine {
  tenant_id: string
  /** Absent for the lines translation makes (Retained Earnings b/f, Current Earnings, the difference). */
  account_id: string | null
  account_code: string | null
  /** The name Xero gives the account — what a rule's pattern is matched against. */
  account_name: string
  /** The name the page prints. */
  label: string
  cls: BsClass
  values: Record<string, number>
  eliminated?: boolean
}

// ─── The builder ────────────────────────────────────────────────────────────

export function buildConsolidatedBalanceSheet(input: ConsolidatedBsInput): ConsolidatedBsResult {
  const { current, prior } = balanceSheetDates(input.month, input.compare)
  const orgs = [...new Map(input.organisations.map((o) => [o.tenant_id, o])).values()]
  if (orgs.length === 0) return { ok: false, reason: 'no Xero organisation is included in this consolidation' }

  const unknownCurrency = orgs.filter((o) => !(o.functional_currency ?? '').trim())
  if (unknownCurrency.length > 0) {
    return {
      ok: false,
      reason: `the reporting currency of ${listOf(unknownCurrency.map((o) => o.name))} is not recorded, so its balances cannot be added to the others — reconnect it in Xero`,
    }
  }
  const currencyOf = (o: ConsolidatedBsOrganisation) => o.functional_currency!.trim().toUpperCase()

  // Rows by organisation and date. A row for an organisation not in the
  // consolidation is not this sheet's, whatever business id it was stored under.
  const wanted = new Set(orgs.map((o) => o.tenant_id))
  const rowsAt = new Map<string, MirrorBsRow[]>()
  for (const r of input.rows) {
    if (!wanted.has(r.tenant_id)) continue
    const key = `${r.tenant_id}@${r.balance_date}`
    rowsAt.set(key, [...(rowsAt.get(key) ?? []), r])
  }
  const sheet = (tenant: string, date: string) => rowsAt.get(`${tenant}@${date}`) ?? []

  // Every organisation has a sheet at the report date, or the page does not
  // add up to the business. The comparison column is absent only when no
  // organisation has one — an organisation missing from it alone would print
  // a prior total short by that organisation with nothing to say so.
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

  // Rates. The closing rate on each printed date is required; without it there
  // is no figure to print for a foreign organisation at all.
  const closing = new Map<string, number>()
  const average = new Map<string, number>()
  for (const r of input.rates) {
    const rate = num(r.rate)
    if (!(rate > 0)) continue
    if (r.rate_type === 'closing_spot') closing.set(`${r.currency_pair}@${r.period.slice(0, 10)}`, rate)
    else if (r.rate_type === 'monthly_average') average.set(`${r.currency_pair}@${r.period.slice(0, 7)}`, rate)
  }
  const pairOf = (o: ConsolidatedBsOrganisation) => `${currencyOf(o)}/${PRESENTATION}`
  const foreignOrgs = orgs.filter((o) => currencyOf(o) !== PRESENTATION)
  const missingClosing: string[] = []
  for (const o of foreignOrgs) {
    for (const d of dates) {
      if (!closing.has(`${pairOf(o)}@${d}`)) missingClosing.push(`${pairOf(o)}@${d}`)
    }
  }
  if (missingClosing.length > 0) {
    const byPair = new Map<string, string[]>()
    for (const k of [...new Set(missingClosing)]) {
      const [pair, date] = k.split('@')
      byPair.set(pair, [...(byPair.get(pair) ?? []), date])
    }
    const clauses = [...byPair.entries()].map(([pair, ds]) => `${pair} closing rate is stored for ${listOf(ds.sort().map(dayLabel))}`)
    return { ok: false, reason: `no ${clauses.join('; no ')}` }
  }

  // The catalogue decides each account's class, as on the single-org page. A
  // failed read costs placement (a card stays where Xero's report filed it),
  // never the sheet: Net Assets is the same either way.
  //
  // One AccountID can have two catalogue rows (xero_accounts is written under
  // both business ids) and they need not agree: IICT (Aust)'s "Loan - IICT
  // Group Pty Ltd" is 700 NONCURRENT in one and 900 TERMLIAB in the other — an
  // account recoded in Xero, and a row nobody refreshed. The mirror's code was
  // copied from the catalogue Xero sent at that sync, so the row carrying the
  // same code is the current one; failing that, the latest synced.
  const catalogueRows = new Map<string, BsCatalogueAccount[]>()
  for (const a of input.accounts ?? []) {
    const key = idOf(a.tenant_id, a.xero_account_id)
    catalogueRows.set(key, [...(catalogueRows.get(key) ?? []), a])
  }
  const catalogueEntry = (r: MirrorBsRow): BsCatalogueAccount | undefined => {
    const candidates = catalogueRows.get(idOf(r.tenant_id, r.account_id)) ?? []
    if (candidates.length <= 1) return candidates[0]
    const sameCode = candidates.filter((a) => (a.account_code ?? null) === (r.account_code ?? null))
    const pool = sameCode.length > 0 ? sameCode : candidates
    return [...pool].sort((x, y) => String(y.last_synced_at ?? '').localeCompare(String(x.last_synced_at ?? '')))[0]
  }

  /** Where one row would sit, and the class Xero's report filed it under. */
  const placeOf = (r: MirrorBsRow): { cls: BsClass; reported: BsClass } => {
    const reported = (CLASS_OF_XERO[r.account_type.toUpperCase()] ?? 'asset') as BsClass
    const cat = catalogueEntry(r)
    const cls = (cat?.xero_class && CLASS_OF_XERO[cat.xero_class.toUpperCase()]) || reported
    return { cls, reported }
  }

  /**
   * A balance restated in another class's sign — restate() in
   * balance-sheet-rows.ts: a card Xero files under Current Liabilities at
   * +7,146 is an asset of (7,146).
   *
   * `to` is the class of the LINE, never of the row. An account sits in ONE
   * class on the sheet and every column of it is restated from the class THAT
   * column's own row was reported under — the single-org page's currentFrom /
   * priorFrom (balance-sheet-rows.ts). Flipping against the row's own
   * placement instead kept the report date's class and took the comparison
   * date's sign: IICT (Aust)'s "Loan - IICT Group Pty Ltd", recoded from 900
   * LIABILITY to 700 ASSET between 30 June and 31 July 2025, printed June's
   * 4,400 as (4,400) in the asset column and left Net Assets 8,800 under Total
   * Equity, with nothing on the page to name the cause.
   */
  const flipTo = (to: BsClass, reported: BsClass): 1 | -1 => (isAssetSide(to) === isAssetSide(reported) ? 1 : -1)

  const notes: string[] = []
  const fxNotes: string[] = []
  const warnings: string[] = []
  const lines: OrgLine[] = []

  for (const o of orgs) {
    const foreign = currencyOf(o) !== PRESENTATION
    const keyOf = (r: MirrorBsRow) => r.account_id.trim().toLowerCase()

    // ONE class an account, decided before any figure is added: the report
    // date's placement, the comparison date's when the account is only there —
    // what buildClassRows settles with `catalogued || entry.cls || priorCls`.
    // Deciding it per date instead split an account that moved between Asset
    // and Equity across two lines, and mixed one date's class with another
    // date's sign (see flipTo). `dates` is the report date first. A date
    // outside the two printed ones — the month-ends a foreign organisation's
    // equity walk reads — keeps its own placement for an account the printed
    // dates never carried.
    const classOf = new Map<string, BsClass>()
    for (const d of dates) {
      for (const r of sheet(o.tenant_id, d)) {
        if (!classOf.has(keyOf(r))) classOf.set(keyOf(r), placeOf(r).cls)
      }
    }
    const classFor = (r: MirrorBsRow): BsClass => classOf.get(keyOf(r)) ?? placeOf(r).cls

    const byAccount = new Map<string, OrgLine>()
    const lineFor = (r: MirrorBsRow, cls: BsClass): OrgLine => {
      const key = keyOf(r)
      let line = byAccount.get(key)
      if (!line) {
        const cat = catalogueEntry(r)
        line = {
          tenant_id: o.tenant_id,
          account_id: key,
          account_code: r.account_code ?? cat?.account_code ?? null,
          account_name: r.account_name,
          label: isCurrentYearEarnings(r.account_name, key) ? 'Current Earnings' : r.account_name,
          cls,
          values: {},
        }
        byAccount.set(key, line)
      }
      return line
    }

    // Assets and liabilities: at the closing rate of their own date.
    for (const d of dates) {
      const rate = foreign ? closing.get(`${pairOf(o)}@${d}`)! : 1
      for (const r of sheet(o.tenant_id, d)) {
        const cls = classFor(r)
        if (cls === 'equity') continue
        const line = lineFor(r, cls)
        line.values[d] = cents((line.values[d] ?? 0) + num(r.balance) * flipTo(cls, placeOf(r).reported) * rate)
      }
    }

    // Equity.
    const netAssetsAt = (d: number | string) => {
      const date = String(d)
      let v = 0
      for (const line of byAccount.values()) {
        if (line.cls === 'equity') continue
        v += (isAssetSide(line.cls) ? 1 : -1) * (line.values[date] ?? 0)
      }
      return v
    }

    if (!foreign) {
      for (const d of dates) {
        for (const r of sheet(o.tenant_id, d)) {
          const cls = classFor(r)
          if (cls !== 'equity') continue
          const line = lineFor(r, cls)
          line.values[d] = cents((line.values[d] ?? 0) + num(r.balance) * flipTo(cls, placeOf(r).reported))
        }
      }
      lines.push(...byAccount.values())
      continue
    }

    const translated = translateForeignEquity({
      org: o,
      pair: pairOf(o),
      dates,
      fiscalYearStart: input.fiscalYearStart,
      hasSheet: (d) => sheet(o.tenant_id, d).length > 0,
      // Its equity accounts, each in equity's sign.
      equity: (d) =>
        sheet(o.tenant_id, d).flatMap((r) => {
          const cls = classFor(r)
          return cls === 'equity' ? [{ ...r, balance: num(r.balance) * flipTo(cls, placeOf(r).reported) }] : []
        }),
      closing,
      average,
    })
    const equityLines: OrgLine[] = []
    const addEquity = (label: string, d: string, v: number, from?: MirrorBsRow) => {
      const key = label.trim().toLowerCase()
      let line = equityLines.find((l) => l.label.trim().toLowerCase() === key)
      if (!line) {
        line = {
          tenant_id: o.tenant_id,
          account_id: from ? from.account_id.trim().toLowerCase() : null,
          account_code: from?.account_code ?? null,
          account_name: from?.account_name ?? label,
          label,
          cls: 'equity',
          values: {},
        }
        equityLines.push(line)
      }
      line.values[d] = cents((line.values[d] ?? 0) + v)
    }
    for (const d of dates) {
      for (const part of translated.parts[d]) addEquity(part.label, d, part.value, part.from)
      // What the equity leaves against the net assets at the closing rate, in
      // cents already rounded on both sides so the sheet proves to the cent.
      const equity = equityLines.reduce((s, l) => s + (l.values[d] ?? 0), 0)
      addEquity('Currency Translation Difference', d, netAssetsAt(d) - equity)
    }
    lines.push(...byAccount.values(), ...equityLines)
    fxNotes.push(translated.note)
  }

  // ─── Eliminations ─────────────────────────────────────────────────────────
  const nameOf = new Map(orgs.map((o) => [o.tenant_id, o.name]))
  const loanRules = input.rules.filter((r) => r.rule_type === 'intercompany_loan' && r.active !== false)
  let eliminatedAny = false
  for (const rule of loanRules) {
    const aName = nameOf.get(rule.tenant_a_id)
    const bName = nameOf.get(rule.tenant_b_id)
    if (!aName || !bName) {
      warnings.push(
        `An intercompany loan elimination names an organisation that is not in this consolidation${aName || bName ? ` (its other side is ${aName ?? bName})` : ''}, so nothing was eliminated for it.`,
      )
      continue
    }
    const side = (tenant: string, which: 'a' | 'b'): OrgLine[] | null => {
      const candidates = lines.filter((l) => l.tenant_id === tenant && l.account_id && l.cls !== 'equity' && !l.eliminated)
      try {
        const matched = matchRuleToLines(
          rule,
          which,
          candidates.map((l) => ({
            business_id: '',
            tenant_id: l.tenant_id,
            account_name: l.account_name,
            account_code: l.account_code,
            account_type: l.cls,
            section: '',
            monthly_values: {},
          })),
        )
        return candidates.filter((l) => matched.some((m) => m.account_name === l.account_name && m.account_code === l.account_code))
      } catch {
        return null
      }
    }
    const a = side(rule.tenant_a_id, 'a')
    const b = side(rule.tenant_b_id, 'b')
    if (!a || !b) {
      warnings.push(`The intercompany loan elimination between ${aName} and ${bName} has an account pattern that cannot be read, so nothing was eliminated for it.`)
      continue
    }
    if (a.length === 0 || b.length === 0) {
      const missing = [a.length === 0 ? aName : null, b.length === 0 ? bName : null].filter(Boolean) as string[]
      warnings.push(`The intercompany loan elimination between ${aName} and ${bName} matches no account in ${listOf(missing)}, so nothing was eliminated for it.`)
      continue
    }
    const pair = [...a, ...b]
    // What the pair adds to Net Assets on each date: 0 when the sides agree.
    const apart = dates.map((d) => ({
      d,
      gap: pair.reduce((s, l) => s + (isAssetSide(l.cls) ? 1 : -1) * (l.values[d] ?? 0), 0),
    }))
    const describe = (ls: OrgLine[], org: string) => `${listOf([...new Set(ls.map((l) => l.account_name))])} (${org})`
    const unbalanced = apart.filter((x) => Math.abs(x.gap) > ELIMINATION_TOLERANCE)
    if (unbalanced.length > 0) {
      // Whole dollars are the page's convention, but they would print a gap of
      // 50c as "1 apart" and one of 6c as "0 apart" — so a gap this side of a
      // dollar says its cents.
      const gapText = (gap: number) => (Math.abs(gap) < 1 ? Math.abs(gap).toFixed(2) : bsAmountText(Math.abs(gap)))
      const amounts = unbalanced.map((x) => `${gapText(x.gap)} apart at ${balanceSheetColumnLabel(x.d)}`)
      warnings.push(
        `Not eliminated: ${describe(a, aName)} and ${describe(b, bName)} are ${listOf(amounts)}, so both are shown in full. Reconcile the loan in Xero and it will be eliminated.`,
      )
      continue
    }
    for (const l of pair) l.eliminated = true
    eliminatedAny = true
    const gross = a.reduce((s, l) => s + Math.abs(l.values[current] ?? 0), 0)
    notes.push(
      `Eliminated on consolidation: ${describe(a, aName)} against ${describe(b, bName)}, ${bsAmountText(gross)} at ${balanceSheetColumnLabel(current)}.`,
    )
  }

  // What a group's Total Asset and Total Liability include when nothing came
  // off. Net Assets is right either way — the two sides of a loan cancel in it
  // — but the class totals the page labels as the group's carry both sides of
  // every intercompany balance, and IICT's are about 2.2m each. The only
  // disclosure this page had was the "Not eliminated" warning, which needs a
  // rule to already exist, so the configuration every group starts in — no
  // rules at all — was the one that said nothing.
  if (orgs.length > 1 && !eliminatedAny) {
    notes.push(
      loanRules.length === 0
        ? 'No intercompany elimination rules are set for this business, so any loans between the organisations ' +
          'are included in full in Total Asset and Total Liability.'
        : 'No intercompany balances were eliminated, so any loans between the organisations ' +
          'are included in full in Total Asset and Total Liability.',
    )
  }

  // ─── Alignment and order ──────────────────────────────────────────────────
  interface Aligned { cls: BsClass; label: string; codes: string[]; current: number; prior: number }
  const aligned = new Map<string, Aligned>()
  for (const l of lines) {
    const key = `${l.cls}::${l.label.trim().toLowerCase()}`
    const row = aligned.get(key) ?? { cls: l.cls, label: l.label, codes: [], current: 0, prior: 0 }
    if (l.account_code) row.codes.push(l.account_code)
    if (!l.eliminated) {
      row.current += l.values[current] ?? 0
      if (hasPrior) row.prior += l.values[prior] ?? 0
    }
    aligned.set(key, row)
  }

  // Calxa's order, as on the single-org page: by code as a string, codeless
  // accounts after by name, and the two lines translation makes closing
  // Equity — the difference, then Current Earnings last.
  const PINNED = ['currency translation difference', 'current earnings']
  const rank = (r: Aligned) => {
    const pin = PINNED.indexOf(r.label.trim().toLowerCase())
    if (r.cls === 'equity' && pin >= 0) return { tier: 2 + pin, code: '', name: '' }
    const code = [...r.codes].sort()[0]
    return code ? { tier: 0, code, name: r.label.toLowerCase() } : { tier: 1, code: '', name: r.label.toLowerCase() }
  }
  const byClass = (cls: BsClass): PlacedBsLine[] =>
    [...aligned.values()]
      .filter((r) => r.cls === cls)
      .sort((x, y) => {
        const rx = rank(x)
        const ry = rank(y)
        if (rx.tier !== ry.tier) return rx.tier - ry.tier
        if (rx.code !== ry.code) return rx.code < ry.code ? -1 : 1
        return rx.name < ry.name ? -1 : rx.name > ry.name ? 1 : 0
      })
      .map((r) => ({ label: r.label, current: cents(r.current), prior: hasPrior ? cents(r.prior) : null }))

  const { rows, balances } = flatClassSheet(
    { asset: byClass('asset'), liability: byClass('liability'), equity: byClass('equity') },
    { hasPrior },
  )

  return {
    ok: true,
    data: {
      business_id: input.businessId,
      report_date: current,
      compare: input.compare,
      current_label: balanceSheetColumnLabel(current),
      prior_label: balanceSheetColumnLabel(prior),
      rows,
      balances,
      consolidation: {
        organisations: orgs.map((o) => ({ name: o.name, currency: currencyOf(o) })),
        // The sheet's first note is which organisations it added, because
        // nothing else on the page names them and a group that loses one
        // prints every total short with no mark of it: IICT Group Pty Ltd
        // stopped being a connection on 10 September, and the sheet would
        // have gone on printing Net Assets 646,151 light, balanced and
        // silent. The payload has carried `organisations` since this page was
        // written and no surface read it. A foreign organisation's currency
        // is named here too, so the FX note below has something to attach to.
        notes: [
          `Added together: ${listOf(orgs.map((o) => (currencyOf(o) === PRESENTATION ? o.name : `${o.name} (${currencyOf(o)})`)))}.`,
          ...notes,
          ...fxNotes,
        ],
        warnings,
      },
    },
  }
}

// ─── IAS 21 equity for a foreign organisation ───────────────────────────────

interface EquityPart {
  label: string
  value: number
  from?: MirrorBsRow
}

/**
 * A foreign organisation's equity in presentation currency on each printed
 * date — the parts before the Currency Translation Difference, which the
 * caller adds as what they leave against net assets.
 *
 * On each date, with the financial year opening the day `openingBalanceDate`
 * names:
 *   - Retained Earnings: its Retained Earnings and Current Year Earnings as
 *     they stood when the year opened, at that day's closing rate. Together,
 *     because an organisation keeps its own year: IICT Group Limited closes in
 *     March, so its Xero "Current Year Earnings" at 31 August (HK$7,471,759)
 *     is April to August, not the group's July to August (IICT-47).
 *   - Current Earnings: each month's movement in those two accounts at that
 *     month's average rate — the year's profit as the P&L pages translate it.
 *     A year-end roll of one into the other moves both and nets to nothing.
 *   - every other equity account (Dividends Paid, share capital): its balance
 *     when the year opened at the opening rate, and each month's movement at
 *     that month's average.
 *
 * Every month-end from the opening on must be in the mirror, with the rates.
 * When one is not, the organisation's equity is translated at the closing rate
 * instead — what can be proved — and the note says what was missing.
 */
function translateForeignEquity(args: {
  org: ConsolidatedBsOrganisation
  pair: string
  dates: string[]
  fiscalYearStart: number
  /** Whether the mirror holds the organisation's balance sheet at a date (an organisation can have no equity yet). */
  hasSheet: (date: string) => boolean
  /** Its equity accounts at a date, each in equity's sign. */
  equity: (date: string) => MirrorBsRow[]
  closing: Map<string, number>
  average: Map<string, number>
}): { parts: Record<string, EquityPart[]>; note: string } {
  const { org, pair, dates, fiscalYearStart, hasSheet, equity: sheet, closing, average } = args
  const currency = pair.split('/')[0]
  const isEarnings = (r: MirrorBsRow) =>
    isCurrentYearEarnings(r.account_name, r.account_id.trim().toLowerCase()) || r.account_name.trim().toLowerCase() === 'retained earnings'

  const plan = dates.map((d) => {
    const opening = openingBalanceDate(d.slice(0, 7), fiscalYearStart)
    return { d, opening, months: monthEndsAfter(opening, d) }
  })

  // What stops the walk, first thing first.
  let blocker: string | null = null
  for (const p of plan) {
    if (blocker) break
    if (!closing.has(`${pair}@${p.opening}`)) blocker = `no ${pair} closing rate is stored for ${dayLabel(p.opening)}`
    else if (!hasSheet(p.opening)) blocker = `no balance sheet has been synced for it at ${dayLabel(p.opening)}`
    for (const m of p.months) {
      if (blocker) break
      if (!average.has(`${pair}@${m.slice(0, 7)}`)) blocker = `no ${pair} average rate is stored for ${balanceSheetColumnLabel(m)}`
      else if (!hasSheet(m)) blocker = `no balance sheet has been synced for it at ${dayLabel(m)}`
    }
  }

  const parts: Record<string, EquityPart[]> = {}
  if (blocker) {
    for (const d of dates) {
      const rate = closing.get(`${pair}@${d}`)!
      parts[d] = sheet(d).map((r) => ({
        label: isCurrentYearEarnings(r.account_name, r.account_id.trim().toLowerCase()) ? 'Current Earnings' : r.account_name,
        value: num(r.balance) * rate,
        from: r,
      }))
    }
    return {
      parts,
      note:
        `${org.name} reports in ${currency} and is translated at the closing rate on each date, equity included ` +
        `(${dates.map((d) => `${balanceSheetColumnLabel(d)} ${rateText(closing.get(`${pair}@${d}`)!)}`).join('; ')}): ` +
        `${blocker}, so its equity cannot be split into this year's earnings and a translation difference.`,
    }
  }

  for (const p of plan) {
    const out: EquityPart[] = []
    const openRate = closing.get(`${pair}@${p.opening}`)!
    const at = (date: string) => new Map(sheet(date).map((r) => [r.account_id.trim().toLowerCase(), r]))
    const openRows = at(p.opening)

    const earningsAt = (rowsById: Map<string, MirrorBsRow>) =>
      [...rowsById.values()].filter(isEarnings).reduce((s, r) => s + num(r.balance), 0)
    out.push({ label: 'Retained Earnings', value: earningsAt(openRows) * openRate })

    let currentEarnings = 0
    const others = new Map<string, { value: number; from: MirrorBsRow }>()
    for (const r of openRows.values()) {
      if (!isEarnings(r)) others.set(r.account_id.trim().toLowerCase(), { value: num(r.balance) * openRate, from: r })
    }
    let before = openRows
    for (const m of p.months) {
      const rate = average.get(`${pair}@${m.slice(0, 7)}`)!
      const now = at(m)
      currentEarnings += (earningsAt(now) - earningsAt(before)) * rate
      // Xero leaves an account at nil off the sheet, so absent is 0.
      for (const id of new Set([...before.keys(), ...now.keys()])) {
        const row = now.get(id) ?? before.get(id)!
        if (isEarnings(row)) continue
        const moved = num(now.get(id)?.balance) - num(before.get(id)?.balance)
        const entry = others.get(id) ?? { value: 0, from: row }
        entry.value += moved * rate
        entry.from = now.get(id) ?? entry.from
        others.set(id, entry)
      }
      before = now
    }
    out.push({ label: 'Current Earnings', value: currentEarnings })
    for (const { value, from } of others.values()) out.push({ label: from.account_name, value, from })
    parts[p.d] = out
  }

  const openings = [...new Map(plan.map((p) => [p.opening, p])).values()]
  return {
    parts,
    note:
      `${org.name} reports in ${currency}. Its assets and liabilities are translated at the closing rate on each date ` +
      `(${dates.map((d) => `${balanceSheetColumnLabel(d)} ${rateText(closing.get(`${pair}@${d}`)!)}`).join('; ')}); ` +
      `its equity at the rate when the financial year began (${openings.map((p) => `${dayLabel(p.opening)} ${rateText(closing.get(`${pair}@${p.opening}`)!)}`).join('; ')}), ` +
      `with each month's movement at that month's average rate. The Currency Translation Difference is what that leaves. ` +
      `Rates from before the year began are not stored, so earlier years' equity is carried at the year's opening rate.`,
  }
}
