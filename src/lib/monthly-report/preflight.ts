/**
 * WF.2 + WF.4 — the pre-flight checks: assert, then send.
 *
 * Runs over EXACTLY the data going into the PDF (the shared eager loader's
 * output plus the generated report), so a pass means the pack in hand was
 * checked — not some other fetch at some other moment.
 *
 * Statuses: pass | warn | fail | skip. Skip is honest absence ("no external
 * series configured"), never a silent pass — every check renders as a row
 * every time, and a check that can't run says why. Warnings
 * and failures never BLOCK an export (warning-only house style — the coach
 * decides); they inform, and the run is persisted either way.
 *
 * Pure — the panel and the persistence route both consume this.
 */
import type {
  GeneratedReport,
  WagesDetailData,
  SubscriptionDetailData,
  ExternalMetricSeriesData,
  ReconciliationStatus,
} from '@/app/finances/monthly-report/types'
import type { MoneyFlow } from '@/lib/monthly-report/money-flow'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { UNEXPLAINED_LABEL, UNEXPLAINED_MATERIALITY } from '@/lib/monthly-report/pack-cash-actuals'
import { moneyFlowProof } from '@/lib/monthly-report/money-flow-rows'
import { netProfitFromBuckets } from '@/lib/finance/net-profit'
import { SUPERANNUATION } from '@/app/finances/forecast/constants'
import { standingLineClaims } from '@/app/finances/monthly-report/services/commentary-placement'

export type PreflightStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface PreflightResult {
  key: string
  label: string
  status: PreflightStatus
  detail: string
}

