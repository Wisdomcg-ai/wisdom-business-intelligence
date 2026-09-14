/**
 * Urban Road Pty Ltd's Full Year report as the August 2026 pack loads it
 * (full-year-load, FY2027, actuals to 2026-08), read from production on
 * 14 Sep 2026 and trimmed to what the cashflow pages consume: each account's
 * code, name, mapping group, the July and August actuals and the approved
 * budget (version 72c658c0) for every month.
 *
 * Real figures, so the tests pin the page Calxa's pack is compared against —
 * the Repairs & Maintenance Warehouse credits, the accounts the engine's
 * keywords misfiled, the rows whose first cash month is late.
 */
import type { FullYearReport } from '@/app/finances/monthly-report/types'

export const UR_MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"] as const

export const UR_EXPENSE_GROUP_ORDER = ["Employment Expense", "Travel & Accommodation", "Professional Expense", "IT Hardware and Software", "Marketing and Advertising", "Occupancy Expense", "Foreign Currency Gains and Losses", "Bank and Other Fees", "Other Operating Expenses"]

type Row = [code: string, name: string, group: string | null, actual: [number, number], approved: number[]]

const SECTIONS: Record<string, Row[]> = {
  "Revenue": [
    ["200", "Sales", null, [65, 157.63], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["41000", "Canvas Sales", null, [337401.88, 295826.71], [279320, 279320, 279320, 279320, 510180, 279320, 279320, 277820, 276170, 274355, 272359, 369102]],
    ["41120", "Commercial Sales", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["41130", "Materialised", null, [0, 0], [450, 450, 450, 450, 800, 450, 450, 450, 450, 450, 450, 600]],
    ["41140", "USA Sales", null, [15418.08, 8322.25], [15000, 15000, 15000, 15000, 15000, 15000, 15000, 16500, 18150, 19965, 21962, 24158]],
    ["41150", "NZ Sales", null, [1320.91, 50837.52], [2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500]],
    ["41200", "Rolled Prints", null, [2593.78, 3221.53], [5355, 5355, 5355, 5355, 9520, 5355, 5355, 5355, 5355, 5355, 5355, 7140]],
    ["41300", "Decor Sales", null, [12158.72, 16622.86], [8595, 8595, 8595, 8595, 15280, 8595, 8595, 8595, 8595, 8595, 8595, 11460]],
    ["41350", "Furniture Sales", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["41600", "Framed Prints (41600)", null, [54874.16, 50806.62], [59850, 59850, 59850, 59850, 106400, 59850, 59850, 59850, 59850, 59850, 59850, 79800]],
    ["41700", "Posters (41700)", null, [56076.86, 66911.11], [52920, 52920, 52920, 52920, 94080, 52920, 52920, 52920, 52920, 52920, 52920, 70560]],
    ["41750", "Wallpaper", null, [1093.3, 3040.56], [4995, 4995, 4995, 4995, 8880, 4995, 4995, 4995, 4995, 4995, 4995, 6660]],
    ["42010", "Sales Discounts (Zoho)", null, [-5558.8, -2257.7], [-14715, -14715, -14715, -14715, -26160, -14715, -14715, -14715, -14715, -14715, -14715, -19620]],
    ["43000", "POD Exchange Income", null, [789.01, 149.05], [1710, 1710, 1710, 1710, 3040, 1710, 1710, 1710, 1710, 1710, 1710, 2280]],
    ["44000", "Shipping", null, [41583.24, 36699.46], [42120, 42120, 42120, 42120, 74880, 42120, 42120, 42120, 42120, 42120, 42120, 56160]],
    ["44250", "Services", null, [0, 4200], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["46000", "Other Income", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["48000", "Returns & Allowances", null, [-22599.11, -6975.8], [-8100, -8100, -8100, -8100, -14400, -8100, -8100, -8100, -8100, -8100, -8100, -10800]],
  ],
  "Cost of Sales": [
    ["310", "Cost of Goods Sold", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["51100", "Antons Canvas", null, [208264.77, 156163.37], [172488, 172488, 172488, 172488, 313363, 172488, 172488, 171748, 170934, 170038, 169053, 228344]],
    ["51150", "Posters", null, [33710.98, 0], [26037, 26037, 26037, 26037, 46287, 26037, 26037, 26037, 26037, 26037, 26037, 34716]],
    ["51160", "Canvas Jondo", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["51210", "Rugs", null, [151.87, 326.48], [336, 336, 336, 336, 336, 336, 336, 336, 336, 336, 336, 336]],
    ["51215", "Furniture Import", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["51216", "Art Import", null, [4834.58, 5042.36], [0, 0, 15000, 0, 0, 15000, 0, 0, 0, 0, 15000, 0]],
    ["51220", "Design images - No royalty", null, [37.09, 36.62], [135, 135, 135, 135, 240, 135, 135, 135, 135, 135, 135, 180]],
    ["51300", "International Orders", null, [7317.53, 11641.59], [8235, 8235, 8235, 8235, 14640, 8235, 8235, 8235, 8235, 8235, 8235, 10980]],
    ["51400.1", "Commercial Orders", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["51400.2", "Cushions & Decor", null, [4685.01, 7010.17], [1035, 1035, 1035, 1035, 1840, 1035, 1035, 1035, 1035, 1035, 1035, 1380]],
    ["51500", "Art Supplies", null, [0, 116.92], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["51550", "Packaging", null, [0, 0], [360, 360, 360, 360, 640, 360, 360, 360, 360, 360, 360, 480]],
    ["51600", "Australian Raw Materials", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["51601", "Australian Suppliers", null, [0, 0], [226, 226, 226, 226, 226, 226, 226, 226, 226, 226, 226, 226]],
    ["51700", "Artwork Scanning", null, [900, 0], [135, 135, 135, 135, 240, 135, 135, 135, 135, 135, 135, 180]],
    ["52600", "Commissions Agents", null, [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["52700", "Artist Commissions", null, [4.86, 1474.46], [10710, 10710, 10710, 10710, 19040, 10710, 10710, 10710, 10710, 10710, 10710, 14280]],
    ["53000", "Customs,Duties & Shipping", null, [6603.11, 0], [0, 0, 0, 6600, 0, 0, 6600, 0, 0, 0, 0, 6600]],
    ["55000", "Freight to Customer", null, [51102, 50924.95], [45000, 45000, 45000, 45000, 80000, 45000, 45000, 45000, 45000, 45000, 45000, 60000]],
  ],
  "Operating Expenses": [
    ["100000", "Stripe Fees", "Bank and Other Fees", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["497", "Bank Revaluations", "Bank and Other Fees", [0, 0], [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]],
    ["60100", "Accounting Fees", "Professional Expense", [787.5, 0], [900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900]],
    ["60500", "Bad Debts from Sales", "Other Operating Expenses", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["60550", "Bank Fees", "Bank and Other Fees", [11.01, 11], [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15]],
    ["60560", "Bank & Credit Card Interest", "Bank and Other Fees", [481.24, 484.92], [300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300]],
    ["60570", "Shopify Fees", "Bank and Other Fees", [4148.16, 2623.08], [4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000]],
    ["60700", "Bookkeeping Fees", "Professional Expense", [1265, 1265], [1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300]],
    ["61400", "Contractors excl. Artists", "Other Operating Expenses", [29910.6, 31029.3], [28007, 28375, 28525, 28525, 28525, 30925, 30187, 30187, 30187, 30187, 30187, 30187]],
    ["62130", "Employ - Staff Amenities", "Employment Expense", [129.04, 1240.81], [450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450]],
    ["62150", "Employ - Staff Recruitment", "Employment Expense", [208.16, 208.16], [208, 208, 208, 208, 208, 208, 208, 208, 208, 208, 208, 208]],
    ["62160", "Employ - Superannuation", "Employment Expense", [5041.88, 6302.35], [5042, 6302, 5042, 5042, 6302, 5042, 5375, 5375, 6718, 5375, 6718, 5375]],
    ["62170", "Employ - Wages & Salaries", "Employment Expense", [42015.4, 52519.25], [42015, 52519, 42015, 42015, 52519, 42015, 44788, 44788, 55986, 44788, 55986, 44788]],
    ["62180", "Employ - Workers' Compensation", "Employment Expense", [0, 0], [0, 0, 911, 911, 911, 911, 911, 911, 911, 911, 911, 911]],
    ["62190", "Employ - Other Expenses", "Employment Expense", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["62500", "Electricity", "Occupancy Expense", [1503.22, 0], [1500, 0, 0, 1500, 0, 0, 1500, 0, 0, 1500, 0, 0]],
    ["62700", "Foreign Currency Gains and Losses", "Foreign Currency Gains and Losses", [238.61, 919.25], [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]],
    ["62800", "General Expenses", "Other Operating Expenses", [0, 0], [2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500]],
    ["63100", "Office Expenses", "Occupancy Expense", [0, 0], [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]],
    ["63200", "Cleaning", "Occupancy Expense", [921.46, 572.18], [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]],
    ["63500", "Insurance excl Workers Comp", "Other Operating Expenses", [2188.24, 2188.24], [2188, 2188, 2188, 0, 0, 0, 0, 0, 2188, 2188, 2188, 2188]],
    ["63552", "Interest - ATO", "Other Operating Expenses", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["63560", "Internal Moving Costs", "Other Operating Expenses", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["63700", "IT Costs Software", "IT Hardware and Software", [13764.27, 14725.73], [13862, 13697, 15664, 13697, 13697, 13697, 13697, 13697, 14116, 15664, 13697, 13697]],
    ["63705", "IT Costs Hardware", "IT Hardware and Software", [0, 0], [300, 300, 300, 300, 300, 1700, 300, 300, 300, 300, 300, 300]],
    ["63710", "IT Website & App Design and Maintenance", "IT Hardware and Software", [0, 0], [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]],
    ["64100", "Legal Fees", "Professional Expense", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["64200", "Licence Fees", "Bank and Other Fees", [0, 10], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["64550", "Marketing - Advertising", "Marketing and Advertising", [0, 137.54], [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]],
    ["64570", "Marketing - Affiliate", "Marketing and Advertising", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["64600", "Marketing Digital Ad Spend", "Marketing and Advertising", [19175.27, 23143.86], [20000, 20000, 20000, 30000, 40000, 20000, 20000, 20000, 20000, 20000, 20000, 30000]],
    ["64610", "Marketing Digital Services", "Marketing and Advertising", [9430.34, 9245.14], [9500, 9500, 9500, 9500, 9500, 9500, 9500, 9500, 9500, 9500, 9500, 9500]],
    ["64780", "Research & Development Samples", "Other Operating Expenses", [0, 0], [250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250]],
    ["64850", "Marketing - Trade Shows", "Marketing and Advertising", [5972.31, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["64860", "Marketing - Props/Photography", "Marketing and Advertising", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["64900", "Memberships & Registrations", "Bank and Other Fees", [188.28, 376.55], [225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225]],
    ["65400", "Merchant Fees", "Bank and Other Fees", [2213.58, 1926.21], [2200, 2200, 2200, 2200, 2200, 2200, 2200, 2200, 2200, 2200, 2200, 2200]],
    ["65600", "Printing & Stationery", "Other Operating Expenses", [436.05, 199.31], [375, 375, 375, 375, 375, 375, 375, 375, 375, 375, 375, 375]],
    ["66000", "Rent - Office", "Occupancy Expense", [6881.76, 6881.76], [6882, 6882, 6882, 6882, 6882, 6882, 6882, 6882, 6882, 6882, 6882, 6882]],
    ["66001", "Outgoings", "Occupancy Expense", [2574.57, 2574.57], [2575, 2575, 2575, 2575, 2575, 2575, 2575, 2575, 2575, 2575, 2575, 2575]],
    ["66400", "Repairs & Maintenance Warehouse", "Occupancy Expense", [-502.83, -132.83], [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]],
    ["67600", "Storage", "Occupancy Expense", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["68000", "Telephone & Internet", "Occupancy Expense", [3264.18, 299.14], [350, 350, 350, 350, 350, 350, 350, 350, 350, 350, 350, 350]],
    ["68700", "Training & Seminars", "Other Operating Expenses", [2750, 2750], [2750, 2750, 2750, 2750, 2750, 2750, 2750, 2750, 2750, 2750, 2750, 2750]],
    ["68850", "T/E - Accom, Meals-Aust Travel", "Travel & Accommodation", [347.39, 0], [250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250]],
    ["68860", "T/E - Accom, Meals -OS Travel", "Travel & Accommodation", [1253.91, 0], [3250, 3250, 3250, 3250, 3250, 3250, 4750, 250, 250, 250, 250, 250]],
    ["68950", "T/E - Air Fares/Taxis - Aust", "Travel & Accommodation", [102.59, 129.54], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["68960", "T/E - Air Fares/Taxis - O'seas", "Travel & Accommodation", [4350.33, 582.54], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["69200", "T/E - Trade Shows", "Travel & Accommodation", [2522.04, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["69500", "USA Company Expenses", "Occupancy Expense", [22.28, 21.95], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["91200", "Donations", "Other Operating Expenses", [0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ],
  "Other Income": [
    ["81000", "Bank Interest Income", null, [57.87, 110.93], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ],
}

export function urbanRoadFullYear(): FullYearReport {
  return {
    business_id: '28d41193-38ae-4071-a2b1-0dbea90a38fd',
    fiscal_year: 2027,
    last_actual_month: '2026-08',
    expense_group_order: [...UR_EXPENSE_GROUP_ORDER],
    sections: Object.entries(SECTIONS).map(([category, rows]) => ({
      category,
      lines: rows.map(([account_code, account_name, group, actual, approved]) => ({
        account_code, account_name, group, category,
        months: UR_MONTHS.map((month, i) => ({
          month,
          actual: i < 2 ? actual[i] : 0,
          budget: approved[i],
          approved_budget: approved[i],
          prior_year: 0,
          source: i < 2 ? 'actual' : 'forecast',
        })),
        projected_total: 0, annual_budget: 0, approved_annual_budget: 0, variance_amount: 0, variance_percent: 0,
      })),
    })),
  } as unknown as FullYearReport
}
