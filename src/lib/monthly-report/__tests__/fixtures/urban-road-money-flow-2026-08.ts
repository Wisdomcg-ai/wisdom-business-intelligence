/**
 * Urban Road Pty Ltd's stored balance-sheet mirror at 31 Jul and 31 Aug 2026,
 * every account with a balance at either date, as xero_bs_lines_wide_compat
 * served it on 14 Sep 2026 (prod, read-only). A missing month-end is a key the
 * view did not emit, not a zero. Plus August's P&L totals from
 * xero_pl_lines_wide_compat and the ids the pack needs by name.
 *
 * The sync postdates the Calxa pack by TWO postings, and they explain every
 * difference from Calxa p26 between them:
 *  - a credit note of $853.80 + $85.38 GST = $939.18 to Returns & Allowances.
 *    Income is 527,562 here against Calxa's 528,416, the surplus 132,701
 *    against 133,555, GST Collected & Paid 69,411 against 69,496, and it takes
 *    $939.18 off Trade Debtors;
 *  - a customer's receipt of about $160 into AUD PayPal: PayPal closes 2,095
 *    against Calxa's 1,935, and it takes the rest of Trade Debtors' gap
 *    (278,428 against 279,527: 1,099 = 939.18 + ~160).
 * The PayPal difference is not the credit refunded — a refund would have taken
 * money OUT of PayPal, and ours holds more. Neither touches CBA Cheque or Bus
 * Online Saver, so the bank Total (31,708) ties exactly.
 */
import type { BsRowInput, PlRowInput } from '../../money-flow'

export const UR_TENANT = '8519c134-ed81-4d9b-8f07-ce499d12b7ee'
export const CBA_CHEQUE = '6532a9b0-e2c4-48c9-bcc3-65757e80d4e4'
export const BUS_ONLINE_SAVER = 'cd058bf3-c1a1-4379-b886-424aa5e77e7f'
export const AMEX_PLATINUM = '0aca1d06-e22b-4d9c-b172-8c4a59aee56b'

type Raw = [string, string | null, string, string, string | null, number | undefined, number | undefined]

