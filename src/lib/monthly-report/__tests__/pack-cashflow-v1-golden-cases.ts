/**
 * The pack's v1 cashflow — what every client without a cash_model prints —
 * pinned as it was at 80e8a5b3, before cash model v2. Urban Road's real Full
 * Year report, and the same report behind a forecast picked for the wrong
 * year, which is how JDS's backdated pack printed three pages of noughts.
 */
import { buildPackCashflowForecast, packCashflowBasisFor } from '../pack-cashflow'
import { buildPackCashflowRows } from '../pack-cashflow-rows'
import { packCashflowChartData } from '../pack-cashflow-chart'
import type { FinancialForecast } from '@/app/finances/forecast/types'
import { urbanRoadFullYear, UR_EXPENSE_GROUP_ORDER } from './urban-road-full-year-fixture'

const FY2027: FinancialForecast = {
  id: 'ur-fy2027', business_id: 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5', user_id: 'u', name: 'FY2027', fiscal_year: 2027, year_type: 'FY',
  actual_start_month: '2026-07', actual_end_month: '2026-08', forecast_start_month: '2026-09', forecast_end_month: '2027-06',
} as FinancialForecast

export function packV1GoldenCases(): { name: string; run: () => unknown }[] {
  const pages = (args: Parameters<typeof buildPackCashflowForecast>[0]) => {
    const cf = buildPackCashflowForecast(args)
    return {
      cashflow: cf,
      rows: cf ? buildPackCashflowRows(cf, UR_EXPENSE_GROUP_ORDER) : null,
      chart: cf ? packCashflowChartData(cf) : null,
      basis: packCashflowBasisFor(args.fullYear, args.reportMonth, cf),
    }
  }
  return [
    {
      name: 'Urban Road Aug 2026, no saved assumptions, opening read',
      run: () => pages({
        fullYear: urbanRoadFullYear(), reportMonth: '2026-08', forecast: FY2027, forecastLines: [],
        savedAssumptions: null, opening: { status: 'read', amount: 117986.53, asAt: '2026-06-30' },
      }),
    },
    {
      name: 'Urban Road Aug 2026, saved assumptions from a Xero sync, opening unavailable',
      run: () => pages({
        fullYear: urbanRoadFullYear(), reportMonth: '2026-08', forecast: FY2027, forecastLines: [],
        savedAssumptions: { dso_days: 19, dpo_days: 29, opening_trade_debtors: 267000, opening_trade_creditors: 479000, opening_gst_liability: 28000 },
        opening: { status: 'unavailable', asAt: '2026-06-30', reason: 'no synced balance sheet at 2026-06-30' },
      }),
    },
    {
      name: 'forecast for the wrong year (opening month mismatch)',
      run: () => pages({
        fullYear: urbanRoadFullYear(), reportMonth: '2026-08',
        forecast: { ...FY2027, actual_start_month: '2027-07', actual_end_month: '2027-07', forecast_start_month: '2027-08', forecast_end_month: '2028-06' },
        forecastLines: [], savedAssumptions: null, opening: { status: 'read', amount: 117986.53, asAt: '2026-06-30' },
      }),
    },
  ]
}
