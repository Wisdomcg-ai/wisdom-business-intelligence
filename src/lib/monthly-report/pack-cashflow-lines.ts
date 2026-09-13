/**
 * The P&L the pack's cashflow page is built from: actuals to the end of the
 * reporting period, the budget for the rest of the year.
 *
 * The cashflow page used to project EVERY month of the fiscal year from the
 * forecast, including months already banked. Urban Road's August pack showed
 * July's Canvas Sales at $371,142 on the cashflow page and $337,402 on the
 * income page — the same month, in the same pack, two figures, because one was
 * a projection of a month that had already happened.
 *
 * The engine needs no change to fix this. `getMonthValue` already prefers a
 * line's `actual_months` entry over its `forecast_months` one, month by month;
 * the forecast simply had no actuals in it, having been seeded from the Xero
 * budget. So the fix is to compose the input rather than to alter the
 * arithmetic: real actuals in `actual_months` for the elapsed months, the
 * approved budget in `forecast_months` for the rest.
 *
 * The source is the Full Year report, which the pack already loads and which
 * already carries — per account, per month — the actual, the forecast and the
 * approved budget, reconciled against the statement pages a reader will compare
 * this page to. Deriving them a second time from Xero would be a second answer
 * waiting to disagree with the first.
 */

import type { FullYearReport } from '@/app/finances/monthly-report/types'
import type { CashflowAssumptions, PLLine } from '@/app/finances/forecast/types'
import type { OpeningBank } from './opening-bank'

export interface PackCashflowLines {
  lines: PLLine[]
  /** Months taken from actuals, oldest first. */
  actualMonths: string[]
  /** Months taken from the budget, oldest first. */
  budgetMonths: string[]
  /**
   * True when every budget month came from the APPROVED budget. False when any
   * fell back to the forecast — the page says which, because "budget" and
   * "forecast" are different promises and a reader is entitled to know whose
   * numbers these are.
   */
  approvedThroughout: boolean
}

const EMPTY: PackCashflowLines = {
  lines: [], actualMonths: [], budgetMonths: [], approvedThroughout: false,
}

/**
 * @param report         the Full Year report, already loaded for the pack
 * @param lastActualMonth the report's own month — every month at or before it
 *                        is an actual, every month after it is budget
 */
export function buildPackCashflowLines(
  report: FullYearReport | null | undefined,
  lastActualMonth: string,
): PackCashflowLines {
  const sections = report?.sections ?? []
  if (sections.length === 0 || !lastActualMonth) return EMPTY

  const actualMonths = new Set<string>()
  const budgetMonths = new Set<string>()
  let approvedThroughout = true
  const lines: PLLine[] = []

  for (const section of sections) {
    for (const line of section.lines ?? []) {
      const actual_months: Record<string, number> = {}
      const forecast_months: Record<string, number> = {}

      for (const md of line.months ?? []) {
        if (!md?.month) continue
        if (md.month <= lastActualMonth) {
          // A banked month is what it is. Zero is a real figure here — the
          // account genuinely moved nothing — so it is written, not skipped:
          // `getMonthValue` treats a MISSING key as "no actual" and falls
          // through to the forecast, which would put a projection back into a
          // month that has already happened.
          actual_months[md.month] = md.actual ?? 0
          actualMonths.add(md.month)
        } else {
          // The approved budget is the yardstick the rest of the pack is held
          // to; the forecast is the fallback for a client who has no approved
          // budget, and is recorded as such rather than passed off as one.
          if (md.approved_budget === null || md.approved_budget === undefined) {
            approvedThroughout = false
            forecast_months[md.month] = md.budget ?? 0
          } else {
            forecast_months[md.month] = md.approved_budget
          }
          budgetMonths.add(md.month)
        }
      }

      lines.push({
        account_name: line.account_name,
        category: line.category,
        actual_months,
        forecast_months,
      } as PLLine)
    }
  }

  if (lines.length === 0) return EMPTY

  return {
    lines,
    actualMonths: [...actualMonths].sort(),
    budgetMonths: [...budgetMonths].sort(),
    // Vacuously true with no budget months at all would be a lie by omission:
    // a page with nothing forecast has nothing to say about whose numbers
    // the forecast used.
    approvedThroughout: budgetMonths.size > 0 && approvedThroughout,
  }
}

