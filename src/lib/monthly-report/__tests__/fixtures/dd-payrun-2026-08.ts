/**
 * Distinct Directions' August 2026 pay runs, as xero_payslip_lines holds them
 * (read 16 Sep 2026): four weekly runs on 7, 14, 21 and 28 August, 131 payslips,
 * $245,853.69 — Calxa p13's TOTAL — ALL AREAS $245,854.
 *
 * The roster is the one setup-dd.sql A06 places on dd-18-w-payroll_grid, in
 * Calxa's area order (p12-13: Head Office, Bathurst, Orange, Dubbo), with the
 * area P10 lets each entry carry. Weekly budgets are Calxa's whole dollars:
 * $61,396 a week, × 4 pay Fridays = Calxa's month budget $245,584. The approved
 * wages budget is the four "… Wages and Salaries" lines for August: $237,711.
 *
 * Start dates are Xero's (xero_employees). Billie Costello and Adam Davey left
 * before the employee sync and have no record; Elinor Anthoney started on 24
 * August and carries no budget yet. Felicity Crome is "Felicity Cummings" in
 * Xero and was paid $0 on 28 August.
 */
import type { PayslipRow, EmployeeRow, PayrollGrid } from '../../payroll-grid'
import { buildPayrollGrid } from '../../payroll-grid'

export const DD_RUNS = ['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28'] as const
export const DD_APPROVED_WAGES_AUG = 237711

type Pay = number | null
/** area, roster name, Xero payslip name, Xero EmployeeID, weekly budget, the four runs, Xero start date. */
type Staff = [string, string, string, string, number, [Pay, Pay, Pay, Pay], string | null]

