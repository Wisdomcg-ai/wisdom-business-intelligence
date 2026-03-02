'use client'

import { useState, useMemo } from 'react'
import { TrendingUp, Users, Receipt, Wallet, Building2, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import type { ForecastAssumptions } from '../components/wizard-v4/types/assumptions'

interface ForecastAssumptionCardsProps {
  assumptions: ForecastAssumptions
  onEditStep: (step: number) => void
  fiscalYear: number
}

function formatCurrency(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(amount) >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}k`
  }
  return `$${amount.toFixed(0)}`
}

function CollapsibleCard({
  title,
  icon: Icon,
  summaryText,
  editStep,
  onEditStep,
  children,
}: {
  title: string
  icon: React.ElementType
  summaryText: string
  editStep: number
  onEditStep: (step: number) => void
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <Icon className="w-4 h-4 text-brand-navy flex-shrink-0" />
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <span className="text-sm text-gray-500 ml-auto">{summaryText}</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-3 space-y-2 text-sm text-gray-600">
            {children}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEditStep(editStep)
            }}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:text-brand-navy-800 transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit in Wizard
          </button>
        </div>
      )}
    </div>
  )
}

export default function ForecastAssumptionCards({
  assumptions,
  onEditStep,
  fiscalYear,
}: ForecastAssumptionCardsProps) {
  // Revenue & COGS
  const revenueData = useMemo(() => {
    const lines = assumptions.revenue?.lines || []
    const totalRevenue = lines.reduce((sum, l) => {
      const annual = l.priorYearTotal * (1 + (l.growthPct || 0) / 100)
      return sum + annual
    }, 0)
    const cogsLines = assumptions.cogs?.lines || []
    return { lines, totalRevenue, cogsLines }
  }, [assumptions.revenue, assumptions.cogs])

  // Team
  const teamData = useMemo(() => {
    const existing = assumptions.team?.existingTeam || []
    const hires = assumptions.team?.plannedHires || []
    const departures = assumptions.team?.departures || []
    const headcount = existing.filter(m => m.includeInForecast).length + hires.length - departures.length
    const superRate = assumptions.team?.superannuationPct || 12

    const totalTeamCost = existing
      .filter(m => m.includeInForecast)
      .reduce((sum, m) => {
        const salary = m.currentSalary * (1 + m.salaryIncreasePct / 100)
        return sum + salary * (1 + superRate / 100)
      }, 0) + hires.reduce((sum, h) => sum + h.salary * (1 + superRate / 100), 0)

    return { existing, hires, departures, headcount, totalTeamCost, superRate }
  }, [assumptions.team])

  // OpEx
  const opexData = useMemo(() => {
    const lines = assumptions.opex?.lines || []
    const totalOpex = lines.reduce((sum, l) => {
      if (l.costBehavior === 'fixed') return sum + (l.monthlyAmount || 0) * 12
      if (l.costBehavior === 'variable') return sum + (l.percentOfRevenue || 0) / 100 * revenueData.totalRevenue
      if (l.costBehavior === 'adhoc') return sum + (l.expectedAnnualAmount || 0)
      return sum + l.priorYearTotal
    }, 0)
    const fixedCount = lines.filter(l => l.costBehavior === 'fixed').length
    const fixedPct = lines.length > 0 ? Math.round((fixedCount / lines.length) * 100) : 0
    return { lines, totalOpex, fixedPct }
  }, [assumptions.opex, revenueData.totalRevenue])

  // Subscriptions
  const subsData = useMemo(() => {
    const subs = assumptions.subscriptions
    if (!subs) return null
    return {
      vendorCount: subs.vendorCount || 0,
      totalAnnual: subs.totalAnnual || 0,
      savings: subs.potentialSavings || 0,
      essential: subs.essentialAnnual || 0,
      review: subs.reviewAnnual || 0,
      reduce: subs.reduceAnnual || 0,
      cancel: subs.cancelAnnual || 0,
    }
  }, [assumptions.subscriptions])

  // CapEx
  const capexData = useMemo(() => {
    const items = assumptions.capex?.items || []
    const totalCapex = items.reduce((sum, i) => sum + i.amount, 0)
    return { items, totalCapex }
  }, [assumptions.capex])

  const hasAnyData = revenueData.lines.length > 0 ||
    teamData.existing.length > 0 ||
    opexData.lines.length > 0 ||
    subsData !== null ||
    capexData.items.length > 0

  if (!hasAnyData) return null

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Forecast Assumptions</h3>
      <div className="space-y-2">
        {/* 1. Revenue & COGS */}
        {revenueData.lines.length > 0 && (
          <CollapsibleCard
            title="Revenue & COGS"
            icon={TrendingUp}
            summaryText={`${formatCurrency(revenueData.totalRevenue)} revenue, ${revenueData.lines.length} lines`}
            editStep={3}
            onEditStep={onEditStep}
          >
            <div className="space-y-1.5">
              <p className="font-medium text-gray-700">Revenue Lines</p>
              {revenueData.lines.map((line, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate mr-2">{line.accountName}</span>
                  <span className="text-gray-500 flex-shrink-0">
                    {formatCurrency(line.priorYearTotal)} prior
                    {line.growthPct ? `, +${line.growthPct}%` : ''}
                  </span>
                </div>
              ))}
            </div>
            {revenueData.cogsLines.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="font-medium text-gray-700">Cost of Sales</p>
                {revenueData.cogsLines.map((line, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate mr-2">{line.accountName}</span>
                    <span className="text-gray-500 flex-shrink-0">
                      {line.costBehavior === 'variable'
                        ? `${line.percentOfRevenue}% of revenue`
                        : `${formatCurrency((line.monthlyAmount || 0) * 12)}/yr`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleCard>
        )}

        {/* 2. Team */}
        {(teamData.existing.length > 0 || teamData.hires.length > 0) && (
          <CollapsibleCard
            title="Team"
            icon={Users}
            summaryText={`${teamData.headcount} people, ${formatCurrency(teamData.totalTeamCost)}/yr`}
            editStep={4}
            onEditStep={onEditStep}
          >
            <div className="space-y-1.5">
              <p className="text-gray-500">
                {teamData.existing.filter(m => m.includeInForecast).length} existing team members
              </p>
              {teamData.hires.length > 0 && (
                <>
                  <p className="font-medium text-gray-700 mt-2">New Hires</p>
                  {teamData.hires.map((hire, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{hire.role}</span>
                      <span className="text-gray-500">
                        {formatCurrency(hire.salary)}, starts {hire.startMonth}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {teamData.departures.length > 0 && (
                <p className="text-gray-500 mt-2">
                  {teamData.departures.length} planned departure{teamData.departures.length !== 1 ? 's' : ''}
                </p>
              )}
              <p className="text-gray-500 mt-2">Super rate: {teamData.superRate}%</p>
            </div>
          </CollapsibleCard>
        )}

        {/* 3. Operating Expenses */}
        {opexData.lines.length > 0 && (
          <CollapsibleCard
            title="Operating Expenses"
            icon={Receipt}
            summaryText={`${formatCurrency(opexData.totalOpex)}, ${opexData.fixedPct}% fixed`}
            editStep={5}
            onEditStep={onEditStep}
          >
            <div className="space-y-1.5">
              {opexData.lines
                .sort((a, b) => {
                  const aAmt = a.costBehavior === 'fixed' ? (a.monthlyAmount || 0) * 12 : a.priorYearTotal
                  const bAmt = b.costBehavior === 'fixed' ? (b.monthlyAmount || 0) * 12 : b.priorYearTotal
                  return bAmt - aAmt
                })
                .slice(0, 5)
                .map((line, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate mr-2">{line.accountName}</span>
                    <span className="text-gray-500 flex-shrink-0">
                      {line.costBehavior === 'fixed' && `${formatCurrency((line.monthlyAmount || 0) * 12)}/yr fixed`}
                      {line.costBehavior === 'variable' && `${line.percentOfRevenue}% of revenue`}
                      {line.costBehavior === 'adhoc' && `${formatCurrency(line.expectedAnnualAmount || 0)}/yr adhoc`}
                      {line.costBehavior === 'seasonal' && `${formatCurrency(line.priorYearTotal)}/yr seasonal`}
                    </span>
                  </div>
                ))}
              {opexData.lines.length > 5 && (
                <p className="text-gray-400 text-xs">+{opexData.lines.length - 5} more lines</p>
              )}
            </div>
          </CollapsibleCard>
        )}

        {/* 4. Subscriptions */}
        {subsData && (
          <CollapsibleCard
            title="Subscriptions"
            icon={Wallet}
            summaryText={`${formatCurrency(subsData.totalAnnual)}/yr, ${formatCurrency(subsData.savings)} savings`}
            editStep={6}
            onEditStep={onEditStep}
          >
            <div className="space-y-1.5">
              <p>{subsData.vendorCount} vendors audited</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span>Essential:</span>
                <span className="text-right">{formatCurrency(subsData.essential)}</span>
                <span>Review:</span>
                <span className="text-right">{formatCurrency(subsData.review)}</span>
                <span>Reduce:</span>
                <span className="text-right">{formatCurrency(subsData.reduce)}</span>
                <span>Cancel:</span>
                <span className="text-right">{formatCurrency(subsData.cancel)}</span>
              </div>
            </div>
          </CollapsibleCard>
        )}

        {/* 5. CapEx & Other */}
        {capexData.items.length > 0 && (
          <CollapsibleCard
            title="CapEx & Other"
            icon={Building2}
            summaryText={`${formatCurrency(capexData.totalCapex)}, ${capexData.items.length} items`}
            editStep={7}
            onEditStep={onEditStep}
          >
            <div className="space-y-1.5">
              {capexData.items.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate mr-2">{item.name}</span>
                  <span className="text-gray-500 flex-shrink-0">
                    {formatCurrency(item.amount)}, {item.month}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        )}
      </div>
    </div>
  )
}