const RAW: Raw[] = [
  ['84b151bf-cc20-4f09-b34a-4c695cc9bff4', null, 'AUD PayPal#001', 'asset', 'Bank', 5029.59, 2095.07],
  [BUS_ONLINE_SAVER, null, 'Bus Online Saver', 'asset', 'Bank', 90000, 99000],
  ['568167dd-2ea0-4eb5-962f-329c4aca410a', null, 'USD PayPal #001', 'asset', 'Bank', 0, 0],
  ['637735b0-d357-4497-b3a9-59f0aa4671a8', null, 'Wise account', 'asset', 'Bank', 222.47, 364.67],
  [CBA_CHEQUE, '11110', 'CBA Cheque Account', 'asset', 'Bank', 59432.86, 18724.85],
  ['9ecfb516-731d-4df1-bad8-1877700840f2', '11140', 'CBA Foreign Currency Account', 'asset', 'Bank', 0, 0],
  ['4eee277f-7184-4d7c-9ead-9df2c7bcce4c', '11160', 'Urban Road Tax Savings acct', 'asset', 'Bank', 111000, 90000],
  ['905e1394-e959-42d7-8d87-3895ac23fb81', '11200', 'Trade Debtors', 'asset', 'Current Assets', 130253.03, 278428.06],
  ['c2ba6cb6-f50d-45f7-80b9-3323f67fb076', '11370', 'Stock on Hand (Zoho)', 'asset', 'Current Assets', -47975.46, -55005],
  ['a80dbe45-53c2-46e7-87ab-befcfe337e03', '11500', 'Patent & Trademarks', 'asset', 'Current Assets', 2920, 2920],
  ['685016a3-1638-4286-ac66-91c2265a1c75', '12200', 'Rental Bond', 'asset', 'Current Assets', 19729.25, 19729.25],
  ['09fd4a63-c488-4e4e-b28d-5735ebc28600', '12400', 'Loan - Urban Rd Commercial', 'asset', 'Current Assets', 3000, 3000],
  ['120e32c6-c603-4ea7-8678-a8897fef1ba6', '13000', 'Leasehold Fixture & Fitting - Cost', 'asset', 'Fixed Assets', 125832.04, 125832.04],
  ['04baece7-bafb-4e88-8a9a-748e5110228a', '13005', "Leasehold Fixture & Fitting - Dep'n", 'asset', 'Fixed Assets', -125832.04, -125832.04],
  ['03d76b28-f73b-490c-a81e-5ac6051c6011', '13110', 'Furniture & Equipment - Cost', 'asset', 'Fixed Assets', 97860.47, 97860.47],
  ['7f0c3570-d6c1-4a4f-ba43-9e672c2b0e07', '13120', "Furniture & Equipment - Dep'n", 'asset', 'Fixed Assets', -89412.23, -89412.23],
  ['109f6206-1d37-4130-a436-cff73c31d71d', '13150', 'Plant & Equipment - Cost', 'asset', 'Fixed Assets', 140212.9, 140212.9],
  ['5be34dec-9362-4e05-8237-2c715bf129fb', '13160', "Plant & Equipment - Dep'n", 'asset', 'Fixed Assets', -60331, -60331],
  ['a99e0db8-5cd0-4e07-8cbd-49c9ec0aa0cc', '19110', 'Formation Costs - at cost', 'asset', 'Fixed Assets', 13710, 13710],
  ['b24a3c5c-fb1a-46bf-a7b8-325b91939144', '19130', 'Borrowing Costs', 'asset', 'Non-current Assets', 480.9, 480.9],
  ['0de39031-37c2-49f7-9f24-411859920e50', '19550', 'IT costs - software migration', 'asset', 'Non-current Assets', 207192.2, 207192.2],
  ['aa0bc0af-a63d-48d1-b024-f649917b610c', '19600', 'Accumulated amortisation inhouse software', 'asset', 'Non-current Assets', -58103, -58103],
  ['abababab-abab-abab-abab-abababababab', null, 'Current Year Earnings', 'equity', null, 14067.26, 146768.52],
  ['ea623bd4-1b98-4a75-8571-2cb7b8ae5e99', '30200', 'Issued Ordinary Shares', 'equity', null, 200, 200],
  ['a6ebe4c4-400b-490d-ae06-614f0995b959', '30301', 'Issued "J" Class Shares', 'equity', null, 1, 1],
  ['d6933faa-b0ec-4046-974d-607f618f60e0', '30302', 'Issued "K" Class Shares', 'equity', null, 1, 1],
  ['5340b22e-8a2f-48c0-8fe5-1d16227d3b0d', '30800', 'Retained Earnings b/f', 'equity', null, 0.02, 0.02],
  ['bdce8b88-b13e-4cdd-8eb2-6d5d5bccd59f', '960', 'Retained Earnings', 'equity', null, 278271.62, 278271.62],
  [AMEX_PLATINUM, null, 'American Express® Platinum Business Card', 'liability', 'Current Liabilities', 65918.57, 64332.13],
  ['699a2acf-f125-485f-b9d7-dcb8755f95c7', '21110', 'Suzie Credit Card', 'liability', 'Current Liabilities', 0, 0],
  ['50a3aabd-14b2-4b9c-988e-25e0c3c56b39', '21120', 'Amex Business Card', 'liability', 'Current Liabilities', 0, undefined],
  ['49f8b3eb-70ad-48cd-a80d-8b8ac3f06fec', '21200', 'Trade Creditors', 'liability', 'Current Liabilities', 482773.53, 380205.08],
  ['5c8448e1-059c-4d57-af59-3ffc8b944243', '21250', 'ATO Creditors (BAS)', 'liability', 'Current Liabilities', -39282, 10741],
  ['d1eac985-889c-4e7a-8f3e-4db191eb20b2', '21300', 'GST Collected & Paid', 'liability', 'Current Liabilities', 41229.32, 69410.61],
  ['1cf8a821-898a-40ea-9c0c-5a02e52bdab6', '21305', 'GST adjustments', 'liability', 'Current Liabilities', -3080.27, -3080.27],
  ['278fb877-5767-456e-b9c1-8b75f557860d', '21330', 'Hardware Concepts Loan', 'liability', 'Current Liabilities', 11020.46, 11020.46],
  ['4db0e1a0-e19d-4dcc-b3d5-2c6ff6d906ac', '21350', 'QLD Govt Loan', 'liability', 'Current Liabilities', 141761.44, 138826.45],
  ['ba8d18f8-f65b-4111-80ee-dc0945290d5c', '21370', 'Company Tax Payable/Refund', 'liability', 'Current Liabilities', -3076.24, -3076.24],
  ['2a00eff1-3cd5-4d5b-8c94-964d79385689', '21375', 'Non resident W/holding payable', 'liability', 'Current Liabilities', 0, 0],
  ['ab757d44-e005-4b1b-a0ea-040ccbe15a80', '21390', 'PAYG Payroll Tax Withheld', 'liability', 'Current Liabilities', 16674, 16674],
  ['a41a16c6-ee8b-43b0-b67c-23a26b14bb55', '21490', 'Superannuation Payable', 'liability', 'Current Liabilities', 0, 1260.47],
  ['fd76a6b8-6998-45a7-bf0f-c58f2a0b2213', '21700', 'Forklift Loan', 'liability', 'Current Liabilities', -8486.79, -9139.62],
  ['c6e82d87-8433-45f6-8bdb-e16bf77782de', '21800', 'Hire Purchase - Current', 'liability', 'Current Liabilities', 7833.96, 7833.96],
  ['40b49161-3190-43b2-9f5f-b1c8db04176e', '21805', 'Less: Unexpired Interest - Current', 'liability', 'Current Liabilities', -2155.72, -2155.72],
  ['36b0097a-d98f-4127-b1e4-d77077157446', '22210', 'SKA Family Trust Loan a/c', 'liability', 'Current Liabilities', -447328.93, -456782.16],
  ['ad10a7af-49b5-4d49-85bb-46e8092fc17c', '860', 'Rounding', 'liability', 'Current Liabilities', -1.93, -1.86],
  ['b3e0e808-eae1-4b10-9500-532c47b29f1f', '21310', 'Shopify Loan', 'liability', 'Non-Current Liabilities', undefined, 0],
  ['e03bc6e4-2495-4e77-a9c8-ab5ae2f74e20', '21311', 'Shopify loan 2 $100000', 'liability', 'Non-Current Liabilities', 97571.59, 89417.6],
  ['5ec70989-0c5e-4111-bac1-df72617e7de4', '21320', 'PrinTribe Loan', 'liability', 'Non-Current Liabilities', -55019.5, -55019.5],
  ['717815b9-df78-4f0e-b99c-5b3a5b059c2a', '21806', 'Loan - Credit Line', 'liability', 'Non-Current Liabilities', 8332.33, 8332.33],
  ['85668d95-8793-4a45-ada4-a49fe0a8ccdb', '21807', 'Latitude Gem Visa', 'liability', 'Non-Current Liabilities', -2738.89, -3909.89],
  ['f45edef8-a898-4845-97b9-65f94f7d8397', '23000', 'Hire Purchase - Non Current', 'liability', 'Non-Current Liabilities', 22862.54, 22862.54],
  ['c76267d0-043e-4cc4-b403-733082c5dd03', '23005', 'Less: Unexpired Interest - Non Current', 'liability', 'Non-Current Liabilities', -2126.39, -2126.39],
]

