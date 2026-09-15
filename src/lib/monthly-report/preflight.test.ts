/**
 * WF.2 — the fourteen checks.
 *
 * Contract pins: fourteen rows EVERY run (a check that can't run says 'skip'
 * with a reason, never disappears); the P&L structure check catches an NP
 * that drifts off the bucket derivation; a FINAL report with unreconciled
 * transactions is a FAIL (the one dishonest state the pack must never ship).
 */
import { describe, it, expect } from 'vitest'
import { runPreflight, overallStatus, exportRefusals, consolidatedForPreflight, type PreflightInputs } from './preflight'
import type { GeneratedReport } from '@/app/finances/monthly-report/types'

function baseReport(overrides: Partial<GeneratedReport> = {}): GeneratedReport {
  return {
    business_id: 'biz-1',
    report_month: '2026-07',
    fiscal_year: 2027,
    settings: {} as any,
    sections: [
      {
        category: 'Revenue',
        lines: [
          { account_name: 'Sales', actual: 60_000 } as any,
          { account_name: 'Services', actual: 40_000 } as any,
        ],
        subtotal: { account_name: 'Total Revenue', actual: 100_000 } as any,
      },
    ],
    summary: {
      revenue: { actual: 100_000, budget: 90_000, variance: 10_000, variance_percent: 11 },
      cogs: { actual: 30_000, budget: 30_000, variance: 0, variance_percent: 0 },
      gross_profit: { actual: 70_000, budget: 60_000, variance: 10_000, gp_percent: 70 },
      opex: { actual: 20_000, budget: 20_000, variance: 0, variance_percent: 0 },
      net_profit: { actual: 50_000, budget: 40_000, variance: 10_000, np_percent: 50 },
    },
    gross_profit_row: {} as any,
    net_profit_row: {} as any,
    is_draft: false,
    unreconciled_count: 0,
    has_budget: true,
    ...overrides,
  }
}

const byKey = (inputs: PreflightInputs) => {
  const results = runPreflight(inputs)
  return { results, get: (k: string) => results.find((r) => r.key === k)! }
}

describe('WF.2 — eighteen rows, always', () => {
  it('a bare run still renders every check (absences are skips, not gaps)', () => {
    const { results } = byKey({ report: baseReport() })
    expect(results).toHaveLength(18)
    expect(results.find((r) => r.key === 'cash_model_ties')?.status).toBe('skip')
    const skips = results.filter((r) => r.status === 'skip').map((r) => r.key)
    expect(skips).toContain('freshness')
    expect(skips).toContain('payroll_ties')
    expect(skips).toContain('external_ties')
    expect(skips).toContain('cash_continuity')
    // Every skip explains itself.
    for (const r of results) {
      if (r.status === 'skip') expect(r.detail.length).toBeGreaterThan(10)
    }
  })
})

