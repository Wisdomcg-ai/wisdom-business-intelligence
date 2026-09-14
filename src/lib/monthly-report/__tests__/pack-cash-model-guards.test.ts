/**
 * Cash model v2's guards, from the review of 14 Sep 2026: each case below was
 * probed on Urban Road's real ledger and printed a plausible page that was
 * wrong, with no refusal and no preflight fail.
 *
 *   - a mistyped account id silently opened the forecast on $0 of debtors
 *     (September receipts 180,933 against 459,361);
 *   - a config with PAYG accounts but no wages codes printed a $9,688 /
 *     $12,110 "Unexplained difference" that the preflight only warned about;
 *   - a monthly GST schedule paid each month's GST in the month it accrued;
 *   - the basis called a configured number "(from the ledger)";
 *   - ATO Creditors (BAS) or PAYG Payroll Tax Withheld could be in no
 *     forecast payment with nothing said.
 */
import { describe, it, expect } from 'vitest'
import { buildPackCashModel, openingGst, type CashModelInputs } from '../pack-cash-model'
import { parseCashModelConfig, type CashModelConfig } from '../cash-model-config'
import { deriveMoneyFlow } from '../money-flow'
import { deriveActualCashMonth, UNEXPLAINED_LABEL } from '../pack-cash-actuals'
import { payslipsByMonth, taxRateLookup } from '../pack-cash-model'
import { UR_ACCOUNT_IDS, UR_ACCOUNTS, UR_BANK_IDS, UR_BS_ROWS, UR_CREDIT_CARD_IDS, UR_PAY_RUNS, UR_PL_ROWS } from './urban-road-ledger-fixture'
import { urbanRoadCashModel } from './urban-road-cash-model-config'
import { urbanRoadFullYear } from './urban-road-full-year-fixture'

const inputs = (over: Partial<CashModelInputs> = {}): CashModelInputs => ({
  bsRows: UR_BS_ROWS,
  plRows: UR_PL_ROWS,
  accounts: UR_ACCOUNTS,
  payRuns: UR_PAY_RUNS,
  bankAccountIds: UR_BANK_IDS,
  creditCardAccountIds: UR_CREDIT_CARD_IDS,
  fiscalYearStart: 7,
  ...over,
})
const build = (config: CashModelConfig, over: Partial<CashModelInputs> = {}) =>
  buildPackCashModel({ fullYear: urbanRoadFullYear(), reportMonth: '2026-08', config, inputs: inputs(over) })
const calxa = (over: Partial<CashModelConfig> = {}) => urbanRoadCashModel({ dso_days: 19, dpo_days: 29, ...over })
const at = (model: ReturnType<typeof build>, month: string) => {
  if (model.status !== 'ready') throw new Error(model.reason)
  return model.cashflow.months.find((m) => m.month === month)!
}
const v = (lines: { label: string; value: number }[] | undefined, label: string) => lines?.find((l) => l.label === label)?.value ?? 0