export const URBAN_ROAD_BS_JUL_AUG_2026: BsRowInput[] = RAW.map(([account_id, account_code, account_name, account_type, section, jul, aug]) => {
  const balances_by_date: Record<string, number> = {}
  if (jul !== undefined) balances_by_date['2026-07-31'] = jul
  if (aug !== undefined) balances_by_date['2026-08-31'] = aug
  return { account_id, account_code, account_name, account_type, section, tenant_id: UR_TENANT, balances_by_date }
})

/** August 2026's P&L by type, as the mirror summed it. */
export const URBAN_ROAD_PL_AUG_2026: PlRowInput[] = [
  { tenant_id: UR_TENANT, account_type: 'revenue', monthly_values: { '2026-08': 527561.8 } },
  { tenant_id: UR_TENANT, account_type: 'cogs', monthly_values: { '2026-08': 232736.92 } },
  { tenant_id: UR_TENANT, account_type: 'opex', monthly_values: { '2026-08': 161315.3 } },
  // Foreign Currency Gains and Losses, which Calxa folds into 600 · Expense.
  { tenant_id: UR_TENANT, account_type: 'opex', monthly_values: { '2026-08': 919.25 } },
  { tenant_id: UR_TENANT, account_type: 'other_income', monthly_values: { '2026-08': 110.93 } },
]