describe('WF.2 — the load-bearing checks', () => {
  it('P&L structure: passes when NP equals the bucket derivation', () => {
    expect(byKey({ report: baseReport() }).get('pl_structure').status).toBe('pass')
  })

  it('P&L structure: FAILS when NP drifts off the derivation', () => {
    const report = baseReport()
    report.summary.net_profit.actual = 47_000 // buckets say 50,000
    expect(byKey({ report }).get('pl_structure').status).toBe('fail')
  })

  it('sections foot: FAILS when a subtotal differs from its lines', () => {
    const report = baseReport()
    report.sections[0].subtotal.actual = 99_000 // lines sum to 100,000
    expect(byKey({ report }).get('summary_foots').status).toBe('fail')
  })

  it('draft state: FINAL with unreconciled transactions is the dishonest state — FAIL', () => {
    const report = baseReport({ is_draft: false, unreconciled_count: 4 })
    expect(byKey({ report }).get('draft_state').status).toBe('fail')
  })

  it('draft state: a provisional export is a warn, a clean final a pass', () => {
    expect(byKey({ report: baseReport({ is_draft: true }) }).get('draft_state').status).toBe('warn')
    expect(byKey({ report: baseReport() }).get('draft_state').status).toBe('pass')
  })

  it('month data: all-zero actuals FAIL (sync never reached the month)', () => {
    const report = baseReport()
    report.summary.revenue.actual = 0
    report.summary.cogs.actual = 0
    report.summary.opex.actual = 0
    report.summary.net_profit.actual = 0
    expect(byKey({ report }).get('month_data').status).toBe('fail')
  })

  it('external ties: a drifting series is named', () => {
    const { get } = byKey({
      report: baseReport(),
      externalMetrics: [
        {
          display_name: 'Clinic Income (Lumary)',
          tie: { comparable: true, within_tolerance: false } as any,
        } as any,
      ],
    })
    const r = get('external_ties')
    expect(r.status).toBe('warn')
    expect(r.detail).toContain('Clinic Income (Lumary)')
  })

  it('cash continuity mirrors the money-flow verdict', () => {
    const mf = (residual: number, comparable = true): any => ({
      comparable, continuity_residual: residual, reason: 'x',
      period_month: '2026-07', prior_month: '2026-06',
      bank: { start: 0, end: 0, delta: 0 }, sources: [], uses: [],
      summary: null, earnings_movement: 0, unlisted_movement: 0,
    })
    expect(byKey({ report: baseReport(), moneyFlow: mf(0) }).get('cash_continuity').status).toBe('pass')
    expect(byKey({ report: baseReport(), moneyFlow: mf(12.5) }).get('cash_continuity').status).toBe('fail')
    expect(byKey({ report: baseReport(), moneyFlow: mf(0, false) }).get('cash_continuity').status).toBe('skip')
  })

  it('cash continuity warns, as the page does, when the P&L surplus is not the balance sheet\'s earnings', () => {
    // The balance sheet's own identity holds to the cent (residual 0), but the
    // page's last line is built from the P&L surplus. A posting straight to
    // retained earnings leaves the two $1,200 apart, and the page prints a note
    // saying it misses the bank — preflight must not call that an exact pass.
    const flow: any = {
      comparable: true, continuity_residual: 0, period_month: '2026-08', prior_month: '2026-07',
      bank: { start: 100000, end: 105000, delta: 5000 },
      sources: [{ label: 'Trade Creditors', opening: 0, closing: 2000, amount: 2000 }],
      uses: [{ label: 'Trade Debtors', opening: 0, closing: 1000, amount: 1000 }],
      earnings_movement: 4000, unlisted_movement: 0,
      summary: { income: 20000, cost_of_sales: 0, expense: 14800, other_income: 0, other_expense: 0, surplus: 5200 },
      bank_accounts: [], unmatched_bank_account_ids: [], non_asset_bank_accounts: [],
    }
    const r = byKey({ report: baseReport(), moneyFlow: flow }).get('cash_continuity')
    expect(r.status).toBe('warn')
    expect(r.detail).toBe(
      'Surplus + Came From - Spent is 6,200, which misses the bank movement of 5,000 by 1,200: ' +
        "the month's profit on the income statement and on the balance sheet differ by that much.",
    )
    // Under a dollar apart the page prints no note, and preflight still passes.
    const close = { ...flow, summary: { ...flow.summary, surplus: 4000.4 } }
    expect(byKey({ report: baseReport(), moneyFlow: close }).get('cash_continuity').status).toBe('pass')
  })

  it('commentary coverage: bare triggered accounts are named', () => {
    const { get } = byKey({
      report: baseReport(),
      triggeredAccounts: ['Rent', 'Insurance'],
      commentary: { Rent: { coach_note: 'lease renewal' } },
    })
    const r = get('commentary')
    expect(r.status).toBe('warn')
    expect(r.detail).toContain('Insurance')
  })

  it('commentary coverage: an account a page lists because it moved, with nothing to print, is named with its amount', () => {
    // Calxa's COGS page lists every account that moved. Rugs was never drafted
    // and has no note, so the page leaves it off — the coach must hear that.
    const report = baseReport({
      sections: [
        ...baseReport().sections,
        {
          category: 'Cost of Sales',
          lines: [{ account_name: 'Rugs', actual: 326.48 } as any, { account_name: 'Art Supplies', actual: 116.92 } as any],
          subtotal: { account_name: 'Total Cost of Sales', actual: 443.4 } as any,
        },
      ],
    })
    const r = byKey({
      report,
      triggeredAccounts: [],
      activityAccounts: ['Rugs', 'Art Supplies'],
      commentary: { 'Art Supplies': { draft_note: 'Ebay ($80), Amazon ($37)' } },
    }).get('commentary')
    expect(r.status).toBe('warn')
    expect(r.detail).toContain('Rugs moved $326 and has no commentary')
    expect(r.detail).not.toContain('Art Supplies')

    const covered = byKey({
      report,
      triggeredAccounts: [],
      activityAccounts: ['Rugs', 'Art Supplies'],
      commentary: { Rugs: { coach_note: 'Sample rug.' }, 'Art Supplies': { draft_note: 'Ebay ($80), Amazon ($37)' } },
    }).get('commentary')
    expect(covered.status).toBe('pass')
  })

  it('commentary coverage: a commentary setting the pack could not read is named', () => {
    const r = byKey({
      report: baseReport(),
      triggeredAccounts: [],
      commentarySettingsProblems: ['w-cogs placement "separate-page": expected one of inline, separate_page, none'],
    }).get('commentary')
    expect(r.status).toBe('warn')
    expect(r.detail).toContain('separate-page')
  })
})

