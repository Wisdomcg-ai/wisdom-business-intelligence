/**
 * WF.2 — the pre-flight checks: assert, then send.
 *
 * Runs over EXACTLY the data going into the PDF (the shared eager loader's
 * output plus the generated report), so a pass means the pack in hand was
 * checked — not some other fetch at some other moment.
 *
 * Statuses: pass | warn | fail | skip. Skip is honest absence ("no external
 * series configured"), never a silent pass — the fourteen checks render as
 * fourteen rows every time, and a check that can't run says why. Warnings
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
import { netProfitFromBuckets } from '@/lib/finance/net-profit'

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
  /** data_quality verdict from the read-path probe, when available. */
  dataQuality?: { level?: string; stale?: boolean; detail?: string } | null
  /** Commentary entries keyed by account (to check trigger coverage). */
  commentary?: Record<string, { coach_note?: string }> | null
  /** Accounts that fired commentary triggers this month. */
  triggeredAccounts?: string[] | null
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function runPreflight(inputs: PreflightInputs): PreflightResult[] {
  const { report } = inputs
  const results: PreflightResult[] = []
  const push = (key: string, label: string, status: PreflightStatus, detail: string) =>
    results.push({ key, label, status, detail })

  // 1. Freshness — the read-path quality probe.
  if (inputs.dataQuality == null) {
    push('freshness', 'Data freshness', 'skip', 'No data-quality verdict available for this run.')
  } else if (inputs.dataQuality.stale || inputs.dataQuality.level === 'stale' || inputs.dataQuality.level === 'failed') {
    push('freshness', 'Data freshness', 'fail', inputs.dataQuality.detail || 'The sync data behind this report is stale.')
  } else {
    push('freshness', 'Data freshness', 'pass', 'Sync data is current.')
  }

  // 2. Reconciliation — the gate's own numbers.
  if (inputs.reconciliation == null) {
    push('reconciliation', 'Bank reconciliation', 'skip', 'Reconciliation was not checked this run.')
  } else if ((report.unreconciled_count ?? 0) > 0 || inputs.reconciliation.unreconciled_count > 0) {
    const n = Math.max(report.unreconciled_count ?? 0, inputs.reconciliation.unreconciled_count)
    push('reconciliation', 'Bank reconciliation', 'warn', `${n} unreconciled transaction${n === 1 ? '' : 's'} — the pack is stamped PROVISIONAL.`)
  } else {
    push('reconciliation', 'Bank reconciliation', 'pass', 'All transactions reconciled.')
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
    } else if (Math.abs(mf.continuity_residual) <= 0.01) {
      push('cash_continuity', 'Cash continuity', 'pass', 'Sources − uses equals the bank movement exactly.')
    } else {
      push('cash_continuity', 'Cash continuity', 'fail', `Funds flow misses the bank movement by $${Math.abs(mf.continuity_residual)}.`)
    }
  }

  // 12. Commentary coverage — every triggered account has words.
  {
    const triggered = inputs.triggeredAccounts ?? null
    if (triggered == null) {
      push('commentary', 'Commentary coverage', 'skip', 'Trigger list not available this run.')
    } else if (triggered.length === 0) {
      push('commentary', 'Commentary coverage', 'pass', 'No variance triggers fired this month.')
    } else {
      const bare = triggered.filter(a => !(inputs.commentary?.[a]?.coach_note ?? '').trim())
      if (bare.length === 0) {
        push('commentary', 'Commentary coverage', 'pass', `All ${triggered.length} triggered accounts have commentary.`)
      } else {
        push('commentary', 'Commentary coverage', 'warn', `${bare.length} triggered account${bare.length === 1 ? '' : 's'} (${bare.slice(0, 3).join(', ')}${bare.length > 3 ? '…' : ''}) have no coach note.`)
      }
    }
  }

  // 13. Draft state honesty — a final pack must have a clean gate.
  {
    if (!report.is_draft && (report.unreconciled_count ?? 0) > 0) {
      push('draft_state', 'Draft state', 'fail', `Report is marked FINAL with ${report.unreconciled_count} unreconciled transactions.`)
    } else if (report.is_draft) {
      push('draft_state', 'Draft state', 'warn', 'Exporting a PROVISIONAL pack (watermarked on every page).')
    } else {
      push('draft_state', 'Draft state', 'pass', 'Final, with a clean reconciliation gate.')
    }
  }

  // 14. Month coverage — the report's month actually carries data.
  {
    const total = Math.abs(report.summary.revenue.actual) + Math.abs(report.summary.opex.actual) + Math.abs(report.summary.cogs.actual)
    if (total > 0) {
      push('month_data', 'Month has data', 'pass', 'The report month carries actuals.')
    } else {
      push('month_data', 'Month has data', 'fail', 'Every actual in the month is zero — has the sync reached this month?')
    }
  }

  return results
}

export function overallStatus(results: PreflightResult[]): 'pass' | 'warn' | 'fail' {
  if (results.some(r => r.status === 'fail')) return 'fail'
  if (results.some(r => r.status === 'warn')) return 'warn'
  return 'pass'
}