export const DD_STAFF: Staff[] = [
  ['Head Office', 'Daniel Jarvis', 'Daniel Jarvis', '06fd2ce1-4076-4347-a7ed-a9ce67e437e8', 3185, [3185, 3185, 3185, 3185], '2016-07-01'],
  ['Head Office', 'Danielle Rimmer', 'Danielle Rimmer', '953c226c-5f71-40d5-98c0-c3de7e541de5', 1332, [1331.52, 1378.12, 1331.52, 1331.52], '2016-12-28'],
  ['Head Office', 'Lynda Jarvis', 'Lynda Jarvis', '0cf84e7c-6e56-454b-9e0b-c00f83cbeb7f', 1770, [1770, 1770, 1770, 1770], '2019-02-11'],
  ['Head Office', 'Georgia Lander', 'Georgia Lander', 'ed3787e3-3639-4979-b5f5-5713d285462b', 1250, [1250, 1250, 1250, 1250], '2025-02-28'],
  ['Head Office', 'Tanya Bushell', 'Tanya Bushell', '22e211f8-682f-4eea-847b-afd26e2b7198', 1250, [1250, 1249.99, 1250, 1249.99], '2021-12-06'],
  ['Head Office', 'Kathleen Davey', 'Kate Davey', '707c425f-39a0-4d2c-a6bb-251b570f018c', 2692, [2692.3, 2692.3, 2692.3, 2692.3], '2021-08-09'],
  ['Bathurst', 'James Baker', 'James Baker', '84a87517-afe8-458b-9af9-015ba4e56365', 2314, [2313.72, 2313.72, 2313.72, 2313.72], '2020-12-07'],
  ['Bathurst', 'Patrick Kelly', 'Patrick Kelly', '3fe3e4c9-1564-458b-8556-6eddd688dd54', 2212, [2211.54, 2211.54, 2539.79, 2211.54], '2021-11-08'],
  ['Bathurst', 'Emily Puddicombe', 'Emily Puddicombe', '0229f67d-7e28-4dc3-abee-b271a368fab8', 1481, [1480.77, 1480.77, 1480.77, 1480.77], '2019-03-01'],
  ['Bathurst', 'Peter Halvorson', 'Peter Halvorson', '2c773a63-1235-4586-8a3e-ca597df417a8', 1996, [1996.06, 1996.06, 1996.06, 1996.06], '2019-05-20'],
  ['Bathurst', 'Billie Costello', 'Billie Costello', 'd6eb310c-9305-460c-81ba-d67922f01b80', 1683, [871.71, null, null, null], null],
  ['Bathurst', 'Sarah Glynn', 'Sarah Glynn', 'e93d7f1b-4cb5-4e84-8792-5472183be5aa', 1827, [1845.91, 1826.92, 1850.96, 1826.92], '2020-09-03'],
  ['Bathurst', 'Adam Davey', 'Adam Davey', '7d36e830-1d50-4838-8c14-c03aef0830f2', 2692, [16298.8, null, null, null], null],
  ['Bathurst', 'Alana Langford', 'Alana Langford', '857b2064-7c3d-487a-87be-6d2f99a66c4b', 1856, [1484.61, 1494.31, 1855.77, 1484.62], '2024-08-05'],
  ['Bathurst', 'Emilia Remati', 'Emilia Remati', '12301c03-b733-4e9d-8450-b5b7ea1c26e9', 1757, [1663.88, 1869.77, 1859.68, 1970.78], '2024-11-29'],
  ['Bathurst', 'Kimberley Watson', 'Kimberley Watson', 'b182bbb4-fd4e-4dab-b416-93193d6befa8', 1250, [1250, 1250, 1250, 1255.04], '2025-01-10'],
  ['Bathurst', 'Bianca Pears', 'Bianca Pears', '930f9733-cd33-4866-9dda-128f6c429952', 2212, [2692.31, 2692.31, 2692.31, 2211.54], '2023-11-06'],
  ['Bathurst', 'Isabella Smith', 'Isabella Smith', '975b9426-1b4c-4d62-85b1-aa1d908c5a8f', 1547, [1659.72, 1556.7, 1692.04, 1821.32], '2025-03-19'],
  ['Bathurst', 'Shania Culbert', 'Shania Culbert', '00cd9cb0-2625-4ff3-b65e-52a325dbbd01', 1428, [1450.16, 1549.34, 1428.14, 357.03], '2024-08-26'],
  ['Bathurst', 'Amy Bedwell', 'Amy Bedwell', '82bb8dd5-78c2-4d18-ac71-562342ccb15b', 2115, [2256.58, 2123.06, 2127.1, 2287.28], '2025-07-25'],
  ['Bathurst', 'Nicolaas Van Zyl', 'Nicolaas Van Zyl', '7f6fa634-5d40-4173-9e84-7eeb86133e7a', 2404, [2403.85, 2403.85, 2403.85, 2403.84], '2026-02-09'],
  ['Bathurst', 'Sarah Morris', 'Sarah Morris', 'ed802803-45da-48ad-a35d-ddc5cd8d9448', 1712, [1716.58, 1830.72, 1887.49, 704.82], '2025-08-18'],
  ['Bathurst', 'Elinor Anthoney', 'Elinor Anthoney', '1eb3356b-4a92-425c-9795-32c5e8df36c2', 0, [null, null, null, 1384.62], '2026-08-24'],
  ['Orange', 'Jismi Joy', 'Jismi Joy', 'd073830c-7cac-4ae0-ba98-484befb0acad', 1822, [1822.31, 1822.31, 1822.31, 1822.31], '2023-12-11'],
  ['Orange', 'Grace Seaglove', 'Grace Seaglove', '3d8e8b9e-327f-4372-994d-909ad109c0a1', 1808, [1084.62, 1084.62, 1100.38, 1094.92], '2024-03-04'],
  ['Orange', 'Natalie Westgeest', 'Natalie Westgeest', 'e9f289cb-91c4-4d47-9bda-410fc561e560', 1635, [1634.61, 1652.21, 2039.63, 2089.93], '2024-09-30'],
  ['Orange', 'Katherine Ward', 'Katherine Ward', 'b703f898-ed69-47dd-963e-6e3bee17cc30', 1250, [1442.31, 1482.91, 1444.13, 1464.93], '2024-10-04'],
  ['Orange', 'Bradley Watts', 'Bradley Watts', '50d00d38-b634-46fa-bafd-45c27f13fcb8', 1731, [1730.9, 1730.9, 1730.9, 1834.93], '2025-02-26'],
  ['Orange', 'Elijah Beath', 'Elijah Beath', 'a8fe26e7-25f1-47df-838d-6f8b512ed86a', 1876, [1572.53, 1910.5, 1529.3, 1932.53], '2025-03-24'],
  ['Orange', 'Chloe Wade', 'Chloe Wade', '85f1695d-0e1c-4d17-bbe1-ea9fdc1d7c87', 1442, [1672.58, 1442.3, 1550.89, 1522.31], '2026-01-19'],
  ['Orange', 'Annie Bell', 'Annie Bell', 'e133bbec-4aad-4a1a-89d7-74b33c1a6744', 1692, [1692.31, 1700.79, 2016.08, 1886.23], '2025-05-30'],
  ['Orange', 'Felicity Crome', 'Felicity Cummings', '7ac01b65-33ad-4187-a2ac-43c712f0569f', 1063, [1099.11, 725.67, 1099.11, 0], '2020-06-16'],
  ['Dubbo', 'Rebecca Jarvis', 'Rebecca Jarvis', '36d92ca3-1cf6-420b-a1f1-70a0a3f16ee3', 2115, [2123.66, 2135.59, 2142.26, 2123.86], '2024-01-08'],
  ['Dubbo', 'Madison Wykes', 'Madison Wykes', '45292b4b-e860-4b6d-90b0-ca3c319f6224', 1459, [1483.48, 1755.17, 1469.34, 1487.52], '2025-08-11'],
  ['Dubbo', 'Kundai Mufandaedza', 'Kundai Mufandaedza', 'fb580f14-f2a5-428c-afb7-ae497d804a5b', 1538, [1559.06, 1562.9, 1750.26, 1731.57], '2025-11-03'],
]