describe('a configured account that is not on the balance sheet', () => {
  it('refuses, naming the setting and the id, rather than open the forecast on $0 of debtors', () => {
    const model = build(calxa({ debtors_account_ids: ['905e1394-typo'] }))
    expect(model.status).toBe('refused')
    if (model.status === 'refused') {
      expect(model.reason).toContain('debtors_account_ids')
      expect(model.reason).toContain('905e1394-typo')
    }
  })

  it('refuses for creditors, GST, PAYG, super and opening ATO accounts too', () => {
    const base = calxa()
    const cases: Array<[string, CashModelConfig]> = [
      ['creditors_account_ids', calxa({ creditors_account_ids: ['nope-1'] })],
      ['gst.account_ids', calxa({ gst: { ...base.gst, account_ids: [UR_ACCOUNT_IDS.gstCollectedPaid, 'nope-2'] } })],
      ['paygw.liability_account_ids', calxa({ paygw: { ...base.paygw, liability_account_ids: ['nope-3'] } })],
      ['super.payable_account_ids', calxa({ super: { ...base.super, payable_account_ids: ['nope-4'] } })],
      ['opening_ato_accounts', calxa({ opening_ato_accounts: [{ account_id: 'nope-5', pay: 'first_forecast_month' }] })],
    ]
    for (const [key, cfg] of cases) {
      const model = build(cfg)
      expect(model.status, key).toBe('refused')
      if (model.status === 'refused') expect(model.reason).toContain(key)
    }
  })

  it('an account in the chart of accounts that holds nothing at any month-end is a warning, not a refusal', () => {
    const base = calxa()
    const accounts = [...UR_ACCOUNTS, { xero_account_id: 'new-super-acct', account_code: '21400', account_name: 'Super Clearing', tax_type: 'BASEXCLUDED' }]
    const model = build(calxa({ super: { ...base.super, payable_account_ids: [UR_ACCOUNT_IDS.superPayable, 'new-super-acct'] } }), { accounts })
    expect(model.status).toBe('ready')
    if (model.status === 'ready') expect(model.warnings.some((w) => w.includes('Super Clearing') && w.includes('$0'))).toBe(true)
  })

  it('matches ids case-insensitively, as the money-flow page does', () => {
    expect(build(calxa({ debtors_account_ids: [UR_ACCOUNT_IDS.tradeDebtors.toUpperCase()] })).status).toBe('ready')
  })
})