export interface PreflightInputs {
  report: GeneratedReport
  reconciliation?: ReconciliationStatus | null
  wagesDetail?: WagesDetailData | null
  subscriptionDetail?: SubscriptionDetailData | null
  externalMetrics?: ExternalMetricSeriesData[] | null
  moneyFlow?: MoneyFlow | null
  /** From the consolidated diagnostics, when the business is a parent. */
  consolidated?: {
    tenants_loaded: number
    tenants_missing_currency?: string[]
    missing_rates?: Array<{ currency_pair: string; period: string }>
  } | null
  unmappedCount?: number
  /** Read-path data-quality verdict (D-44.2 probe). undefined = not threaded. */
  dataQualityLevel?: 'verified' | 'partial' | 'failed' | 'no_sync' | 'stale' | null
  /** True when the quality probe itself failed — could-not-check, not clean. */
  qualityCheckFailed?: boolean
  /** Commentary entries keyed by account (coverage + reconciliation checks). */
  commentary?: Record<string, {
    coach_note?: string
    draft_note?: string
    draft_warnings?: string[]
    vendor_summary?: Array<{ vendor: string; amount: number }>
  }> | null
  /** Accounts that fired commentary triggers this month. */
  triggeredAccounts?: string[] | null
  /**
   * Accounts a page lists only because they moved (a placement with coverage
   * all_with_activity — Calxa's COGS page). No trigger fired on them, so the
   * triggered check never names them; a page that leaves one off for want of
   * text has to be named here.
   */
  activityAccounts?: string[] | null
  /** The layout's commentary settings the pack could not read, one line each. */
  commentarySettingsProblems?: string[] | null
  /** The cashflow going into the pack — checked only when it is cash model v2. */
  cashflow?: CashflowForecastData | null
  /**
   * Why a cash-model-v2 business has no cashflow (the reason its cash pages
   * print). Set only when v2 is on: without it a refused model read as
   * 'skip', the same as a client that never turned v2 on.
   */
  cashflowReason?: string | null
  /** The budget forecast's superannuation_rate (null = unset → statutory default). */
  budgetSuperRate?: number | null
  /** The budget forecast's actual_end_month ('YYYY-MM') — months at or before
   *  it carry a budget BACK-FILLED from actuals, not a plan (WF.4). */
  budgetActualEndMonth?: string | null
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function runPreflight(inputs: PreflightInputs): PreflightResult[] {
  const { report } = inputs
  const results: PreflightResult[] = []
  const push = (key: string, label: string, status: PreflightStatus, detail: string) =>
    results.push({ key, label, status, detail })

  // 1. Freshness — the read-path quality probe (D-44.2).
  if (inputs.qualityCheckFailed) {
    push('freshness', 'Data freshness', 'warn', "The freshness check itself couldn't run — treat the data age as unverified.")
  } else if (inputs.dataQualityLevel == null) {
    push('freshness', 'Data freshness', 'skip', 'No data-quality verdict available for this run.')
  } else if (inputs.dataQualityLevel === 'verified') {
    push('freshness', 'Data freshness', 'pass', 'Sync data is current and verified.')
  } else if (inputs.dataQualityLevel === 'partial') {
    push('freshness', 'Data freshness', 'warn', 'Sync data is partial — some tenants or months may be behind.')
  } else {
    push('freshness', 'Data freshness', 'fail', `Sync data is ${inputs.dataQualityLevel.replace('_', ' ')} — the numbers behind this pack are not current.`)
  }

  // 2. Reconciliation — the gate's own numbers. The label says "recorded
  // transactions" deliberately: uncoded bank-feed statement lines (Xero's
  // reconcile badge) are invisible to this count.
  if (inputs.reconciliation == null) {
    push('reconciliation', 'Bank reconciliation (recorded transactions)', 'skip', 'Reconciliation was not checked this run.')
  } else if (inputs.reconciliation.check_failed) {
    // FLEET-04 semantics must hold HERE too: a failed check with a zero count
    // (no connection, every org erroring) previously passed as "all
    // reconciled" — a failure can never read as a clean bill of health.
    push(
      'reconciliation',
      'Bank reconciliation (recorded transactions)',
      'warn',
      `Reconciliation could not be verified — ${inputs.reconciliation.failure_reason ?? 'one or more Xero organisations could not be checked'}`,
    )
  } else if ((report.unreconciled_count ?? 0) > 0 || inputs.reconciliation.unreconciled_count > 0) {
    const n = Math.max(report.unreconciled_count ?? 0, inputs.reconciliation.unreconciled_count)
    push('reconciliation', 'Bank reconciliation (recorded transactions)', 'warn', `${n} unreconciled recorded transaction${n === 1 ? '' : 's'} — the cover says so.`)
  } else {
    push('reconciliation', 'Bank reconciliation (recorded transactions)', 'pass', 'All recorded transactions reconciled. Uncoded bank-feed lines are not visible to this check.')
  }

  // 3. Budget present.
  if (report.has_budget) {
    push('budget', 'Budget present', 'pass', `Budget loaded${report.budget_forecast_name ? ` (${report.budget_forecast_name})` : ''}.`)
  } else {
    push('budget', 'Budget present', 'warn', 'No budget — variance columns are actuals-only.')
  }

  // 4. P&L structure — NP must equal the bucket derivation to the cent.
  {
    const s = report.summary
    const expected = netProfitFromBuckets({
      revenue: s.revenue.actual,
      cogs: s.cogs.actual,
      opex: s.opex.actual,
      otherIncome: s.other_income?.actual ?? 0,
      otherExpense: s.other_expenses?.actual ?? 0,
    })
    const diff = r2(expected - s.net_profit.actual)
    if (Math.abs(diff) <= 0.01) {
      push('pl_structure', 'P&L structure', 'pass', 'Net Profit equals Revenue − COGS − OpEx + Other Income − Other Expenses.')
    } else {
      push('pl_structure', 'P&L structure', 'fail', `Net Profit is off the bucket derivation by ${diff}.`)
    }
  }

  // 5. Summary foots — section lines sum to their subtotals.
  {
    let worst = 0
    for (const sec of report.sections) {
      const lineSum = sec.lines.reduce((s, l) => s + l.actual, 0)
      worst = Math.max(worst, Math.abs(r2(lineSum - sec.subtotal.actual)))
    }
    if (worst <= 0.02) {
      push('summary_foots', 'Sections foot', 'pass', 'Every section subtotal equals the sum of its lines.')
    } else {
      push('summary_foots', 'Sections foot', 'fail', `A section subtotal differs from its lines by up to $${worst}.`)
    }
  }

  // 6. No unmapped accounts.
  if (inputs.unmappedCount == null) {
    push('unmapped', 'Account mapping', 'skip', 'Unmapped-account count not available this run.')
  } else if (inputs.unmappedCount > 0) {
    push('unmapped', 'Account mapping', 'warn', `${inputs.unmappedCount} unmapped account${inputs.unmappedCount === 1 ? '' : 's'} — their amounts fall into default categories.`)
  } else {
    push('unmapped', 'Account mapping', 'pass', 'Every account is mapped.')
  }

  // 7. Entity sum — consolidation diagnostics (parents only).
  if (inputs.consolidated == null) {
    push('entity_sum', 'Entity consolidation', 'skip', 'Single-entity business.')
  } else {
    const missingCcy = inputs.consolidated.tenants_missing_currency ?? []
    const missingRates = inputs.consolidated.missing_rates ?? []
    if (missingCcy.length > 0) {
      push('entity_sum', 'Entity consolidation', 'fail', `${missingCcy.length} entity(ies) missing a functional currency — figures may be summed 1:1 across currencies.`)
    } else if (missingRates.length > 0) {
      push('entity_sum', 'Entity consolidation', 'warn', `${missingRates.length} FX rate(s) missing — affected months translate at no rate.`)
    } else {
      push('entity_sum', 'Entity consolidation', 'pass', `${inputs.consolidated.tenants_loaded} entities consolidated; FX rates complete.`)
    }
  }

  // 8. Payroll ties (PAY-TIES).
  {
    const ties = inputs.wagesDetail?.ties
    if (!inputs.wagesDetail) {
      push('payroll_ties', 'Payroll ties', 'skip', 'No wages detail in this pack.')
    } else if (!ties || ties.comparable === false) {
      push('payroll_ties', 'Payroll ties', 'skip', 'Payroll tie not comparable this month (missing side).')
    } else if (ties.within_tolerance) {
      push('payroll_ties', 'Payroll ties', 'pass', 'Employee payslips tie to the wages accounts.')
    } else {
      push('payroll_ties', 'Payroll ties', 'warn', `Payslips differ from the wages accounts by $${Math.abs(r2(ties.delta ?? 0))}.`)
    }
  }

  // 9. Subscriptions tie — vendor rows vs their account totals.
  {
    const sub = inputs.subscriptionDetail
    if (!sub) {
      push('subscriptions_tie', 'Subscriptions tie', 'skip', 'No subscription detail in this pack.')
    } else {
      let worst = 0
      for (const acc of sub.accounts ?? []) {
        const vendorSum = (acc.vendors ?? []).reduce((s: number, v: any) => s + (v.actual ?? 0), 0)
        worst = Math.max(worst, Math.abs(r2(vendorSum - (acc.total_actual ?? 0))))
      }
      if (worst <= 1) {
        push('subscriptions_tie', 'Subscriptions tie', 'pass', 'Vendor rows tie to their account totals.')
      } else {
        push('subscriptions_tie', 'Subscriptions tie', 'warn', `Vendor rows differ from an account total by up to $${worst}.`)
      }
    }
  }

  // 10. External ties (EXT-TIES).
  {
    const series = (inputs.externalMetrics ?? []).filter(s => s.tie != null)
    const comparable = series.filter(s => s.tie!.comparable)
    if ((inputs.externalMetrics ?? []).length === 0) {
      push('external_ties', 'External data ties', 'skip', 'No external data series in this pack.')
    } else if (comparable.length === 0) {
      push('external_ties', 'External data ties', 'skip', 'No external series has a comparable tie this month.')
    } else {
      const breaks = comparable.filter(s => !s.tie!.within_tolerance)
      if (breaks.length === 0) {
        push('external_ties', 'External data ties', 'pass', `${comparable.length} series tie to their Xero accounts.`)
      } else {
        push('external_ties', 'External data ties', 'warn', `${breaks.map(s => s.display_name).join(', ')} drift from the named Xero account.`)
      }
    }
  }

  // 11. Cash continuity (CASH-CONT) — the money-flow identity.
  {
    const mf = inputs.moneyFlow
    if (!mf) {
      push('cash_continuity', 'Cash continuity', 'skip', 'Money-flow derivation not available this run.')
    } else if (!mf.comparable) {
      push('cash_continuity', 'Cash continuity', 'skip', mf.reason ?? 'Money flow not comparable this month.')
    } else if (Math.abs(mf.continuity_residual) > 0.01) {
      push('cash_continuity', 'Cash continuity', 'fail', `Funds flow misses the bank movement by $${Math.abs(mf.continuity_residual)}.`)
    } else {
      // The balance sheet's identity holds, but the page proves itself with the
      // P&L surplus. When the two reports disagree about the month's profit the
      // page prints a note saying it misses the bank; say the same here, not
      // "exactly".
      const { gapNote } = moneyFlowProof(mf)
      if (gapNote) {
        push('cash_continuity', 'Cash continuity', 'warn', gapNote)
      } else {
        push('cash_continuity', 'Cash continuity', 'pass', 'Earnings + came from − spent equals the bank movement exactly.')
      }
    }
  }

  // 12. Commentary coverage — every triggered account has words; every account
  // a page lists because it moved has something to print; and every commentary
  // setting on the layout was read (an unreadable one prints the default block).
  {
    const triggered = inputs.triggeredAccounts ?? null
    const extra: string[] = []

    const lineByAccount = new Map<string, (typeof report.sections)[number]['lines'][number]>()
    for (const sec of report.sections) for (const l of sec.lines) lineByAccount.set(l.account_name, l)
    const standing = report.settings?.standing_commentary ?? []
    const silent = (inputs.activityAccounts ?? []).filter((account) => {
      const e = inputs.commentary?.[account]
      if ((e?.coach_note ?? '').trim() || (e?.draft_note ?? '').trim() || (e?.draft_warnings?.length ?? 0) > 0) return false
      // A standing line that speaks for the account prints in its place.
      return !standing.some((s) => standingLineClaims(s, lineByAccount.get(account) ?? { account_name: account }))
    })
    if (silent.length > 0) {
      const named = silent.slice(0, 3).map((a) => `${a} moved $${Math.round(Math.abs(lineByAccount.get(a)?.actual ?? 0)).toLocaleString('en-AU')} and has no commentary`)
      extra.push(`${named.join('; ')}${silent.length > 3 ? `; and ${silent.length - 3} more` : ''} — the page that lists every account that moved will leave ${silent.length === 1 ? 'it' : 'them'} off.`)
    }
    const problems = inputs.commentarySettingsProblems ?? []
    if (problems.length > 0) {
      extra.push(`${problems.length} commentary setting${problems.length === 1 ? '' : 's'} could not be read, so the default block prints: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? '…' : ''}.`)
    }

    if (triggered == null && extra.length === 0) {
      push('commentary', 'Commentary coverage', 'skip', 'Trigger list not available this run.')
    } else {
      const bare = (triggered ?? []).filter(a => !(inputs.commentary?.[a]?.coach_note ?? '').trim())
      if (bare.length > 0) {
        extra.unshift(`${bare.length} triggered account${bare.length === 1 ? '' : 's'} (${bare.slice(0, 3).join(', ')}${bare.length > 3 ? '…' : ''}) have no coach note.`)
      }
      if (extra.length > 0) {
        push('commentary', 'Commentary coverage', 'warn', extra.join(' '))
      } else if (triggered == null || triggered.length === 0) {
        push('commentary', 'Commentary coverage', 'pass', 'No variance triggers fired this month.')
      } else {
        push('commentary', 'Commentary coverage', 'pass', `All ${triggered.length} triggered accounts have commentary.`)
      }
    }
  }

  // 13. Commentary reconciles — the vendor amounts quoted in commentary must
  // not exceed what the account actually spent (a top-N vendor list summing
  // PAST the account total means the drill-down and the statement disagree).
  {
    const entries = Object.entries(inputs.commentary ?? {}).filter(
      ([, e]) => (e.vendor_summary ?? []).length > 0,
    )
    if (inputs.commentary == null) {
      push('commentary_reconciles', 'Commentary reconciles', 'skip', 'Commentary not available this run.')
    } else if (entries.length === 0) {
      push('commentary_reconciles', 'Commentary reconciles', 'skip', 'No vendor drill-downs in commentary this month.')
    } else {
      const actualByAccount = new Map<string, number>()
      for (const sec of report.sections) {
        for (const l of sec.lines) actualByAccount.set(l.account_name, l.actual)
      }
      const overs: string[] = []
      let comparable = 0
      for (const [account, e] of entries) {
        const actual = actualByAccount.get(account)
        if (actual === undefined) continue
        comparable++
        const vendorSum = (e.vendor_summary ?? []).reduce((sum, v) => sum + (v.amount ?? 0), 0)
        if (vendorSum > Math.abs(actual) + 1) overs.push(account)
      }
      if (comparable === 0) {
        push('commentary_reconciles', 'Commentary reconciles', 'skip', 'No commentary account matches a statement line this month.')
      } else if (overs.length === 0) {
        push('commentary_reconciles', 'Commentary reconciles', 'pass', `Vendor drill-downs stay within their account totals (${comparable} checked).`)
      } else {
        push('commentary_reconciles', 'Commentary reconciles', 'warn', `${overs.slice(0, 3).join(', ')}${overs.length > 3 ? '\u2026' : ''}: quoted vendors sum past the account's actual.`)
      }
    }
  }

  // 14. Super rate — the statutory SG rate moves; a forecast carrying an old
  // override quietly misprices every payroll month.
  {
    if (inputs.budgetSuperRate === undefined || !report.has_budget) {
      push('super_rate', 'Super rate', 'skip', report.has_budget ? 'Budget super rate not available this run.' : 'No budget in this pack.')
    } else if (inputs.budgetSuperRate === null || Math.abs(inputs.budgetSuperRate - SUPERANNUATION.DEFAULT_RATE) < 0.0001) {
      push('super_rate', 'Super rate', 'pass', `Budget uses the current statutory rate (${(SUPERANNUATION.DEFAULT_RATE * 100).toFixed(1)}%).`)
    } else {
      push('super_rate', 'Super rate', 'warn', `Budget carries ${(inputs.budgetSuperRate * 100).toFixed(1)}% super vs the statutory ${(SUPERANNUATION.DEFAULT_RATE * 100).toFixed(1)}% — payroll months are mispriced.`)
    }
  }

  // 15. Budget provenance (WF.4) — a month at or before the forecast's
  // actual_end_month carries a budget BACK-FILLED from actuals, so a ~0%
  // variance is an echo, not performance.
  {
    if (inputs.budgetActualEndMonth === undefined || !report.has_budget) {
      push('budget_provenance', 'Budget provenance', 'skip', report.has_budget ? 'Budget provenance not available this run.' : 'No budget in this pack.')
    } else if (inputs.budgetActualEndMonth !== null && report.report_month <= inputs.budgetActualEndMonth) {
      push('budget_provenance', 'Budget provenance', 'warn', `This month's budget was back-filled from actuals (forecast actuals run to ${inputs.budgetActualEndMonth}) — variances are an echo, not performance. The cover says so.`)
    } else {
      push('budget_provenance', 'Budget provenance', 'pass', 'The budget for this month was planned, not back-filled.')
    }
  }

  // 16. Draft state honesty — a final pack must have a clean gate.
  {
    if (!report.is_draft && (report.unreconciled_count ?? 0) > 0) {
      push('draft_state', 'Draft state', 'fail', `Report is marked FINAL with ${report.unreconciled_count} unreconciled transactions.`)
    } else if (report.is_draft) {
      push('draft_state', 'Draft state', 'warn', 'Exporting a draft pack — the cover says so in one line.')
    } else {
      push('draft_state', 'Draft state', 'pass', 'Final, with a clean reconciliation gate.')
    }
  }

  // 17. Month coverage — the report's month actually carries data.
  {
    const total = Math.abs(report.summary.revenue.actual) + Math.abs(report.summary.opex.actual) + Math.abs(report.summary.cogs.actual)
    if (total > 0) {
      push('month_data', 'Month has data', 'pass', 'The report month carries actuals.')
    } else {
      push('month_data', 'Month has data', 'fail', 'Every actual in the month is zero — has the sync reached this month?')
    }
  }

  // 18. Cash model ties — v2's actual months are the bank's cash, so they must
  // add to the bank movement to the cent, the report month's column must be
  // the money-flow page's "How this Affected Our Bank" total, and the budget
  // must open on the bank the actuals close on.
  {
    const cf = inputs.cashflow
    if (!cf && inputs.cashflowReason) {
      push('cash_model_ties', 'Cashflow ties to the bank', 'fail', `The cash model is on but could not be built, so the cash pages print a reason instead: ${inputs.cashflowReason.replace(/\.$/, '')}.`)
    } else if (!cf?.cash_model) {
      push('cash_model_ties', 'Cashflow ties to the bank', 'skip', 'The cashflow is not on cash model v2 — its banked months are estimated, not tied.')
    } else {
      const problems: string[] = []
      const actual = cf.months.filter((m) => m.source === 'actual')
      for (const m of actual) {
        const delta = r2(m.bank_at_end - m.bank_at_beginning)
        // On the ROWS, not on net_movement: net_movement is built as the rows
        // plus an "Unexplained difference" row of whatever size makes it the
        // bank's figure, so comparing it with the bank could never fail. The
        // bank at each end is the balance-sheet mirror's; the rows are what
        // the page says moved it.
        const rows = r2(m.cash_inflows - m.cash_outflows + m.movement_in_assets + m.movement_in_liabilities
          + (m.movement_in_equity ?? 0) + m.other_inflows)
        const explained = r2((m.unreconciled_lines ?? []).filter((l) => l.label !== UNEXPLAINED_LABEL).reduce((s, l) => s + l.value, 0))
        const unexplained = r2(delta - rows - explained)
        if (Math.abs(unexplained) >= UNEXPLAINED_MATERIALITY) {
          problems.push(`${m.monthLabel}'s rows add to ${r2(rows + explained)} against a bank movement of ${delta} — ${unexplained} Unexplained difference`)
        }
        if (Math.abs(r2(m.net_movement - delta)) > 0.01) {
          problems.push(`${m.monthLabel} moves ${m.net_movement} against a bank movement of ${delta}`)
        }
      }
      for (let i = 1; i < cf.months.length; i++) {
        if (Math.abs(r2(cf.months[i].bank_at_beginning - cf.months[i - 1].bank_at_end)) > 0.01) {
          problems.push(`${cf.months[i].monthLabel} does not open on ${cf.months[i - 1].monthLabel}'s closing bank`)
        }
      }
      const mf = inputs.moneyFlow
      const reportCol = cf.months.find((m) => m.month === cf.cash_model!.last_actual_month)
      if (mf?.comparable && reportCol && Math.abs(r2(reportCol.net_movement - mf.bank.delta)) > 0.01) {
        problems.push(`${reportCol.monthLabel}'s Net Movement ${reportCol.net_movement} is not the money-flow page's ${mf.bank.delta}`)
      }
      const drift = actual.flatMap((m) => (m.unreconciled_lines ?? []).filter((l) => Math.round(l.value) !== 0).map((l) => `${m.monthLabel}: ${l.label} ${l.value}`))
      if (problems.length > 0) {
        push('cash_model_ties', 'Cashflow ties to the bank', 'fail', problems.slice(0, 3).join('; ') + '.')
      } else if (drift.length > 0 || cf.cash_model.warnings.length > 0) {
        push('cash_model_ties', 'Cashflow ties to the bank', 'warn', [...drift, ...cf.cash_model.warnings].slice(0, 4).join('; ') + '.')
      } else {
        push('cash_model_ties', 'Cashflow ties to the bank', 'pass', `Every actual month adds to the bank movement to the cent, and ${reportCol?.monthLabel ?? 'the report month'} matches Where Did Our Money Go.`)
      }
    }
  }

  return results
}

export function overallStatus(results: PreflightResult[]): 'pass' | 'warn' | 'fail' {
  if (results.some(r => r.status === 'fail')) return 'fail'
  if (results.some(r => r.status === 'warn')) return 'warn'
  return 'pass'
}