/** Every August payslip, with the pay period Xero stores on it. */
export const DD_PAYSLIPS: PayslipRow[] = DD_STAFF.flatMap(([, , payslipName, id, , pays]) =>
  DD_RUNS.flatMap((date, i) => {
    const wages = pays[i]
    if (wages === null) return []
    const end = new Date(`${date}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() - 1)
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 6)
    return [{
      employee_id: id,
      employee_name: payslipName,
      payment_date: date,
      wages,
      super_amount: Math.round(wages * 12) / 100,
      calendar_type: 'WEEKLY',
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
    }]
  }))

export const DD_EMPLOYEES: EmployeeRow[] = DD_STAFF
  .filter(([, , , , , , start]) => start !== null)
  .map(([, , payslipName, id, , , start]) => ({ employee_id: id, start_date: start, termination_date: null, name: payslipName }))

/** setup-dd.sql's roster, with the area Calxa prints each person under. */
export const DD_ROSTER = DD_STAFF.map(([area, name, , id, weekly]) => ({ name, employee_id: id, area, weekly_salary: weekly }))

/** The roster as A06 placed it before P10: no areas. */
export const DD_ROSTER_WITHOUT_AREAS = DD_ROSTER.map(({ area: _area, ...rest }) => rest)

export function ddGrid(): PayrollGrid {
  return buildPayrollGrid(DD_PAYSLIPS, DD_EMPLOYEES, ['2026-08'], { '2026-08': DD_APPROVED_WAGES_AUG })
}

/** Calxa p12-13's area totals: Month actual and Month budget (weekly × 4). */
export const CALXA_AREA_TOTALS = {
  'Head Office': { actual: 45962, budget: 45916 },
  Bathurst: { actual: 123283, budget: 121944 },
  Orange: { actual: 55284, budget: 57276 },
  Dubbo: { actual: 21325, budget: 20448 },
} as const