describe('an actual month that does not add up is a refusal and a preflight fail, never a plug', () => {
  it('PAYG accounts with no wages codes is not a config that parses', () => {
    const { wages_codes: _w, ...noWages } = urbanRoadCashModel()
    expect(parseCashModelConfig(noWages).status).toBe('invalid')
    const empty = parseCashModelConfig(urbanRoadCashModel({ wages_codes: [] }))
    expect(empty.status).toBe('invalid')
    if (empty.status === 'invalid') expect(empty.reason).toContain('wages_codes')
  })

  it('a super payable account with no super expense codes is not a config that parses', () => {
    const base = urbanRoadCashModel()
    const parsed = parseCashModelConfig({ ...base, super: { ...base.super, expense_codes: [] } })
    expect(parsed.status).toBe('invalid')
    if (parsed.status === 'invalid') expect(parsed.reason).toContain('expense_codes')
  })

  it('payroll lists are required, not silently []: a client with no payroll says so explicitly', () => {
    const base = urbanRoadCashModel()
    const { super: _s, ...rest } = base
    const { payable_account_ids: _p, ...superNoPayable } = base.super
    expect(parseCashModelConfig({ ...rest, super: superNoPayable }).status).toBe('invalid')
    const noPayroll = parseCashModelConfig({
      ...base,
      wages_codes: [],
      paygw: { ...base.paygw, liability_account_ids: [] },
      super: { ...base.super, payable_account_ids: [], expense_codes: [] },
    })
    expect(noPayroll.status).toBe('on')
  })

  it('wages codes that book nothing this month do not take the payslip PAYG off the PAYG row', () => {
    // The probe: payslipTax came off the PAYG row while no wages row put it back.
    const cfg = urbanRoadCashModel({ wages_codes: ['99999'] })
    const flow = deriveMoneyFlow(UR_BS_ROWS, '2026-07', { bankAccountIds: UR_BANK_IDS, creditCardAccountIds: UR_CREDIT_CARD_IDS, plRows: UR_PL_ROWS })
    const labels = urbanRoadFullYear().sections.flatMap((s) => s.lines.map((l) => ({ account_code: l.account_code, account_name: l.account_name, group: l.group })))
    const cash = deriveActualCashMonth({
      flow, plRows: UR_PL_ROWS, labels, taxRate: taxRateLookup(UR_ACCOUNTS, cfg.gst.tax_rate_overrides),
      payslips: payslipsByMonth(UR_PAY_RUNS)['2026-07'], cfg,
    })
    expect(cash.unreconciled_lines?.find((l) => l.label === UNEXPLAINED_LABEL)).toBeUndefined()
    expect(cash.reconciliation.payg_separated).toBe(false)
    expect(cash.net_movement).toBe(31446.33)
  })

  it('one account named in two settings is not a config that parses', () => {
    const base = urbanRoadCashModel()
    const parsed = parseCashModelConfig({ ...base, debtors_account_ids: [UR_ACCOUNT_IDS.tradeDebtors, UR_ACCOUNT_IDS.gstCollectedPaid] })
    expect(parsed.status).toBe('invalid')
    if (parsed.status === 'invalid') expect(parsed.reason).toContain(UR_ACCOUNT_IDS.gstCollectedPaid)
  })

  it('the model refuses a month whose rows leave an unexplained difference past the balance sheets\' tolerance', () => {
    // Built past the parser (as a caller holding a CashModelConfig can): the
    // GST account's movement counted once as debtors and again as GST.
    const model = build(calxa({ debtors_account_ids: [UR_ACCOUNT_IDS.tradeDebtors, UR_ACCOUNT_IDS.gstCollectedPaid] }))
    expect(model.status).toBe('refused')
    if (model.status === 'refused') {
      expect(model.reason).toMatch(/^Jul 2026: /)
      expect(model.reason).toContain('do not add to the bank movement')
    }
  })

  it('preflight fails an Unexplained difference over a dollar, and does its arithmetic on the rows', async () => {
    const { runPreflight } = await import('../preflight')
    const report = { report_month: '2026-08', sections: [], summary: { revenue: { actual: 1 }, cogs: { actual: 0 }, opex: { actual: 0 }, net_profit: { actual: 1 } }, is_draft: true, has_budget: true } as never
    const moneyFlow = deriveMoneyFlow(UR_BS_ROWS, '2026-08', { bankAccountIds: UR_BANK_IDS, plRows: UR_PL_ROWS })
    const model = build(calxa())
    if (model.status !== 'ready') throw new Error(model.reason)
    const clean = { ...model.cashflow, cash_model: { ...model.cashflow.cash_model!, warnings: [] } }
    const check = (cashflow: unknown) => runPreflight({ report, moneyFlow, cashflow: cashflow as never }).find((r) => r.key === 'cash_model_ties')!

    // A plug row: net_movement still equals the bank delta, the rows do not.
    const plugged = {
      ...clean,
      months: clean.months.map((m, i) => (i === 0
        ? { ...m, unreconciled_lines: [{ label: UNEXPLAINED_LABEL, value: 9688.07 }], unreconciled_movement: 9688.07, movement_in_liabilities: m.movement_in_liabilities - 9688.07 }
        : m)),
    }
    expect(check(plugged)).toMatchObject({ status: 'fail', detail: expect.stringContaining('Unexplained difference') })

    // Rows that do not add to the bank, whatever net_movement claims.
    const rowsOff = { ...clean, months: clean.months.map((m, i) => (i === 1 ? { ...m, cash_inflows: m.cash_inflows + 250 } : m)) }
    expect(check(rowsOff).status).toBe('fail')
  })

  it('preflight fails a cash-model business whose cashflow was refused, instead of skipping', async () => {
    const { runPreflight } = await import('../preflight')
    const report = { report_month: '2026-08', sections: [], summary: { revenue: { actual: 1 }, cogs: { actual: 0 }, opex: { actual: 0 }, net_profit: { actual: 1 } }, is_draft: true, has_budget: true } as never
    const r = runPreflight({ report, cashflow: null, cashflowReason: 'the debtors account is not on the balance sheet' }).find((x) => x.key === 'cash_model_ties')!
    expect(r).toMatchObject({ status: 'fail', detail: expect.stringContaining('debtors account') })
  })
})