describe('WF.1 — overall verdict precedence', () => {
  it('fail > warn > pass; skips never decide', () => {
    expect(overallStatus([
      { key: 'a', label: '', status: 'pass', detail: '' },
      { key: 'b', label: '', status: 'skip', detail: '' },
    ])).toBe('pass')
    expect(overallStatus([
      { key: 'a', label: '', status: 'warn', detail: '' },
      { key: 'b', label: '', status: 'pass', detail: '' },
    ])).toBe('warn')
    expect(overallStatus([
      { key: 'a', label: '', status: 'warn', detail: '' },
      { key: 'b', label: '', status: 'fail', detail: '' },
    ])).toBe('fail')
  })
})

describe('WF.2 additions — super rate, commentary reconciles; WF.4 provenance', () => {
  it('super rate: stale override warns with both rates named; default passes', () => {
    const stale = byKey({ report: baseReport(), budgetSuperRate: 0.115 }).get('super_rate')
    expect(stale.status).toBe('warn')
    expect(stale.detail).toContain('11.5%')
    expect(stale.detail).toContain('12.0%')
    expect(byKey({ report: baseReport(), budgetSuperRate: null }).get('super_rate').status).toBe('pass')
    expect(byKey({ report: baseReport(), budgetSuperRate: 0.12 }).get('super_rate').status).toBe('pass')
    expect(byKey({ report: baseReport() }).get('super_rate').status).toBe('skip')
  })

  it('commentary reconciles: vendors summing PAST the account actual warn by name', () => {
    const inputs = {
      report: baseReport(),
      commentary: {
        Sales: { coach_note: 'x', vendor_summary: [{ vendor: 'A', amount: 90_000 }, { vendor: 'B', amount: 20_000 }] },
        Services: { coach_note: 'y', vendor_summary: [{ vendor: 'C', amount: 10_000 }] },
      },
    }
    const r = byKey(inputs).get('commentary_reconciles')
    expect(r.status).toBe('warn')
    expect(r.detail).toContain('Sales') // 110k quoted vs 60k actual
    expect(r.detail).not.toContain('Services') // 10k vs 40k — fine
  })

  it('commentary reconciles: within-total drill-downs pass; none → skip', () => {
    const ok = byKey({
      report: baseReport(),
      commentary: { Sales: { vendor_summary: [{ vendor: 'A', amount: 50_000 }] } },
    }).get('commentary_reconciles')
    expect(ok.status).toBe('pass')
    expect(byKey({ report: baseReport(), commentary: {} }).get('commentary_reconciles').status).toBe('skip')
  })

  it('budget provenance (WF.4): a back-filled month warns; a planned month passes', () => {
    const backfilled = byKey({ report: baseReport(), budgetActualEndMonth: '2026-07' }).get('budget_provenance')
    expect(backfilled.status).toBe('warn')
    expect(backfilled.detail).toContain('back-filled')
    const planned = byKey({ report: baseReport(), budgetActualEndMonth: '2026-06' }).get('budget_provenance')
    expect(planned.status).toBe('pass')
    expect(byKey({ report: baseReport() }).get('budget_provenance').status).toBe('skip')
  })

  it('freshness maps the quality union honestly; a failed probe is could-not-check', () => {
    expect(byKey({ report: baseReport(), dataQualityLevel: 'verified' }).get('freshness').status).toBe('pass')
    expect(byKey({ report: baseReport(), dataQualityLevel: 'partial' }).get('freshness').status).toBe('warn')
    expect(byKey({ report: baseReport(), dataQualityLevel: 'stale' }).get('freshness').status).toBe('fail')
    expect(byKey({ report: baseReport(), dataQualityLevel: 'verified', qualityCheckFailed: true }).get('freshness').status).toBe('warn')
  })
})

