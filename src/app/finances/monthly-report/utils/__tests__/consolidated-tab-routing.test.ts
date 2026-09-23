/**
 * IICT-01 — a coach could not generate or export any IICT pack.
 *
 * IICT Group has an HKD org, so the page's multi-currency redirect moved every
 * coach from Budget vs Actual to the Consolidated P&L tab. Generate Report was
 * drawn on Budget vs Actual only, and Export, Finalise and Memo appear only
 * once a report exists — so the tab IICT landed on had no way to make one.
 *
 * The redirect guarded against the unconverted sum, and that was never what a
 * consolidation parent's Budget vs Actual tab shows: useMonthlyReport generates
 * it through the consolidation engine, HKD translated. These tests pin where a
 * viewer lands and where the report's controls are drawn, and that nothing
 * changes for a business that is not a consolidation parent.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  multiCurrencyRedirectTarget,
  showsReportControls,
  generateAccess,
  showsFxRatesOnReportTab,
  CONSOLIDATED_COACH_ONLY_MESSAGE,
} from '../consolidated-tab-routing'
import type { ReportTab } from '../../types'

const ALL_TABS: ReportTab[] = [
  'report', 'full-year', 'trends', 'charts', 'subscriptions', 'wages', 'cashflow',
  'balance-sheet', 'balance-sheet-consolidated', 'cashflow-consolidated',
  'external-data', 'mapping', 'history', 'consolidated',
]
const ROLES = ['coach', 'super_admin', 'client'] as const

/** The redirect exactly as page.tsx wrote it before this change. */
function redirectBefore(activeTab: ReportTab, isMultiCurrency: boolean, userRole: (typeof ROLES)[number]): ReportTab | null {
  if (!isMultiCurrency || userRole === 'client') return null
  const consolEquivalent: Partial<Record<ReportTab, ReportTab>> = {
    report: 'consolidated',
    'balance-sheet': 'balance-sheet-consolidated',
    cashflow: 'cashflow-consolidated',
  }
  return consolEquivalent[activeTab] ?? null
}

describe('multiCurrencyRedirectTarget', () => {
  it('keeps a coach on Budget vs Actual for a multi-currency consolidation parent (IICT)', () => {
    for (const userRole of ['coach', 'super_admin'] as const) {
      expect(multiCurrencyRedirectTarget({ activeTab: 'report', isMultiCurrency: true, isConsolidationGroup: true, userRole })).toBeNull()
    }
  })

  it('still moves the single-entity Balance Sheet and Cashflow tabs, which sum orgs without FX', () => {
    const base = { isMultiCurrency: true, isConsolidationGroup: true, userRole: 'coach' as const }
    expect(multiCurrencyRedirectTarget({ ...base, activeTab: 'balance-sheet' })).toBe('balance-sheet-consolidated')
    expect(multiCurrencyRedirectTarget({ ...base, activeTab: 'cashflow' })).toBe('cashflow-consolidated')
  })

  it('does not move Budget vs Actual while the connection count is still being read', () => {
    expect(multiCurrencyRedirectTarget({ activeTab: 'report', isMultiCurrency: true, isConsolidationGroup: null, userRole: 'coach' })).toBeNull()
  })

  it('is unchanged for every business that is not a consolidation parent', () => {
    for (const activeTab of ALL_TABS) {
      for (const userRole of ROLES) {
        for (const isMultiCurrency of [false, true]) {
          expect(
            multiCurrencyRedirectTarget({ activeTab, isMultiCurrency, isConsolidationGroup: false, userRole }),
          ).toBe(redirectBefore(activeTab, isMultiCurrency, userRole))
        }
      }
    }
  })

  it('is unchanged for every all-AUD business, consolidated or not', () => {
    for (const activeTab of ALL_TABS) {
      for (const userRole of ROLES) {
        for (const isConsolidationGroup of [null, false, true]) {
          expect(multiCurrencyRedirectTarget({ activeTab, isMultiCurrency: false, isConsolidationGroup, userRole })).toBeNull()
        }
      }
    }
  })
})

