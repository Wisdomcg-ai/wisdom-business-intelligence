/**
 * Provenance banners are keyed on `state.seedSource.kind === 'xero_budget'`
 * and say nothing otherwise. Step 1 (goals) and Step 6 (OpEx chip) are the
 * two places an operator meets the seed first.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { XeroBudgetSeedBanner } from '@/app/finances/forecast/components/wizard-v4/XeroBudgetSeedBanner'
import { Step1Goals } from '@/app/finances/forecast/components/wizard-v4/steps/Step1Goals'
import { Step5OpEx } from '@/app/finances/forecast/components/wizard-v4/steps/Step5OpEx'
import type { ForecastWizardState, WizardActions, OpExLine, RevenueLine } from '@/app/finances/forecast/components/wizard-v4/types'
import type { ForecastSeedSource } from '@/lib/services/xero-budget-seed-service'

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear()
})

const SRC: ForecastSeedSource = {
  kind: 'xero_budget', tenantId: 't-1', orgName: 'Urban Road Pty Ltd', functionalCurrency: 'AUD',
  budgetId: 'b-1', budgetName: 'Overall Budget', budgetType: 'OVERALL', budgetUpdatedAt: null,
  seededAt: '2026-09-06T22:32:09.404Z',
  coverage: { firstPeriod: '2026-07', lastPeriod: '2027-06', monthsInFY: 12, monthsFilled: 0 },
  teamCostBudgetTotal: 990_492.78, unclassifiedCount: 2,
}

const FY_START_YEAR = 2026
function fyKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1
    const year = calMonth >= 7 ? FY_START_YEAR : FY_START_YEAR + 1
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`)
  }
  return keys
}
const KEYS = fyKeys()
const flat = (v: number) => Object.fromEntries(KEYS.map((k) => [k, v]))

function makeStubActions(): WizardActions {
  const names = [
    'goToStep', 'nextStep', 'prevStep', 'setActiveYear', 'setBusinessProfile', 'setForecastDuration', 'updateGoals',
    'setPriorYear', 'setRevenuePattern', 'setRevenueLines', 'setCOGSLines', 'updateRevenueLine', 'addRevenueLine',
    'removeRevenueLine', 'updateCOGSLine', 'addCOGSLine', 'removeCOGSLine', 'updateTeamMember', 'addTeamMember',
    'removeTeamMember', 'addNewHire', 'updateNewHire', 'removeNewHire', 'addDeparture', 'removeDeparture', 'addBonus',
    'updateBonus', 'removeBonus', 'addCommission', 'updateCommission', 'removeCommission', 'setDefaultOpExIncreasePct',
    'setOpExLines', 'updateOpExLine', 'addOpExLine', 'removeOpExLine', 'addCapExItem', 'updateCapExItem',
    'removeCapExItem', 'addInvestment', 'updateInvestment', 'removeInvestment', 'addPlannedSpend', 'updatePlannedSpend',
    'removePlannedSpend', 'addOtherExpense', 'updateOtherExpense', 'removeOtherExpense', 'initializeFromXero',
    'saveDraft', 'generateForecast', 'setSeedSource', 'setPlanPeriod', 'setForecastIdentity', 'hydrateForecastDuration',
    'buildAssumptions', 'setDefaultPayFrequency', 'mergeSavedOpExLines', 'setNeedsAccountCodeRefresh',
  ] as const
  const obj: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const n of names) obj[n] = vi.fn()
  return obj as unknown as WizardActions
}

function makeState(over: Partial<ForecastWizardState> = {}): ForecastWizardState {
  const revLine: RevenueLine = { id: 'rev-1', name: 'Services', year1Monthly: flat(100_000) }
  return {
    wizardVersion: 10,
    businessId: 'test-business-banners',
    fiscalYearStart: FY_START_YEAR,
    status: 'draft',
    forecastDuration: 1,
    durationLocked: false,
    currentStep: 1,
    activeYear: 1,
    businessProfile: null,
    goals: {
      year1: { revenue: 6_028_196, grossProfitPct: 41.1, netProfitPct: 8.8 },
      year2: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
      year3: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
    },
    priorYear: null,
    currentYTD: null,
    revenuePattern: 'seasonal',
    revenueLines: [revLine],
    cogsLines: [],
    teamMembers: [],
    newHires: [],
    departures: [],
    bonuses: [],
    commissions: [],
    defaultOpExIncreasePct: 3,
    opexLines: [],
    capexItems: [],
    investments: [],
    plannedSpends: [],
    subscriptions: [],
    maxVisitedStep: 1,
    seedSource: null,
    ...over,
  } as unknown as ForecastWizardState
}

const BUDGETED: OpExLine = { id: 'opex-rent', name: 'Rent - Office', accountCode: '66000', priorYearAnnual: 106_916, costBehavior: 'budgeted', budgetedMonthly: flat(6_882) }
const FIXED: OpExLine = { id: 'opex-clean', name: 'Cleaning', accountCode: '63200', priorYearAnnual: 11_905, costBehavior: 'fixed', monthlyAmount: 541 }

describe('XeroBudgetSeedBanner', () => {
  it('renders nothing without a Xero-budget seed', () => {
    const { container } = render(<XeroBudgetSeedBanner seedSource={null}>hello</XeroBudgetSeedBanner>)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders its message for a Xero-budget seed', () => {
    render(<XeroBudgetSeedBanner seedSource={SRC}>Started from the budget</XeroBudgetSeedBanner>)
    expect(screen.getByRole('note')).toHaveTextContent('Started from the budget')
  })
})

describe('Step 1 goals banner', () => {
  it('names the budget and the org when the forecast was seeded from Xero', () => {
    render(<Step1Goals state={makeState({ seedSource: SRC })} actions={makeStubActions()} fiscalYear={2027} />)
    const note = screen.getByTestId('xero-budget-seed-banner')
    expect(note).toHaveTextContent('Goals pre-filled from Xero budget')
    expect(note).toHaveTextContent('“Overall Budget”')
    expect(note).toHaveTextContent('Urban Road Pty Ltd')
  })
  it('is absent for a hand-built forecast', () => {
    render(<Step1Goals state={makeState()} actions={makeStubActions()} fiscalYear={2027} />)
    expect(screen.queryByTestId('xero-budget-seed-banner')).toBeNull()
  })
})

describe('Step 6 OpEx banner + chip', () => {
  it('shows the banner (with the unclassified count) and a chip on each "As budgeted" line', () => {
    render(
      <Step5OpEx
        state={makeState({ seedSource: SRC, currentStep: 6, opexLines: [BUDGETED, FIXED] })}
        actions={makeStubActions()}
        fiscalYear={2027}
        businessId="test-business-banners"
      />,
    )
    const note = screen.getByTestId('xero-budget-seed-banner')
    expect(note).toHaveTextContent('Expense lines came in from Xero budget')
    expect(note).toHaveTextContent('2 accounts had no category')
    // One budgeted line, one fixed → exactly one chip.
    expect(screen.getAllByTestId('xero-budget-chip')).toHaveLength(1)
  })
  it('shows neither for a budgeted line the operator typed in by hand', () => {
    render(
      <Step5OpEx
        state={makeState({ currentStep: 6, opexLines: [BUDGETED, FIXED] })}
        actions={makeStubActions()}
        fiscalYear={2027}
        businessId="test-business-banners"
      />,
    )
    expect(screen.queryByTestId('xero-budget-seed-banner')).toBeNull()
    expect(screen.queryAllByTestId('xero-budget-chip')).toHaveLength(0)
  })
})