describe('reconciliation check — a failed check can never pass as clean (FLEET-04 in preflight)', () => {
  const failedRecon = {
    unreconciled_count: 0,
    unreconciled_total: 0,
    has_more: false,
    bank_accounts: [],
    is_clean: false,
    check_failed: true,
    failure_reason: 'Could not check 2 of 3 connected Xero organisations: IICT HK, IICT Aust.',
  } as any

  it('check_failed with a ZERO count warns with the failure reason — never "all reconciled"', () => {
    const { get } = byKey({ report: baseReport(), reconciliation: failedRecon })
    const row = get('reconciliation')
    expect(row.status).toBe('warn')
    expect(row.detail).toContain('could not be verified')
    expect(row.detail).toContain('IICT HK')
  })

  it('a clean successful check passes with the recorded-transactions caveat', () => {
    const cleanRecon = { ...failedRecon, is_clean: true, check_failed: false, failure_reason: undefined }
    const { get } = byKey({ report: baseReport(), reconciliation: cleanRecon })
    const row = get('reconciliation')
    expect(row.status).toBe('pass')
    expect(row.detail).toContain('recorded transactions')
    expect(row.detail).toContain('not visible')
  })
})

describe('exchange rates refuse a consolidated export (IICT-04)', () => {
  // IICT Group, August 2026: no HKD/AUD rate stored after May. The route's
  // list, confined to the fiscal year (IICT-62), holds Jul, Aug and Sep — Sep
  // being Xero's month in progress, which the August pack does not print.
  const iict = {
    diagnostics: { tenants_loaded: 3, tenants_missing_currency: [] as string[] },
    fx_context: {
      rates_used: {},
      missing_rates: [
        { currency_pair: 'HKD/AUD', period: '2026-07' },
        { currency_pair: 'HKD/AUD', period: '2026-08' },
        { currency_pair: 'HKD/AUD', period: '2026-09' },
      ],
    },
  }
  // Generated with the rates stored; the per-entity report beside it is what
  // these tests vary.
  const august = () => baseReport({ report_month: '2026-08', is_consolidation: true, consolidation_fx: { missing_rates: [] } })

  it('reads the rates off fx_context — the diagnostics alone passed "FX rates complete"', () => {
    const before = byKey({ report: august(), consolidated: iict.diagnostics }).get('entity_sum')
    expect(before.status).toBe('pass')
    const row = byKey({ report: august(), consolidated: consolidatedForPreflight(iict) }).get('entity_sum')
    expect(row.status).toBe('fail')
    expect(row.blocks).toBe(true)
  })

  it('names exactly the months the August pack prints from', () => {
    const { results, get } = byKey({ report: august(), consolidated: consolidatedForPreflight(iict) })
    const row = get('entity_sum')
    expect(row.detail).toContain('Export refused — no HKD/AUD exchange rate is stored for Jul 2026 and Aug 2026')
    expect(row.detail).not.toContain('Sep 2026')
    expect(exportRefusals(results)).toEqual([row])
  })

  it('a June 2026 pack with no June rate is refused naming June', () => {
    const june = { ...iict, fx_context: { rates_used: {}, missing_rates: [{ currency_pair: 'HKD/AUD', period: '2026-06' }] } }
    const row = byKey({ report: baseReport({ report_month: '2026-06', is_consolidation: true }), consolidated: consolidatedForPreflight(june) }).get('entity_sum')
    expect(row.blocks).toBe(true)
    expect(row.detail).toContain('Jun 2026')
  })

  it('once the rates are stored it passes and refuses nothing', () => {
    const loaded = { ...iict, fx_context: { rates_used: { 'HKD/AUD::2026-08': 0.179536 }, missing_rates: [{ currency_pair: 'HKD/AUD', period: '2026-09' }] } }
    const { results, get } = byKey({ report: august(), consolidated: consolidatedForPreflight(loaded) })
    expect(get('entity_sum').status).toBe('pass')
    expect(exportRefusals(results)).toEqual([])
  })

  it('a single-entity business is still a skip, and no other failure blocks (warning-only house style)', () => {
    const { results, get } = byKey({ report: baseReport({ is_draft: false, unreconciled_count: 3 }) })
    expect(get('entity_sum').status).toBe('skip')
    expect(get('draft_state').status).toBe('fail')
    expect(exportRefusals(results)).toEqual([])
  })
})

