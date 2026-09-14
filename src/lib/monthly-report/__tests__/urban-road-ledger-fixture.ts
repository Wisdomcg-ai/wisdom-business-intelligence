/**
 * Urban Road Pty Ltd's ledger mirror as the cash model reads it, from read-only
 * production SELECTs on 14 Sep 2026 (tenant 8519c134): the accruals balance
 * sheet at 30 Jun, 31 Jul and 31 Aug 2026 (xero_bs_lines), the P&L for June to
 * August (xero_pl_lines), the tax type of every account with activity
 * (xero_accounts) and the weekly pay runs (xero_pay_runs).
 *
 * Real figures, so the tests pin what the pack prints for the client whose
 * Calxa pack v2 is measured against: July's bank +31,446.33, August's
 * -31,708.01, the ATO Creditors (BAS) entry of +37,913 in August.
 */
import type { BsRowInput } from '../money-flow'
import type { CashPlRow } from '../pack-cash-actuals'
import type { CashModelAccount } from '../pack-cash-model'

export const UR_TENANT = "8519c134-ed81-4d9b-8f07-ce499d12b7ee"

/** CBA Cheque Account + Bus Online Saver: the bank set Calxa and decision 20 use. */
export const UR_BANK_IDS = ['6532a9b0-e2c4-48c9-bcc3-65757e80d4e4', 'cd058bf3-c1a1-4379-b886-424aa5e77e7f']
/**
 * Amex Business Card, Suzie Credit Card and American Express® Platinum
 * Business Card: the ACTIVE xero_accounts rows with bank_account_type
 * CREDITCARD (all three xero_type BANK, xero_class ASSET), as the loader
 * builds creditCardAccountIds.
 */
export const UR_CREDIT_CARD_IDS = ['50a3aabd-14b2-4b9c-988e-25e0c3c56b39', '699a2acf-f125-485f-b9d7-dcb8755f95c7', '0aca1d06-e22b-4d9c-b172-8c4a59aee56b']

/** xero_accounts.tax_type by account code, for every account the P&L and budget use. */
export const UR_TAX_TYPES: Record<string, string> = {
  '200': 'OUTPUT', '41000': 'OUTPUT', '41120': 'OUTPUT', '41130': 'OUTPUT', '41140': 'EXEMPTOUTPUT', '41150': 'TAX003', '41200': 'OUTPUT',
  '41300': 'OUTPUT', '41350': 'OUTPUT', '41600': 'OUTPUT', '41700': 'OUTPUT', '41750': 'OUTPUT', '42010': 'OUTPUT', '43000': 'EXEMPTOUTPUT',
  '44000': 'OUTPUT', '44250': 'OUTPUT', '46000': 'OUTPUT', '48000': 'OUTPUT',
  '310': 'INPUT', '51100': 'INPUT', '51150': 'INPUT', '51160': 'INPUT', '51210': 'EXEMPTEXPENSES', '51215': 'EXEMPTEXPENSES', '51216': 'EXEMPTEXPENSES',
  '51220': 'EXEMPTEXPENSES', '51300': 'INPUT', '51400.1': 'INPUT', '51400.2': 'EXEMPTEXPENSES', '51500': 'INPUT', '51550': 'INPUT', '51600': 'INPUT',
  '51601': 'INPUT', '51700': 'INPUT', '52600': 'INPUT', '52700': 'EXEMPTEXPENSES', '53000': 'INPUT', '55000': 'INPUT',
  '100000': 'BASEXCLUDED', '497': 'BASEXCLUDED', '498': 'BASEXCLUDED', '499': 'BASEXCLUDED',
  '60100': 'INPUT', '60500': 'INPUT', '60550': 'EXEMPTEXPENSES', '60560': 'EXEMPTEXPENSES', '60570': 'INPUT', '60700': 'INPUT', '61400': 'EXEMPTEXPENSES',
  '62130': 'INPUT', '62150': 'INPUT', '62160': 'BASEXCLUDED', '62170': 'BASEXCLUDED', '62180': 'INPUT', '62190': 'INPUT', '62500': 'INPUT',
  '62700': 'BASEXCLUDED', '62800': 'INPUT', '63100': 'BASEXCLUDED', '63200': 'EXEMPTEXPENSES', '63500': 'INPUT', '63552': 'EXEMPTEXPENSES',
  '63560': 'INPUT', '63700': 'INPUT', '63705': 'INPUT', '63710': 'INPUT', '64100': 'INPUT', '64200': 'INPUT', '64550': 'INPUT', '64570': 'INPUT',
  '64600': 'EXEMPTEXPENSES', '64610': 'EXEMPTEXPENSES', '64780': 'INPUT', '64850': 'INPUT', '64860': 'INPUT', '64900': 'INPUT', '65400': 'EXEMPTEXPENSES',
  '65600': 'INPUT', '66000': 'INPUT', '66001': 'INPUT', '66400': 'INPUT', '67600': 'INPUT', '68000': 'INPUT', '68700': 'INPUT', '68850': 'INPUT',
  '68860': 'EXEMPTEXPENSES', '68950': 'INPUT', '68960': 'EXEMPTEXPENSES', '69200': 'EXEMPTEXPENSES', '69500': 'INPUT', '81000': 'EXEMPTOUTPUT',
  '91200': 'EXEMPTEXPENSES',
}

