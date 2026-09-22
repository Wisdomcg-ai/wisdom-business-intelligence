/**
 * B2 (22 Sep 2026): the plan period showed — and SAVED — one day early in
 * Australia. Dates built at local midnight went through toISOString(), the
 * UTC date. Prod had three plans stored ending 29 June.
 *
 * Every test runs with toISOString behaving as it does in Sydney, so they fail
 * on the old code in any timezone (CI runs in UTC, which hid this).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { simulateSydneyToISOString } from '../helpers/simulate-sydney-iso'

const upsertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ upsert: upsertMock }) }),
}))

import { PlanPeriodAdjustModal } from '@/app/goals/components/PlanPeriodAdjustModal'
import { FinancialService } from '@/app/goals/services/financial-service'

beforeEach(() => {
  upsertMock.mockClear()
  simulateSydneyToISOString()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

const period = {
  planStartDate: new Date(2026, 6, 1),  // 1 Jul 2026, local midnight — as suggestPlanPeriod builds it
  year1EndDate: new Date(2027, 5, 30),  // 30 Jun 2027
  planEndDate: new Date(2029, 5, 30),   // 30 Jun 2029
}

describe('Plan period dates in Australia', () => {
  it('the adjust dialog shows the dates the plan actually has', () => {
    render(
      <PlanPeriodAdjustModal
        initialPlanStart={period.planStartDate}
        initialYear1End={period.year1EndDate}
        initialPlanEnd={period.planEndDate}
        fiscalYearStart={7}
        onClose={() => {}}
        onSave={() => {}}
      />,
    )
    const values = Array.from(document.querySelectorAll('input[type="date"]')).map((i) => (i as HTMLInputElement).value)
    expect(values).toEqual(['2026-07-01', '2027-06-30', '2029-06-30'])
  })

  it('saving stores 1 July – 30 June, not 30 June – 29 June', async () => {
    await FinancialService.saveFinancialGoals('biz-1', 'user-1', {} as never, 'FY', undefined, undefined, undefined, period)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      plan_start_date: '2026-07-01',
      year1_end_date: '2027-06-30',
      plan_end_date: '2029-06-30',
    })
  })
})