describe('the rates checked are the rates of the figures being exported', () => {
  const missing = (...periods: string[]) => periods.map((period) => ({ currency_pair: 'HKD/AUD', period }))
  const iictVm = (missingRates: Array<{ currency_pair: string; period: string }>) => ({
    business: { presentation_currency: 'AUD' },
    byTenant: [{ functional_currency: 'AUD' }, { functional_currency: 'HKD' }, { functional_currency: 'AUD' }],
    diagnostics: { tenants_loaded: 3, tenants_missing_currency: [] as string[] },
    fx_context: { rates_used: {}, missing_rates: missingRates },
  })
  const dragonVm = () => ({
    business: { presentation_currency: 'AUD' },
    byTenant: [{ functional_currency: 'AUD' }, { functional_currency: 'AUD' }],
    diagnostics: { tenants_loaded: 2, tenants_missing_currency: [] as string[] },
    fx_context: { rates_used: {}, missing_rates: [] },
  })

  it('an August report with no August rate is refused, though the per-entity report held from July had every rate it needed', () => {
    // The page opened on July (rate stored), the coach moved to August (none)
    // and generated. The July consolidated report lists no missing month —
    // the route confines it to July's months — and used to pass the export.
    const report = baseReport({ report_month: '2026-08', is_consolidation: true, consolidation_fx: { missing_rates: missing('2026-08') } })
    const { results, get } = byKey({ report, consolidated: consolidatedForPreflight(iictVm([])) })
    expect(get('entity_sum').status).toBe('fail')
    expect(get('entity_sum').detail).toContain('no HKD/AUD exchange rate is stored for Aug 2026')
    expect(exportRefusals(results)).toHaveLength(1)
  })

  it('a client exporting a consolidated report generated with its rates is not refused — no per-entity report is loaded for a client', () => {
    // Dragon Roofing's owner: the consolidated route is coach-only, so the
    // export never loads the per-entity report, and "generate again" is a 403.
    const report = baseReport({ report_month: '2026-08', is_consolidation: true, consolidation_fx: { missing_rates: [] } })
    const { results, get } = byKey({ report, consolidated: null })
    expect(get('entity_sum').status).toBe('pass')
    expect(exportRefusals(results)).toEqual([])
  })

  it('a client exporting a consolidated report generated with a month missing its rate is still refused', () => {
    const report = baseReport({ report_month: '2026-08', is_consolidation: true, consolidation_fx: { missing_rates: missing('2026-07', '2026-08', '2026-09') } })
    const { results, get } = byKey({ report, consolidated: null })
    expect(get('entity_sum').detail).toContain('Jul 2026 and Aug 2026')
    expect(get('entity_sum').detail).not.toContain('Sep 2026')
    expect(exportRefusals(results)).toHaveLength(1)
  })

  describe('a report saved before it recorded its rates', () => {
    const legacy = () => baseReport({ report_month: '2026-08', is_consolidation: true })

    it('Dragon Roofing (every organisation in AUD) exports as before, with or without the per-entity report', () => {
      expect(exportRefusals(runPreflight({ report: legacy(), consolidated: null, foreignCurrencies: [] }))).toEqual([])
      expect(exportRefusals(runPreflight({ report: legacy(), consolidated: consolidatedForPreflight(dragonVm()) }))).toEqual([])
    })

    it('IICT (an HKD organisation) is refused until it is generated again — today’s rates do not vouch for figures built before them', () => {
      const withVm = byKey({ report: legacy(), consolidated: consolidatedForPreflight(iictVm([])) }).get('entity_sum')
      expect(withVm.status).toBe('fail')
      expect(withVm.blocks).toBe(true)
      expect(withVm.detail).toContain('generated again')
      const client = byKey({ report: legacy(), consolidated: null, foreignCurrencies: ['HKD'] }).get('entity_sum')
      expect(client.blocks).toBe(true)
      expect(client.detail).toContain('HKD')
    })

    it('when the currencies could not be read either, it says so and does not refuse', () => {
      const { results, get } = byKey({ report: legacy(), consolidated: null, foreignCurrencies: null })
      expect(get('entity_sum').status).toBe('warn')
      expect(get('entity_sum').detail).toContain('could not be checked')
      expect(exportRefusals(results)).toEqual([])
    })
  })
})

describe('a refused v1 cashflow is a warning, not the v2 failure', () => {
  it('says the cash pages print a reason, without claiming a cash model is on', () => {
    const row = byKey({
      report: baseReport(),
      cashflowReason: 'This business has more than one Xero organisation, and the cashflow cannot yet be built for more than one.',
      cashflowReasonModel: 'v1',
    }).get('cash_model_ties')
    expect(row.status).toBe('warn')
    expect(row.detail).toContain('print a reason instead of figures')
    expect(row.detail).not.toContain('cash model is on')
  })

  it('a v2 refusal is still a failure', () => {
    expect(byKey({ report: baseReport(), cashflowReason: 'x' }).get('cash_model_ties').status).toBe('fail')
  })
})
