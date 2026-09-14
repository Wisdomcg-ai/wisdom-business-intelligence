/**
 * monthly_report_settings.cash_model — the per-business switch and settings
 * for the pack's cashflow model v2.
 *
 * WHY v2 EXISTS. Urban Road's August 2026 pack printed July and August as the
 * accrual P&L run through DSO/DPO timing — "cash timing estimated" — with the
 * first month's receipts a copy of its own sales standing in for the 30 June
 * debtors, GST guessed from account-name keywords and BAS in fixed months. The
 * bank on that page could not tie to anything. v2 prints the elapsed months as
 * the cash that actually moved (from the balance-sheet mirror, tied to the
 * cent to Where Did Our Money Go's bank movement) and the rest of the year
 * from the approved budget, timed on debtor and creditor days, with GST by
 * Xero tax type and the ATO and super paid on real schedules.
 *
 * WHY EVERYTHING IS A SETTING. Every figure in the forecast half rests on
 * facts about the client the ledger cannot answer — the GST reporting basis
 * (Xero's API does not expose it), whether a tax agent lodges the BAS, which
 * account Xero Payroll posts PAYG to (Urban Road's ATO Creditors 21250 moves
 * with every pay run while PAYG Payroll Tax Withheld 21390 has sat at $16,674
 * since May), when super is paid. The coach decides them; the code never picks.
 *
 * Strict: an unknown or misspelt key is a reason the page prints, never a
 * setting silently ignored (as the money-flow and subscription page configs).
 */
import { z } from 'zod'
import { SYSTEM_SCHEDULES, type BasePeriods } from '@/lib/cashflow/schedules'

/**
 * A list the coach must state, even as []. The first cut defaulted the
 * payroll lists to [] — so a cash_model with wages_codes simply left out
 * parsed as on, took the payslips' PAYG off the PAYG row with no wages row to
 * put it back, and printed Urban Road's July with a $9,688.07 "Unexplained
 * difference". A client with no payroll writes [] and means it.
 */
const statedList = z.array(z.string().trim().min(1))
const days = z.union([z.literal('derived'), z.number().finite().min(0).max(365)]).default('derived')

const configSchema = z.object({
  enabled: z.boolean(),
  /** Debtor days for the budget months: a number, or 'derived' from the ledger (deriveCashTerms). */
  dso_days: days,
  /** Creditor days for the budget months: a number, or 'derived'. */
  dpo_days: days,
  /** 'dpo' pays operating expenses on creditor days as Calxa does; 'accrual_month' in the month they accrue. */
  opex_timing: z.enum(['dpo', 'accrual_month']).default('dpo'),
  /**
   * Trade debtors and trade creditors, by Xero AccountID. Not in the design's
   * list: xero_accounts carries no SystemAccount, and finding "the" debtors
   * account by name ('Trade Debtors' here, 'Accounts Receivable' elsewhere) is
   * a guess this page would build every receipt on. Named, not guessed.
   */
  debtors_account_ids: z.array(z.string().trim().min(1)).min(1),
  creditors_account_ids: z.array(z.string().trim().min(1)).min(1),
  gst: z.object({
    basis: z.enum(['accrual', 'cash']),
    /**
     * 'monthly_activity_statement', never 'monthly': SYSTEM_SCHEDULES.monthly
     * is due the month it accrues, and a monthly BAS is due the month after.
     */
    schedule: z.enum(['quarterly_bas_au', 'quarterly_feb_may_aug_nov', 'monthly_activity_statement']),
    /**
     * The GST liability accounts (GST Collected & Paid, GST adjustments).
     * Required: an actual month grosses every line up by its tax type and
     * nets the GST back out against these accounts' movement. With none named
     * the GST would be counted in the receipts and never taken out again.
     */
    account_ids: z.array(z.string().trim().min(1)).min(1),
    /**
     * The GST owed at the report-month end that the first BAS pays:
     * 'quarter_to_date_movement' = the movement since the last period the
     * schedule has already settled; 'balance' = the whole balance.
     */
    opening: z.enum(['quarter_to_date_movement', 'balance']),
    /** Tax type → rate, for types the built-in table does not know (Urban Road's NZ Sales TAX003). */
    tax_rate_overrides: z.record(z.string(), z.number().finite().min(0).max(1)).default({}),
  }).strict(),
  paygw: z.object({
    /** The account Xero Payroll posts PAYG withheld to. */
    liability_account_ids: statedList,
    schedule: z.enum(['monthly_ias_quarterly_bas_agent', 'monthly_ias_quarterly_bas_self', 'quarterly_bas_au', 'quarterly_feb_may_aug_nov', 'monthly_activity_statement']),
    /** 'payslips' = tax ÷ wages on the latest actual month's pay runs; or a fixed rate. */
    rate: z.union([z.literal('payslips'), z.number().finite().min(0).max(1)]),
  }).strict(),
  super: z.object({
    payable_account_ids: statedList,
    /** The super expense account codes. */
    expense_codes: statedList,
    schedule: z.enum(['payday', 'monthly_arrears', 'quarterly_super_au']),
  }).strict(),
  /** The wages expense account codes (paid net of PAYG). */
  wages_codes: statedList,
  /** Other ATO balances at the report-month end: paid in the first forecast month, or left out. */
  opening_ato_accounts: z.array(z.object({
    account_id: z.string().trim().min(1),
    pay: z.enum(['first_forecast_month', 'excluded']),
  }).strict()).default([]),
}).strict().superRefine((cfg, ctx) => {
  // PAYG goes through its liability row only by coming OUT of the wages rows;
  // with no wages codes nothing puts it back and the month cannot tie.
  if (cfg.paygw.liability_account_ids.length > 0 && cfg.wages_codes.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['wages_codes'], message: 'PAYG liability accounts are set, so wages_codes must name the wages accounts PAYG is withheld from' })
  }
  // Likewise super paid through its payable account is taken out of the
  // super expense rows, which the expense codes name.
  if (cfg.super.payable_account_ids.length > 0 && cfg.super.expense_codes.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['super', 'expense_codes'], message: 'super payable accounts are set, so expense_codes must name the super expense accounts' })
  }
  // One account in two roles has its movement counted twice in an actual
  // month (as debtors AND as GST, say) and the rows stop adding to the bank.
  const seen = new Map<string, string>()
  const roles: Array<[string, readonly string[]]> = [
    ['debtors_account_ids', cfg.debtors_account_ids],
    ['creditors_account_ids', cfg.creditors_account_ids],
    ['gst.account_ids', cfg.gst.account_ids],
    ['paygw.liability_account_ids', cfg.paygw.liability_account_ids],
    ['super.payable_account_ids', cfg.super.payable_account_ids],
  ]
  for (const [role, ids] of roles) {
    for (const id of ids) {
      const key = id.trim().toLowerCase()
      const other = seen.get(key)
      if (other && other !== role) {
        ctx.addIssue({ code: 'custom', path: [role], message: `account ${id} is also in ${other} — an account can have one role` })
      }
      seen.set(key, other ?? role)
    }
  }
})

