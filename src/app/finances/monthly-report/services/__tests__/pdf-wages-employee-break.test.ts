/**
 * The Wages Analysis page's employee table never leaves a name alone on a
 * page. JDS's April 2026 pack printed page 14 as the repeated table header and
 * "Katrina Liddell 2,893" — nothing else — because the roster ran one row past
 * the foot of page 13. Matt keeps the Wages page for every client, so any
 * roster of the wrong length gets the same near-empty page.
 *
 * The property, over every roster length around the break: each page that
 * carries employee rows carries at least three of them (or all of them, when
 * there are fewer).
 */
import { describe, it, expect, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, textRuns } from './pdf-pack-fixture'
import type { WagesDetailData } from '../../types'

const name = (i: number) => `Staff Member ${String(i).padStart(2, '0')}`

function wages(employees: number): WagesDetailData {
  return {
    accounts: [
      { account_name: 'Wages & Salaries', budget: 0, actual: 240_262, variance: 0, variance_percent: 0 } as any,
      { account_name: 'Superannuation', budget: 0, actual: 27_885, variance: 0, variance_percent: 0 } as any,
    ],
    budget_provenance: { source: 'none', reason: 'no_version_in_force', fiscal_year: 2026 },
    employee_plan_available: false,
    employees: Array.from({ length: employees }, (_, i) => ({
      name: name(i + 1),
      actual_total: 20_000 - i * 100,
      budget_total: 0,
      variance: 0,
    })) as any,
    employee_totals: { actual: 0, budget: 0, variance: 0 },
    grand_total: { actual: 268_147, budget: 0, variance: 0 },
    payroll_available: true,
    pay_run_dates: [],
  }
}

/** How many employee rows each page draws, for the pages that draw any. */
function employeeRowsPerPage(doc: any, employees: number): number[] {
  const names = new Set(Array.from({ length: employees }, (_, i) => name(i + 1)))
  const counts: number[] = []
  for (let p = 1; p <= doc.internal.getNumberOfPages(); p++) {
    const n = textRuns(doc, p).filter((r) => names.has(r)).length
    if (n > 0) counts.push(n)
  }
  return counts
}

describe('Wages Analysis — the employee table leaves no orphan', () => {
  it('every page carrying employees carries at least three, at every roster length around the break', () => {
    const orphans: string[] = []
    for (let employees = 14; employees <= 64; employees++) {
      const doc: any = new MonthlyReportPDFService(fixtureReport({ budget_source: 'forecast' } as any), {
        wagesDetail: wages(employees),
      }).generate()
      const perPage = employeeRowsPerPage(doc, employees)
      // Every name still prints, once.
      expect(perPage.reduce((s, n) => s + n, 0), `${employees} employees`).toBe(employees)
      if (perPage.some((n) => n < Math.min(3, employees))) orphans.push(`${employees}: ${perPage.join('+')}`)
    }
    expect(orphans).toEqual([])
  })
})