/** The P&L mirror's codeless "Foreign Currency Gains and Losses" row: Xero's FX account, BAS Excluded. */
export const UR_TAX_TYPES_BY_NAME: Record<string, string> = { 'foreign currency gains and losses': 'BASEXCLUDED' }

/** Weekly pay runs, June to August 2026 (xero_pay_runs, POSTED). */
export const UR_PAY_RUNS = [
  ...['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'].map((payment_date) => ({ payment_date, wages: 10503.85, tax: 2453, super_amount: 1260.47 })),
  ...['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']
    .map((payment_date) => ({ payment_date, wages: 10503.85, tax: 2422, super_amount: 1260.47 })),
]

/** The tax types as xero_accounts rows, the shape the cash model's rate lookup reads. */
export const UR_ACCOUNTS: CashModelAccount[] = [
  ...Object.entries(UR_TAX_TYPES).map(([account_code, tax_type]) => ({ xero_account_id: `code-${account_code}`, account_code, account_name: `#${account_code}`, tax_type })),
  ...Object.entries(UR_TAX_TYPES_BY_NAME).map(([account_name, tax_type]) => ({ xero_account_id: `name-${account_name}`, account_code: null, account_name, tax_type })),
]

export const UR_ACCOUNT_IDS = {
  tradeDebtors: '905e1394-e959-42d7-8d87-3895ac23fb81',
  tradeCreditors: '49f8b3eb-70ad-48cd-a80d-8b8ac3f06fec',
  gstCollectedPaid: 'd1eac985-889c-4e7a-8f3e-4db191eb20b2',
  gstAdjustments: '1cf8a821-898a-40ea-9c0c-5a02e52bdab6',
  atoCreditorsBas: '5c8448e1-059c-4d57-af59-3ffc8b944243',
  paygPayrollTaxWithheld: 'ab757d44-e005-4b1b-a0ea-040ccbe15a80',
  superPayable: 'a41a16c6-ee8b-43b0-b67c-23a26b14bb55',
}