export type CashModelConfig = z.infer<typeof configSchema>

export type ParsedCashModelConfig =
  /** No cash_model, or enabled: false — the business prints v1, exactly as before. */
  | { status: 'off' }
  | { status: 'on'; config: CashModelConfig }
  /**
   * A cash_model that is on but cannot be read. Never a silent fall back to
   * v1: the coach turned v2 on, and a page quietly built the old way would
   * pass for the new one. The page prints the reason.
   */
  | { status: 'invalid'; reason: string }

export function parseCashModelConfig(raw: unknown): ParsedCashModelConfig {
  if (raw === null || raw === undefined) return { status: 'off' }
  if (typeof raw === 'object' && !Array.isArray(raw) && (raw as { enabled?: unknown }).enabled === false) {
    return { status: 'off' }
  }
  const result = configSchema.safeParse(raw)
  if (result.success) return result.data.enabled ? { status: 'on', config: result.data } : { status: 'off' }
  const reason = result.error.issues
    .slice(0, 3)
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
  return { status: 'invalid', reason: `The cash model settings could not be read (${reason}).` }
}

/** The BasePeriods for a schedule name the config allows. */
export function cashModelSchedule(name: string): BasePeriods {
  const periods = SYSTEM_SCHEDULES[name]
  if (!periods) throw new Error(`unknown schedule ${name}`)
  return periods
}

/**
 * GST rates by Xero's standard Australian tax types. A type not here and not
 * overridden is unknown — null — and the callers say so rather than guess:
 * Xero's TaxRates are not synced, and NZ Sales on TAX003 at 15% is Urban Road's
 * own custom rate (inferred from Calxa and August's GST movement).
 */
const BUILT_IN_RATES: Record<string, number> = {
  OUTPUT: 0.1,
  INPUT: 0.1,
  CAPEXINPUT: 0.1,
  EXEMPTOUTPUT: 0,
  EXEMPTEXPENSES: 0,
  EXEMPTCAPITAL: 0,
  EXEMPTEXPORT: 0,
  INPUTTAXED: 0,
  BASEXCLUDED: 0,
  NONE: 0,
}

export function gstRateForTaxType(taxType: string | null | undefined, overrides: Record<string, number> = {}): number | null {
  if (!taxType) return null
  const key = taxType.trim()
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key]
  const upper = key.toUpperCase()
  return Object.prototype.hasOwnProperty.call(BUILT_IN_RATES, upper) ? BUILT_IN_RATES[upper] : null
}