describe('a monthly activity statement is paid the month after', () => {
  it('"monthly" is not a GST or PAYG schedule the config accepts: it paid GST in the month it accrued', () => {
    const base = urbanRoadCashModel()
    expect(parseCashModelConfig({ ...base, gst: { ...base.gst, schedule: 'monthly' } }).status).toBe('invalid')
    expect(parseCashModelConfig({ ...base, paygw: { ...base.paygw, schedule: 'monthly' } }).status).toBe('invalid')
    expect(parseCashModelConfig({ ...base, gst: { ...base.gst, schedule: 'monthly_activity_statement' } }).status).toBe('on')
  })

  it('September pays August\'s GST only; October pays September\'s', () => {
    const base = calxa()
    const cfg = calxa({ gst: { ...base.gst, schedule: 'monthly_activity_statement' } })
    const g = openingGst(UR_BS_ROWS, '2026-08', cfg)
    if ('reason' in g) throw new Error(g.reason)
    expect(g.dueMonth).toBe('2026-09')
    expect(g.settledEnd).toBe('2026-07-31')
    const model = build(cfg)
    // September: the opening (August's movement) and nothing of September's own.
    expect(v(at(model, '2026-09').liability_lines, 'GST Collected & Paid')).toBeCloseTo(-g.amount, 2)
    // October: September's own GST, the 13,888.10 the quarterly run pays in November.
    expect(Math.abs(v(at(model, '2026-10').liability_lines, 'GST Collected & Paid') + 13888.1)).toBeLessThan(1)
  })
})

describe('the basis says where each figure came from', () => {
  it('a set number and a derived one are labelled each for what it is', () => {
    const model = build(calxa({ dpo_days: 'derived' }))
    if (model.status !== 'ready') throw new Error(model.reason)
    expect(model.basis).toContain('debtors 19 days (set), creditors 26 days (from the ledger)')
  })

  it('names the PAYG rate and its source, and when PAYG and super are paid', () => {
    const model = build(calxa())
    if (model.status !== 'ready') throw new Error(model.reason)
    expect(model.basis).toContain('wages net of PAYG at 23.06% (Aug 2026 payslips)')
    expect(model.basis).toContain('super each pay run')
  })
})

describe('an ATO balance in no forecast payment is said', () => {
  it('PAYG on 21390 leaves ATO Creditors (BAS) $10,741 unpaid: warned', () => {
    const base = calxa()
    const model = build(calxa({ paygw: { ...base.paygw, liability_account_ids: [UR_ACCOUNT_IDS.paygPayrollTaxWithheld] } }))
    if (model.status !== 'ready') throw new Error(model.reason)
    expect(model.warnings.some((w) => w.includes('ATO Creditors (BAS)') && w.includes('$10,741') && w.includes('no forecast payment'))).toBe(true)
  })

  it('PAYG on 21250 leaves PAYG Payroll Tax Withheld $16,674 unpaid: warned; excluded explicitly: not', () => {
    const warned = build(calxa())
    if (warned.status !== 'ready') throw new Error(warned.reason)
    expect(warned.warnings.some((w) => w.includes('PAYG Payroll Tax Withheld') && w.includes('$16,674'))).toBe(true)
    const excluded = build(calxa({ opening_ato_accounts: [{ account_id: UR_ACCOUNT_IDS.paygPayrollTaxWithheld, pay: 'excluded' }] }))
    if (excluded.status !== 'ready') throw new Error(excluded.reason)
    expect(excluded.warnings.some((w) => w.includes('PAYG Payroll Tax Withheld'))).toBe(false)
  })

  it('the June GST left over is broken down by account', () => {
    const model = build(calxa())
    if (model.status !== 'ready') throw new Error(model.reason)
    const w = model.warnings.find((x) => x.includes('at 30 Jun 2026'))!
    expect(w).toContain('GST Collected & Paid $31,515')
    expect(w).toContain('-$3,080')
  })
})

describe('cash-basis GST', () => {
  it('does not charge GST again on opening debtors and creditors the ledger GST account already holds', () => {
    const base = calxa()
    const cash = build(calxa({ gst: { ...base.gst, basis: 'cash' } }))
    if (cash.status !== 'ready') throw new Error(cash.reason)
    expect(cash.warnings.some((w) => w.includes('cash basis') && w.includes('opening debtors and creditors'))).toBe(true)
  })
})