describe('showsReportControls', () => {
  it('draws Generate, the reconciliation gate and the report error on Budget vs Actual for everyone', () => {
    expect(showsReportControls('report', false)).toBe(true)
    expect(showsReportControls('report', true)).toBe(true)
  })

  it('also draws them on the Consolidated P&L tab a coach of a consolidation parent may land on', () => {
    expect(showsReportControls('consolidated', true)).toBe(true)
  })

  it('draws them on no other tab, and never for a viewer who cannot see the consolidated tab', () => {
    for (const tab of ALL_TABS.filter((t) => t !== 'report')) {
      expect(showsReportControls(tab, false)).toBe(false)
    }
    for (const tab of ALL_TABS.filter((t) => t !== 'report' && t !== 'consolidated')) {
      expect(showsReportControls(tab, true)).toBe(false)
    }
  })
})

describe('showsFxRatesOnReportTab', () => {
  // The Consolidated P&L tab — where the redirect used to put IICT's coaches —
  // carries the missing-exchange-rate banner. Budget vs Actual is where they
  // land now, and it prints the same translated figures, so it carries it too.
  it('for a coach of a multi-currency consolidation parent on Budget vs Actual', () => {
    expect(showsFxRatesOnReportTab('report', true, true)).toBe(true)
  })

  it('never for an all-AUD business, a viewer who cannot see the consolidation, or another tab', () => {
    expect(showsFxRatesOnReportTab('report', false, true)).toBe(false)
    expect(showsFxRatesOnReportTab('report', true, false)).toBe(false)
    expect(showsFxRatesOnReportTab('report', false, false)).toBe(false)
    for (const tab of ALL_TABS.filter((t) => t !== 'report')) {
      expect(showsFxRatesOnReportTab(tab, true, true)).toBe(false)
    }
  })
})

describe('generateAccess (DRG-51)', () => {
  it('a client of a consolidation parent is told the report is prepared by their coach', () => {
    expect(generateAccess(true, 'client')).toBe('coach_only')
    expect(CONSOLIDATED_COACH_ONLY_MESSAGE).toMatch(/coach/)
    expect(CONSOLIDATED_COACH_ONLY_MESSAGE).toMatch(/Report History/)
  })

  it('coaches and admins generate; single-entity clients generate exactly as before', () => {
    for (const isConsolidationGroup of [null, false, true]) {
      expect(generateAccess(isConsolidationGroup, 'coach')).toBe('generate')
      expect(generateAccess(isConsolidationGroup, 'super_admin')).toBe('generate')
    }
    expect(generateAccess(false, 'client')).toBe('generate')
    expect(generateAccess(null, 'client')).toBe('generate')
  })
})

describe('page.tsx uses these rules', () => {
  const page = readFileSync(resolve(__dirname, '../../page.tsx'), 'utf8')

  it('the redirect effect asks multiCurrencyRedirectTarget, with the consolidation detection', () => {
    expect(page).toMatch(/multiCurrencyRedirectTarget\(\{[^}]*isConsolidationGroup/)
    expect(page).not.toMatch(/const consolEquivalent/)
  })

  it('Generate, the gate and the report error are drawn where showsReportControls says', () => {
    const uses = page.match(/showsReportControls\(activeTab, canSeeConsolidated\)/g) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(1)
    expect(page).not.toMatch(/\{activeTab === 'report' && !report && mappings\.length > 0 && \(/)
    expect(page).not.toMatch(/\{reportError && activeTab === 'report' && \(/)
    expect(page).toMatch(/generateAccess\(isConsolidationGroup, userRole\)/)
  })

  it('Budget vs Actual loads and shows the missing exchange rates where showsFxRatesOnReportTab says', () => {
    const uses = page.match(/showsFxRatesOnReportTab\(activeTab, isMultiCurrency, canSeeConsolidated\)/g) ?? []
    // Once to load the consolidation, once to draw the banner.
    expect(uses.length).toBeGreaterThanOrEqual(2)
  })
})

describe('page.tsx month change (DRG-16)', () => {
  // Export reuses the consolidated report the page already holds for the
  // per-entity page. Budget vs Actual now loads it on landing for IICT, so a
  // coach who then picks another month and exports would print the landing
  // month's entity figures under the new month's heading.
  const page = readFileSync(resolve(__dirname, '../../page.tsx'), 'utf8')

  it('clears the consolidated P&L and balance-sheet caches with the rest of the month-scoped state', () => {
    const start = page.indexOf('const handleMonthChange = async')
    expect(start).toBeGreaterThan(0)
    const body = page.slice(start, page.indexOf('const snapshot = await loadSnapshot(month)', start))
    expect(body).toMatch(/clearConsolidated\(\)/)
    expect(body).toMatch(/clearConsolidatedBS\(\)/)
  })
})