/**
 * The opening balances the pack's cashflow runs from.
 *
 * Bank comes from the balance sheet on the day before the year starts. Every
 * OTHER opening balance is zeroed, deliberately.
 *
 * `/finances/cashflow` auto-syncs balances from Xero the first time it opens on
 * a forecast with none set, and saves them — for Urban Road, opening debtors
 * ~$267k, creditors ~$479k (misfiled), GST ~$28k, super ~$1.3k. The pack
 * merges those saved assumptions. The engine collects opening debtors and pays
 * opening creditors in the first month, and remits the ATO balances on their
 * schedule: right for a projection, wrong here, because the pack's early months
 * are built from the ACTUAL accrual P&L. The engine turns that P&L into cash
 * with its DSO/DPO timing — it does not read the cash actually received — so
 * the June debtors and creditors are already represented in the timing spill
 * of the months that follow. Adding the opening balances on top overlaps with
 * it. (Not a claim that the actuals are cash: they are not, which is also why
 * this page's closing balances will not tie to the bank to the dollar.) The ATO rows are no better a
 * signal: GST $31,515, GST adjustments −$3,080, ATO Creditors −$48,970 and
 * PAYG $16,674 net to about −$3,861 — nothing actually owed.
 *
 * Every other saved setting (DSO, DPO, GST registration, loans) is kept; only
 * the balances this page would double count are overridden.
 *
 * `balance_date` records the verdict: the date the bank was read at, or ''
 * when it could not be read. That is the forecast module's own "balances never
 * read" test (`opening_bank_balance === 0 && !balance_date`), and it means a
 * date saved by an earlier sync can never vouch for a balance this page did
 * not read.
 */
export function applyPackOpening(
  assumptions: CashflowAssumptions,
  opening: OpeningBank,
  /**
   * The engine's first month (`forecast.actual_start_month`). A balance only
   * opens the month straight after the day it was read: the forecast is picked
   * by the clock (`getForecastFiscalYear`), so in planning season it can be next
   * year's, and 30 June 2026 printed over a row starting July 2027 would be a
   * real figure in the wrong place. A mismatch is treated as unavailable.
   */
  firstMonth?: string,
): CashflowAssumptions {
  const usable = opening.status === 'read' &&
    (!firstMonth || firstMonth === monthAfter(opening.asAt))
    ? opening
    : null
  return {
    ...assumptions,
    // Unavailable stays at 0 — the engine needs a number — and the basis line
    // says so, rather than letting the result pass for a real balance.
    opening_bank_balance: usable ? usable.amount : 0,
    balance_date: usable ? usable.asAt : '',
    opening_trade_debtors: 0,
    opening_trade_creditors: 0,
    opening_gst_liability: 0,
    opening_payg_wh_liability: 0,
    opening_payg_instalment_liability: 0,
    opening_super_liability: 0,
  }
}

/** 'YYYY-MM-DD' → the 'YYYY-MM' that follows its month. */
function monthAfter(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** A read opening bank balance, or the explicit fact that it could not be read. */
export type PackOpening = { amount: number; asAt: string } | 'unavailable'

/**
 * What the basis line should say about the opening, read back off assumptions
 * `applyPackOpening` produced. Undefined when there is no cashflow at all.
 */
export function packOpeningFromAssumptions(
  assumptions: CashflowAssumptions | null | undefined,
): PackOpening | undefined {
  if (!assumptions) return undefined
  return assumptions.balance_date
    ? { amount: assumptions.opening_bank_balance, asAt: assumptions.balance_date }
    : 'unavailable'
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM-DD' → '30 Jun 2026', by string, so no timezone can move the day. */
function fmtBalanceDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d || m > 12) return iso
  return `${d} ${MONTH_ABBR[m - 1]} ${y}`
}

/** Whole dollars; an overdrawn opening keeps its sign. */
function fmtDollars(amount: number): string {
  const rounded = Math.round(amount)
  const body = `$${Math.abs(rounded).toLocaleString('en-AU')}`
  return rounded < 0 ? `-${body}` : body
}

/**
 * The sentence the page prints under its title, so a reader knows what the
 * balances start from, and which half of the row is history and which a plan.
 *
 * @param opening omit when there is no opening to describe. 'unavailable' is
 *   printed as such: a projection that starts from $0 looks exactly like one
 *   that starts from a real balance.
 */
export function packCashflowBasis(
  built: PackCashflowLines,
  fmtMonth: (m: string) => string,
  opening?: PackOpening,
): string | null {
  const hasMonths = built.actualMonths.length > 0 || built.budgetMonths.length > 0
  // The opening is stated even when there are no months to describe. That is
  // the fallback path — no Full Year report, so the page runs on the
  // forecast's own lines — and it is exactly where an unreadable opening would
  // otherwise print nothing and let a $0-based projection pass for a real one.
  if (!hasMonths && !opening) return null
  const parts: string[] = []
  if (opening === 'unavailable') {
    parts.push('Opening bank balance unavailable — balances start from $0')
  } else if (opening) {
    parts.push(`Opening bank ${fmtDollars(opening.amount)} at ${fmtBalanceDate(opening.asAt)}`)
  }
  if (built.actualMonths.length > 0) {
    const first = built.actualMonths[0]
    const last = built.actualMonths[built.actualMonths.length - 1]
    parts.push(first === last
      ? `Actuals for ${fmtMonth(first)}`
      : `Actuals ${fmtMonth(first)} to ${fmtMonth(last)}`)
  }
  if (built.budgetMonths.length > 0) {
    const first = built.budgetMonths[0]
    const last = built.budgetMonths[built.budgetMonths.length - 1]
    const source = built.approvedThroughout ? 'approved budget' : 'forecast'
    parts.push(first === last
      ? `${source} for ${fmtMonth(first)}`
      : `${source} ${fmtMonth(first)} to ${fmtMonth(last)}`)
  }
  return parts.join(' · ')
}