export const UR_BS_ROWS: BsRowInput[] = [
  {"account_id": "84b151bf-cc20-4f09-b34a-4c695cc9bff4", "account_code": null, "account_name": "AUD PayPal#001", "account_type": "asset", "section": "Bank", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 2641.06, "2026-07-31": 5029.59, "2026-08-31": 2095.07}},
  {"account_id": "cd058bf3-c1a1-4379-b886-424aa5e77e7f", "account_code": null, "account_name": "Bus Online Saver", "account_type": "asset", "section": "Bank", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 86037.86, "2026-07-31": 90000.0, "2026-08-31": 99000.0}},
  {"account_id": "6532a9b0-e2c4-48c9-bcc3-65757e80d4e4", "account_code": "11110", "account_name": "CBA Cheque Account", "account_type": "asset", "section": "Bank", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 31948.67, "2026-07-31": 59432.86, "2026-08-31": 18724.85}},
  {"account_id": "9ecfb516-731d-4df1-bad8-1877700840f2", "account_code": "11140", "account_name": "CBA Foreign Currency Account", "account_type": "asset", "section": "Bank", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 0.0, "2026-07-31": 0.0, "2026-08-31": 0.0}},
  {"account_id": "4eee277f-7184-4d7c-9ead-9df2c7bcce4c", "account_code": "11160", "account_name": "Urban Road Tax Savings acct", "account_type": "asset", "section": "Bank", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 45000.0, "2026-07-31": 111000.0, "2026-08-31": 90000.0}},
  {"account_id": "568167dd-2ea0-4eb5-962f-329c4aca410a", "account_code": null, "account_name": "USD PayPal #001", "account_type": "asset", "section": "Bank", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 122.81, "2026-07-31": 0.0, "2026-08-31": 0.0}},
  {"account_id": "637735b0-d357-4497-b3a9-59f0aa4671a8", "account_code": null, "account_name": "Wise account", "account_type": "asset", "section": "Bank", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 1879.41, "2026-07-31": 222.47, "2026-08-31": 364.67}},
  {"account_id": "09fd4a63-c488-4e4e-b28d-5735ebc28600", "account_code": "12400", "account_name": "Loan - Urban Rd Commercial", "account_type": "asset", "section": "Current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 3000.0, "2026-07-31": 3000.0, "2026-08-31": 3000.0}},
  {"account_id": "a80dbe45-53c2-46e7-87ab-befcfe337e03", "account_code": "11500", "account_name": "Patent & Trademarks", "account_type": "asset", "section": "Current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 2920.0, "2026-07-31": 2920.0, "2026-08-31": 2920.0}},
  {"account_id": "685016a3-1638-4286-ac66-91c2265a1c75", "account_code": "12200", "account_name": "Rental Bond", "account_type": "asset", "section": "Current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 19729.25, "2026-07-31": 19729.25, "2026-08-31": 19729.25}},
  {"account_id": "c2ba6cb6-f50d-45f7-80b9-3323f67fb076", "account_code": "11370", "account_name": "Stock on Hand (Zoho)", "account_type": "asset", "section": "Current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -44562.11, "2026-07-31": -47975.46, "2026-08-31": -55005.0}},
  {"account_id": "905e1394-e959-42d7-8d87-3895ac23fb81", "account_code": "11200", "account_name": "Trade Debtors", "account_type": "asset", "section": "Current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 267324.2, "2026-07-31": 130253.03, "2026-08-31": 278428.06}},
  {"account_id": "a99e0db8-5cd0-4e07-8cbd-49c9ec0aa0cc", "account_code": "19110", "account_name": "Formation Costs - at cost", "account_type": "asset", "section": "Fixed Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 13710.0, "2026-07-31": 13710.0, "2026-08-31": 13710.0}},
  {"account_id": "03d76b28-f73b-490c-a81e-5ac6051c6011", "account_code": "13110", "account_name": "Furniture & Equipment - Cost", "account_type": "asset", "section": "Fixed Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 97860.47, "2026-07-31": 97860.47, "2026-08-31": 97860.47}},
  {"account_id": "7f0c3570-d6c1-4a4f-ba43-9e672c2b0e07", "account_code": "13120", "account_name": "Furniture & Equipment - Dep'n", "account_type": "asset", "section": "Fixed Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -89412.23, "2026-07-31": -89412.23, "2026-08-31": -89412.23}},
  {"account_id": "120e32c6-c603-4ea7-8678-a8897fef1ba6", "account_code": "13000", "account_name": "Leasehold Fixture & Fitting - Cost", "account_type": "asset", "section": "Fixed Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 125832.04, "2026-07-31": 125832.04, "2026-08-31": 125832.04}},
  {"account_id": "04baece7-bafb-4e88-8a9a-748e5110228a", "account_code": "13005", "account_name": "Leasehold Fixture & Fitting - Dep'n", "account_type": "asset", "section": "Fixed Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -125832.04, "2026-07-31": -125832.04, "2026-08-31": -125832.04}},
  {"account_id": "109f6206-1d37-4130-a436-cff73c31d71d", "account_code": "13150", "account_name": "Plant & Equipment - Cost", "account_type": "asset", "section": "Fixed Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 140212.9, "2026-07-31": 140212.9, "2026-08-31": 140212.9}},
  {"account_id": "5be34dec-9362-4e05-8237-2c715bf129fb", "account_code": "13160", "account_name": "Plant & Equipment - Dep'n", "account_type": "asset", "section": "Fixed Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -60331.0, "2026-07-31": -60331.0, "2026-08-31": -60331.0}},
  {"account_id": "aa0bc0af-a63d-48d1-b024-f649917b610c", "account_code": "19600", "account_name": "Accumulated amortisation inhouse software", "account_type": "asset", "section": "Non-current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -58103.0, "2026-07-31": -58103.0, "2026-08-31": -58103.0}},
  {"account_id": "b24a3c5c-fb1a-46bf-a7b8-325b91939144", "account_code": "19130", "account_name": "Borrowing Costs", "account_type": "asset", "section": "Non-current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 480.9, "2026-07-31": 480.9, "2026-08-31": 480.9}},
  {"account_id": "0de39031-37c2-49f7-9f24-411859920e50", "account_code": "19550", "account_name": "IT costs - software migration", "account_type": "asset", "section": "Non-current Assets", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 207192.2, "2026-07-31": 207192.2, "2026-08-31": 207192.2}},
  {"account_id": "abababab-abab-abab-abab-abababababab", "account_code": null, "account_name": "Current Year Earnings", "account_type": "equity", "section": null, "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -16961.64, "2026-07-31": 14067.26, "2026-08-31": 146768.52}},
  {"account_id": "a6ebe4c4-400b-490d-ae06-614f0995b959", "account_code": "30301", "account_name": "Issued \"J\" Class Shares", "account_type": "equity", "section": null, "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 1.0, "2026-07-31": 1.0, "2026-08-31": 1.0}},
  {"account_id": "d6933faa-b0ec-4046-974d-607f618f60e0", "account_code": "30302", "account_name": "Issued \"K\" Class Shares", "account_type": "equity", "section": null, "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 1.0, "2026-07-31": 1.0, "2026-08-31": 1.0}},
  {"account_id": "ea623bd4-1b98-4a75-8571-2cb7b8ae5e99", "account_code": "30200", "account_name": "Issued Ordinary Shares", "account_type": "equity", "section": null, "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 200.0, "2026-07-31": 200.0, "2026-08-31": 200.0}},
  {"account_id": "bdce8b88-b13e-4cdd-8eb2-6d5d5bccd59f", "account_code": "960", "account_name": "Retained Earnings", "account_type": "equity", "section": null, "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 295233.25, "2026-07-31": 278271.62, "2026-08-31": 278271.62}},
  {"account_id": "5340b22e-8a2f-48c0-8fe5-1d16227d3b0d", "account_code": "30800", "account_name": "Retained Earnings b/f", "account_type": "equity", "section": null, "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 0.02, "2026-07-31": 0.02, "2026-08-31": 0.02}},
  {"account_id": "0aca1d06-e22b-4d9c-b172-8c4a59aee56b", "account_code": null, "account_name": "American Express\u00ae Platinum Business Card", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 65862.42, "2026-07-31": 65918.57, "2026-08-31": 64332.13}},
  {"account_id": "50a3aabd-14b2-4b9c-988e-25e0c3c56b39", "account_code": "21120", "account_name": "Amex Business Card", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 0.0, "2026-07-31": 0.0}},
  {"account_id": "5c8448e1-059c-4d57-af59-3ffc8b944243", "account_code": "21250", "account_name": "ATO Creditors (BAS)", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -48970.0, "2026-07-31": -39282.0, "2026-08-31": 10741.0}},
  {"account_id": "ba8d18f8-f65b-4111-80ee-dc0945290d5c", "account_code": "21370", "account_name": "Company Tax Payable/Refund", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -3076.24, "2026-07-31": -3076.24, "2026-08-31": -3076.24}},
  {"account_id": "fd76a6b8-6998-45a7-bf0f-c58f2a0b2213", "account_code": "21700", "account_name": "Forklift Loan", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -7833.96, "2026-07-31": -8486.79, "2026-08-31": -9139.62}},
  {"account_id": "1cf8a821-898a-40ea-9c0c-5a02e52bdab6", "account_code": "21305", "account_name": "GST adjustments", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -3080.27, "2026-07-31": -3080.27, "2026-08-31": -3080.27}},
  {"account_id": "d1eac985-889c-4e7a-8f3e-4db191eb20b2", "account_code": "21300", "account_name": "GST Collected & Paid", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 31515.27, "2026-07-31": 41229.32, "2026-08-31": 69410.61}},
  {"account_id": "278fb877-5767-456e-b9c1-8b75f557860d", "account_code": "21330", "account_name": "Hardware Concepts Loan", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 11020.46, "2026-07-31": 11020.46, "2026-08-31": 11020.46}},
  {"account_id": "c6e82d87-8433-45f6-8bdb-e16bf77782de", "account_code": "21800", "account_name": "Hire Purchase - Current", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 7833.96, "2026-07-31": 7833.96, "2026-08-31": 7833.96}},
  {"account_id": "40b49161-3190-43b2-9f5f-b1c8db04176e", "account_code": "21805", "account_name": "Less: Unexpired Interest - Current", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -2155.72, "2026-07-31": -2155.72, "2026-08-31": -2155.72}},
  {"account_id": "2a00eff1-3cd5-4d5b-8c94-964d79385689", "account_code": "21375", "account_name": "Non resident W/holding payable", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 0.0, "2026-07-31": 0.0, "2026-08-31": 0.0}},
  {"account_id": "ab757d44-e005-4b1b-a0ea-040ccbe15a80", "account_code": "21390", "account_name": "PAYG Payroll Tax Withheld", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 16674.0, "2026-07-31": 16674.0, "2026-08-31": 16674.0}},
  {"account_id": "4db0e1a0-e19d-4dcc-b3d5-2c6ff6d906ac", "account_code": "21350", "account_name": "QLD Govt Loan", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 144700.11, "2026-07-31": 141761.44, "2026-08-31": 138826.45}},
  {"account_id": "ad10a7af-49b5-4d49-85bb-46e8092fc17c", "account_code": "860", "account_name": "Rounding", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -2.02, "2026-07-31": -1.93, "2026-08-31": -1.86}},
  {"account_id": "36b0097a-d98f-4127-b1e4-d77077157446", "account_code": "22210", "account_name": "SKA Family Trust Loan a/c", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -437328.93, "2026-07-31": -447328.93, "2026-08-31": -456782.16}},
  {"account_id": "a41a16c6-ee8b-43b0-b67c-23a26b14bb55", "account_code": "21490", "account_name": "Superannuation Payable", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 1260.47, "2026-07-31": 0.0, "2026-08-31": 1260.47}},
  {"account_id": "699a2acf-f125-485f-b9d7-dcb8755f95c7", "account_code": "21110", "account_name": "Suzie Credit Card", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 26.15, "2026-07-31": 0.0, "2026-08-31": 0.0}},
  {"account_id": "49f8b3eb-70ad-48cd-a80d-8b8ac3f06fec", "account_code": "21200", "account_name": "Trade Creditors", "account_type": "liability", "section": "Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 527764.12, "2026-07-31": 482773.53, "2026-08-31": 380205.08}},
  {"account_id": "f45edef8-a898-4845-97b9-65f94f7d8397", "account_code": "23000", "account_name": "Hire Purchase - Non Current", "account_type": "liability", "section": "Non-Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 22862.54, "2026-07-31": 22862.54, "2026-08-31": 22862.54}},
  {"account_id": "85668d95-8793-4a45-ada4-a49fe0a8ccdb", "account_code": "21807", "account_name": "Latitude Gem Visa", "account_type": "liability", "section": "Non-Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -2563.51, "2026-07-31": -2738.89, "2026-08-31": -3909.89}},
  {"account_id": "c76267d0-043e-4cc4-b403-733082c5dd03", "account_code": "23005", "account_name": "Less: Unexpired Interest - Non Current", "account_type": "liability", "section": "Non-Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -2126.39, "2026-07-31": -2126.39, "2026-08-31": -2126.39}},
  {"account_id": "717815b9-df78-4f0e-b99c-5b3a5b059c2a", "account_code": "21806", "account_name": "Loan - Credit Line", "account_type": "liability", "section": "Non-Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 8332.33, "2026-07-31": 8332.33, "2026-08-31": 8332.33}},
  {"account_id": "5ec70989-0c5e-4111-bac1-df72617e7de4", "account_code": "21320", "account_name": "PrinTribe Loan", "account_type": "liability", "section": "Non-Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": -55019.5, "2026-07-31": -55019.5, "2026-08-31": -55019.5}},
  {"account_id": "b3e0e808-eae1-4b10-9500-532c47b29f1f", "account_code": "21310", "account_name": "Shopify Loan", "account_type": "liability", "section": "Non-Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 6582.46, "2026-08-31": 0.0}},
  {"account_id": "e03bc6e4-2495-4e77-a9c8-ab5ae2f74e20", "account_code": "21311", "account_name": "Shopify loan 2 $100000", "account_type": "liability", "section": "Non-Current Liabilities", "tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "balances_by_date": {"2026-06-30": 106900.0, "2026-07-31": 97571.59, "2026-08-31": 89417.6}},
]

export const UR_PL_ROWS: CashPlRow[] = [
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "200", "account_name": "Sales", "account_type": "revenue", "monthly_values": {"2026-06": -99.5, "2026-07": 65.0, "2026-08": 157.63}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41000", "account_name": "Canvas Sales", "account_type": "revenue", "monthly_values": {"2026-06": 383552.28, "2026-07": 337401.88, "2026-08": 295826.71}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41130", "account_name": "Materialised", "account_type": "revenue", "monthly_values": {"2026-06": 3858.52}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41140", "account_name": "USA Sales", "account_type": "revenue", "monthly_values": {"2026-06": 12937.99, "2026-07": 15418.08, "2026-08": 8322.25}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41150", "account_name": "NZ Sales", "account_type": "revenue", "monthly_values": {"2026-06": 1775.6, "2026-07": 1320.91, "2026-08": 50837.52}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41200", "account_name": "Rolled Prints", "account_type": "revenue", "monthly_values": {"2026-06": 3580.03, "2026-07": 2593.78, "2026-08": 3221.53}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41300", "account_name": "Decor Sales", "account_type": "revenue", "monthly_values": {"2026-06": 10338.07, "2026-07": 12158.72, "2026-08": 16622.86}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41600", "account_name": "Framed Prints (41600)", "account_type": "revenue", "monthly_values": {"2026-06": 62587.25, "2026-07": 54874.16, "2026-08": 50806.62}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41700", "account_name": "Posters (41700)", "account_type": "revenue", "monthly_values": {"2026-06": 68118.66, "2026-07": 56076.86, "2026-08": 66911.11}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "41750", "account_name": "Wallpaper", "account_type": "revenue", "monthly_values": {"2026-06": 4135.16, "2026-07": 1093.3, "2026-08": 3040.56}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "42010", "account_name": "Sales Discounts (Zoho)", "account_type": "revenue", "monthly_values": {"2026-06": -17491.06, "2026-07": -5558.8, "2026-08": -2257.7}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "43000", "account_name": "POD Exchange Income", "account_type": "revenue", "monthly_values": {"2026-06": 1389.91, "2026-07": 789.01, "2026-08": 149.05}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "44000", "account_name": "Shipping", "account_type": "revenue", "monthly_values": {"2026-06": 47902.47, "2026-07": 41583.24, "2026-08": 36699.46}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "44250", "account_name": "Services", "account_type": "revenue", "monthly_values": {"2026-08": 4200.0}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "48000", "account_name": "Returns & Allowances", "account_type": "revenue", "monthly_values": {"2026-06": -13582.59, "2026-07": -22599.11, "2026-08": -6975.8}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "310", "account_name": "Cost of Goods Sold", "account_type": "cogs", "monthly_values": {"2026-06": -42.5}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51100", "account_name": "Antons Canvas", "account_type": "cogs", "monthly_values": {"2026-06": 226897.3, "2026-07": 208264.77, "2026-08": 156163.37}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51150", "account_name": "Posters", "account_type": "cogs", "monthly_values": {"2026-06": 26335.76, "2026-07": 33710.98}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51210", "account_name": "Rugs", "account_type": "cogs", "monthly_values": {"2026-06": 574.78, "2026-07": 151.87, "2026-08": 326.48}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51216", "account_name": "Art Import", "account_type": "cogs", "monthly_values": {"2026-06": 21895.9, "2026-07": 4834.58, "2026-08": 5042.36}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51220", "account_name": "Design images - No royalty", "account_type": "cogs", "monthly_values": {"2026-06": 36.63, "2026-07": 37.09, "2026-08": 36.62}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51300", "account_name": "International Orders", "account_type": "cogs", "monthly_values": {"2026-06": 11849.99, "2026-07": 7317.53, "2026-08": 11641.59}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51400.2", "account_name": "Cushions & Decor", "account_type": "cogs", "monthly_values": {"2026-06": 8257.27, "2026-07": 4685.01, "2026-08": 7010.17}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51500", "account_name": "Art Supplies", "account_type": "cogs", "monthly_values": {"2026-08": 116.92}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "51700", "account_name": "Artwork Scanning", "account_type": "cogs", "monthly_values": {"2026-07": 900.0}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "52700", "account_name": "Artist Commissions", "account_type": "cogs", "monthly_values": {"2026-06": 9036.02, "2026-07": 4.86, "2026-08": 1474.46}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "53000", "account_name": "Customs,Duties & Shipping", "account_type": "cogs", "monthly_values": {"2026-07": 6603.11}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "55000", "account_name": "Freight to Customer", "account_type": "cogs", "monthly_values": {"2026-06": 50307.5, "2026-07": 51102.0, "2026-08": 50924.95}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "60100", "account_name": "Accounting Fees", "account_type": "opex", "monthly_values": {"2026-06": 340.0, "2026-07": 787.5}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "60550", "account_name": "Bank Fees", "account_type": "opex", "monthly_values": {"2026-06": 37.13, "2026-07": 11.01, "2026-08": 11.0}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "60560", "account_name": "Bank & Credit Card Interest", "account_type": "opex", "monthly_values": {"2026-06": 497.36, "2026-07": 481.24, "2026-08": 484.92}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "60570", "account_name": "Shopify Fees", "account_type": "opex", "monthly_values": {"2026-06": 3750.74, "2026-07": 4148.16, "2026-08": 2623.08}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "60700", "account_name": "Bookkeeping Fees", "account_type": "opex", "monthly_values": {"2026-06": 1265.0, "2026-07": 1265.0, "2026-08": 1265.0}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "61400", "account_name": "Contractors excl. Artists", "account_type": "opex", "monthly_values": {"2026-06": 23173.42, "2026-07": 29910.6, "2026-08": 31029.3}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "62130", "account_name": "Employ - Staff Amenities", "account_type": "opex", "monthly_values": {"2026-06": 571.92, "2026-07": 129.04, "2026-08": 1240.81}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "62150", "account_name": "Employ - Staff Recruitment", "account_type": "opex", "monthly_values": {"2026-06": 208.16, "2026-07": 208.16, "2026-08": 208.16}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "62160", "account_name": "Employ - Superannuation", "account_type": "opex", "monthly_values": {"2026-06": 6302.35, "2026-07": 5041.88, "2026-08": 6302.35}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "62170", "account_name": "Employ - Wages & Salaries", "account_type": "opex", "monthly_values": {"2026-06": 52519.25, "2026-07": 42015.4, "2026-08": 52519.25}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "62180", "account_name": "Employ - Workers' Compensation", "account_type": "opex", "monthly_values": {"2026-06": 489.93}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "62500", "account_name": "Electricity", "account_type": "opex", "monthly_values": {"2026-07": 1503.22}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "63100", "account_name": "Office Expenses", "account_type": "opex", "monthly_values": {"2026-06": 655.97}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "63200", "account_name": "Cleaning", "account_type": "opex", "monthly_values": {"2026-06": 574.73, "2026-07": 921.46, "2026-08": 572.18}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "63500", "account_name": "Insurance excl Workers Comp", "account_type": "opex", "monthly_values": {"2026-06": 2188.24, "2026-07": 2188.24, "2026-08": 2188.24}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "63700", "account_name": "IT Costs Software", "account_type": "opex", "monthly_values": {"2026-06": 14025.7, "2026-07": 13764.27, "2026-08": 14725.73}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "64200", "account_name": "Licence Fees", "account_type": "opex", "monthly_values": {"2026-06": 329.0, "2026-08": 10.0}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "64550", "account_name": "Marketing - Advertising", "account_type": "opex", "monthly_values": {"2026-08": 137.54}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "64570", "account_name": "Marketing - Affiliate", "account_type": "opex", "monthly_values": {"2026-06": 1297.09}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "64600", "account_name": "Marketing Digital Ad Spend", "account_type": "opex", "monthly_values": {"2026-06": 21919.47, "2026-07": 19175.27, "2026-08": 23143.86}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "64610", "account_name": "Marketing Digital Services", "account_type": "opex", "monthly_values": {"2026-06": 10460.4, "2026-07": 9430.34, "2026-08": 9245.14}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "64850", "account_name": "Marketing - Trade Shows", "account_type": "opex", "monthly_values": {"2026-07": 5972.31}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "64900", "account_name": "Memberships & Registrations", "account_type": "opex", "monthly_values": {"2026-06": 166.56, "2026-07": 188.28, "2026-08": 376.55}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "65400", "account_name": "Merchant Fees", "account_type": "opex", "monthly_values": {"2026-06": 2225.84, "2026-07": 2213.58, "2026-08": 1926.21}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "65600", "account_name": "Printing & Stationery", "account_type": "opex", "monthly_values": {"2026-06": 638.25, "2026-07": 436.05, "2026-08": 199.31}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "66000", "account_name": "Rent - Office", "account_type": "opex", "monthly_values": {"2026-06": 7867.12, "2026-07": 6881.76, "2026-08": 6881.76}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "66001", "account_name": "Outgoings", "account_type": "opex", "monthly_values": {"2026-06": 2665.54, "2026-07": 2574.57, "2026-08": 2574.57}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "66400", "account_name": "Repairs & Maintenance Warehouse", "account_type": "opex", "monthly_values": {"2026-06": -616.75, "2026-07": -502.83, "2026-08": -132.83}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "68000", "account_name": "Telephone & Internet", "account_type": "opex", "monthly_values": {"2026-06": 299.09, "2026-07": 3264.18, "2026-08": 299.14}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "68700", "account_name": "Training & Seminars", "account_type": "opex", "monthly_values": {"2026-06": 2750.0, "2026-07": 2750.0, "2026-08": 2750.0}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "68850", "account_name": "T/E - Accom, Meals-Aust Travel", "account_type": "opex", "monthly_values": {"2026-06": 449.15, "2026-07": 347.39}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "68860", "account_name": "T/E - Accom, Meals -OS Travel", "account_type": "opex", "monthly_values": {"2026-07": 1253.91}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "68950", "account_name": "T/E - Air Fares/Taxis - Aust", "account_type": "opex", "monthly_values": {"2026-06": 379.43, "2026-07": 102.59, "2026-08": 129.54}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "68960", "account_name": "T/E - Air Fares/Taxis - O'seas", "account_type": "opex", "monthly_values": {"2026-07": 4350.33, "2026-08": 582.54}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "69200", "account_name": "T/E - Trade Shows", "account_type": "opex", "monthly_values": {"2026-07": 2522.04}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "69500", "account_name": "USA Company Expenses", "account_type": "opex", "monthly_values": {"2026-06": 22.15, "2026-07": 22.28, "2026-08": 21.95}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": null, "account_name": "Foreign Currency Gains and Losses", "account_type": "opex", "monthly_values": {"2026-06": 1790.14, "2026-07": 238.61, "2026-08": 919.25}},
  {"tenant_id": "8519c134-ed81-4d9b-8f07-ce499d12b7ee", "account_code": "81000", "account_name": "Bank Interest Income", "account_type": "other_income", "monthly_values": {"2026-06": 48.16, "2026-07": 57.87, "2026-08": 110.93}},
]
