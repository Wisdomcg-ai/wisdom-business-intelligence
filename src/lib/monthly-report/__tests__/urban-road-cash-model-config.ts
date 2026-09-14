/**
 * Urban Road's cash_model with the DESIGN'S RECOMMENDED values (wave5 cash
 * design, section 13) — for tests and the harness render only. The values
 * are Matt's to confirm: DSO/DPO derived vs Calxa's 19/29, accrual GST, a tax
 * agent's BAS (Nov/Feb/May/Aug), quarter-to-date opening GST, PAYG on ATO
 * Creditors (BAS) 21250 from payslips on the agent's monthly IAS pattern,
 * Payday Super. Nothing here is saved to any business.
 */
import type { CashModelConfig } from '../cash-model-config'
import { UR_ACCOUNT_IDS } from './urban-road-ledger-fixture'

export function urbanRoadCashModel(overrides: Partial<CashModelConfig> = {}): CashModelConfig {
  return {
    enabled: true,
    dso_days: 'derived',
    dpo_days: 'derived',
    opex_timing: 'dpo',
    debtors_account_ids: [UR_ACCOUNT_IDS.tradeDebtors],
    creditors_account_ids: [UR_ACCOUNT_IDS.tradeCreditors],
    gst: {
      basis: 'accrual',
      schedule: 'quarterly_feb_may_aug_nov',
      account_ids: [UR_ACCOUNT_IDS.gstCollectedPaid, UR_ACCOUNT_IDS.gstAdjustments],
      opening: 'quarter_to_date_movement',
      tax_rate_overrides: { TAX003: 0.15 },
    },
    paygw: {
      liability_account_ids: [UR_ACCOUNT_IDS.atoCreditorsBas],
      schedule: 'monthly_ias_quarterly_bas_agent',
      rate: 'payslips',
    },
    super: {
      payable_account_ids: [UR_ACCOUNT_IDS.superPayable],
      expense_codes: ['62160'],
      schedule: 'payday',
    },
    wages_codes: ['62170'],
    opening_ato_accounts: [],
    ...overrides,
  }
}
