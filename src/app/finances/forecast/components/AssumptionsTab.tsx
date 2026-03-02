'use client'

import { useMemo } from 'react'
import { TrendingUp, Users, Receipt, Wallet, Building2, Pencil, ArrowUpRight, ArrowDownRight, Minus, Target } from 'lucide-react'
import type { ForecastAssumptions } from './wizard-v4/types/assumptions'

interface AssumptionsTabProps {
  assumptions: ForecastAssumptions | null
  onEditStep: (step: number) => void
  fiscalYear: number
}

function fmt(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (Math.abs(amount) >= 1_000) return `$${Math.round(amount / 1_000)}k`
  return `$${Math.round(amount)}`
}

function SectionHeader({ title, icon: Icon, onEdit }: { title: string; icon: React.ElementType; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-navy" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <button
        onClick={onEdit}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:text-brand-navy-800 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-navy-50"
      >
        <Pencil className="w-3 h-3" />
        Edit
      </button>
    </div>
  )
}

export default function AssumptionsTab({ assumptions, onEditStep, fiscalYear }: AssumptionsTabProps) {
  if (!assumptions) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <Target className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-1">No assumptions recorded yet.</p>
        <p className="text-sm text-gray-400">Use the wizard to build your forecast.</p>
      </div>
    )
  }

  const baselineFY = `FY${(fiscalYear - 1) % 100}`
  const currentFY = `FY${fiscalYear % 100}`

  // Revenue calculations
  const revenueData = useMemo(() => {
    const lines = assumptions.revenue?.lines || []
    return lines.map(line => {
      const forecastTotal = line.growthType === 'fixed_amount'
        ? line.priorYearTotal + (line.fixedGrowthAmount || 0)
        : line.priorYearTotal * (1 + (line.growthPct || 0) / 100)
      return { ...line, forecastTotal }
    })
  }, [assumptions.revenue])

  const totalPriorRevenue = revenueData.reduce((s, l) => s + l.priorYearTotal, 0)
  const totalForecastRevenue = revenueData.reduce((s, l) => s + l.forecastTotal, 0)

  // COGS
  const cogsLines = assumptions.cogs?.lines || []

  // Team
  const team = assumptions.team
  const existingTeam = team?.existingTeam?.filter(m => m.includeInForecast !== false) || []
  const plannedHires = team?.plannedHires || []
  const departures = team?.departures || []
  const superRate = team?.superannuationPct || 12

  // OpEx
  const opexLines = assumptions.opex?.lines || []

  // Subscriptions
  const subs = assumptions.subscriptions

  // CapEx
  const capexItems = assumptions.capex?.items || []

  // Goals
  const goals = assumptions.goals

  return (
    <div className="space-y-6">
      {/* Goals Summary */}
      {goals && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <SectionHeader title="Goals" icon={Target} onEdit={() => onEditStep(1)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Gross Profit %</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Net Profit %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {goals.year1 && (
                  <tr>
                    <td className="py-2.5 font-medium text-gray-900">{currentFY}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(goals.year1.revenue)}</td>
                    <td className="py-2.5 text-right text-gray-700">{goals.year1.grossProfitPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right text-gray-700">{goals.year1.netProfitPct.toFixed(1)}%</td>
                  </tr>
                )}
                {goals.year2 && (
                  <tr>
                    <td className="py-2.5 font-medium text-gray-900">FY{(fiscalYear + 1) % 100}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(goals.year2.revenue)}</td>
                    <td className="py-2.5 text-right text-gray-700">{goals.year2.grossProfitPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right text-gray-700">{goals.year2.netProfitPct.toFixed(1)}%</td>
                  </tr>
                )}
                {goals.year3 && (
                  <tr>
                    <td className="py-2.5 font-medium text-gray-900">FY{(fiscalYear + 2) % 100}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(goals.year3.revenue)}</td>
                    <td className="py-2.5 text-right text-gray-700">{goals.year3.grossProfitPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right text-gray-700">{goals.year3.netProfitPct.toFixed(1)}%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revenue */}
      {revenueData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <SectionHeader title="Revenue" icon={TrendingUp} onEdit={() => onEditStep(3)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">{baselineFY}</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Growth</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">{currentFY} Forecast</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {revenueData.map((line, i) => (
                  <tr key={i}>
                    <td className="py-2.5 text-gray-900">{line.accountName}</td>
                    <td className="py-2.5 text-right text-gray-600">{fmt(line.priorYearTotal)}</td>
                    <td className="py-2.5 text-right">
                      <span className={`inline-flex items-center gap-1 ${(line.growthPct || 0) > 0 ? 'text-green-600' : (line.growthPct || 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        {(line.growthPct || 0) > 0 && <ArrowUpRight className="w-3 h-3" />}
                        {(line.growthPct || 0) < 0 && <ArrowDownRight className="w-3 h-3" />}
                        {(line.growthPct || 0) === 0 && <Minus className="w-3 h-3" />}
                        {line.growthType === 'percentage' ? `${line.growthPct || 0}%` : fmt(line.fixedGrowthAmount || 0)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(line.forecastTotal)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200">
                  <td className="py-2.5 font-semibold text-gray-900">Total</td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(totalPriorRevenue)}</td>
                  <td className="py-2.5 text-right font-semibold text-gray-600">
                    {totalPriorRevenue > 0 ? `${(((totalForecastRevenue - totalPriorRevenue) / totalPriorRevenue) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(totalForecastRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COGS */}
      {cogsLines.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <SectionHeader title="Cost of Sales" icon={TrendingUp} onEdit={() => onEditStep(3)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">{baselineFY}</th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase pl-4">Type</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate / Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cogsLines.map((line, i) => (
                  <tr key={i}>
                    <td className="py-2.5 text-gray-900">{line.accountName}</td>
                    <td className="py-2.5 text-right text-gray-600">{fmt(line.priorYearTotal)}</td>
                    <td className="py-2.5 text-left text-gray-500 pl-4 capitalize">{line.costBehavior}</td>
                    <td className="py-2.5 text-right text-gray-900">
                      {line.costBehavior === 'variable' ? `${line.percentOfRevenue}% of revenue` : fmt((line.monthlyAmount || 0) * 12)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team */}
      {(existingTeam.length > 0 || plannedHires.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <SectionHeader title="Team" icon={Users} onEdit={() => onEditStep(4)} />

          {existingTeam.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Existing Team ({existingTeam.length})</p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Salary</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Increase</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {existingTeam.map((member, i) => {
                      const adjustedSalary = member.currentSalary * (1 + member.salaryIncreasePct / 100)
                      const totalCost = adjustedSalary * (1 + superRate / 100)
                      return (
                        <tr key={i}>
                          <td className="py-2 text-gray-900">{member.name}</td>
                          <td className="py-2 text-gray-600">{member.role}</td>
                          <td className="py-2 text-right text-gray-600">{fmt(member.currentSalary)}</td>
                          <td className="py-2 text-right text-gray-500">{member.salaryIncreasePct}%</td>
                          <td className="py-2 text-right font-medium text-gray-900">{fmt(totalCost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {plannedHires.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">New Hires ({plannedHires.length})</p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Salary</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Start</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {plannedHires.map((hire, i) => {
                      const totalCost = hire.salary * (1 + superRate / 100)
                      return (
                        <tr key={i}>
                          <td className="py-2 text-gray-900">{hire.role}</td>
                          <td className="py-2 text-gray-500 capitalize">{hire.employmentType}</td>
                          <td className="py-2 text-right text-gray-600">{fmt(hire.salary)}</td>
                          <td className="py-2 text-right text-gray-500">{hire.startMonth}</td>
                          <td className="py-2 text-right font-medium text-gray-900">{fmt(totalCost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {departures.length > 0 && (
            <p className="text-sm text-gray-500 mb-2">{departures.length} planned departure{departures.length !== 1 ? 's' : ''}</p>
          )}

          <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-slate-100">
            <span>Super: {superRate}%</span>
            {team?.workCoverPct ? <span>WorkCover: {team.workCoverPct}%</span> : null}
            {team?.payrollTaxPct ? <span>Payroll Tax: {team.payrollTaxPct}%</span> : null}
          </div>
        </div>
      )}

      {/* Operating Expenses */}
      {opexLines.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <SectionHeader title="Operating Expenses" icon={Receipt} onEdit={() => onEditStep(5)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">{baselineFY}</th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase pl-4">Behavior</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">{currentFY} Forecast</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {opexLines
                  .sort((a, b) => b.priorYearTotal - a.priorYearTotal)
                  .map((line, i) => {
                    let forecastAmt = line.priorYearTotal
                    if (line.costBehavior === 'fixed') forecastAmt = (line.monthlyAmount || 0) * 12
                    else if (line.costBehavior === 'variable') forecastAmt = (line.percentOfRevenue || 0) / 100 * totalForecastRevenue
                    else if (line.costBehavior === 'adhoc') forecastAmt = line.expectedAnnualAmount || 0
                    else if (line.costBehavior === 'seasonal') forecastAmt = line.seasonalTargetAmount || line.priorYearTotal * (1 + (line.seasonalGrowthPct || 0) / 100)

                    const behaviorLabel: Record<string, string> = {
                      fixed: `${fmt(line.monthlyAmount || 0)}/mo`,
                      variable: `${line.percentOfRevenue}% of rev`,
                      adhoc: 'Ad-hoc',
                      seasonal: line.seasonalGrowthPct ? `+${line.seasonalGrowthPct}% seasonal` : 'Seasonal',
                    }

                    return (
                      <tr key={i}>
                        <td className="py-2 text-gray-900">{line.accountName}</td>
                        <td className="py-2 text-right text-gray-600">{fmt(line.priorYearTotal)}</td>
                        <td className="py-2 text-left text-gray-500 pl-4 text-xs">{behaviorLabel[line.costBehavior] || line.costBehavior}</td>
                        <td className="py-2 text-right font-medium text-gray-900">{fmt(forecastAmt)}</td>
                      </tr>
                    )
                  })}
                <tr className="border-t-2 border-slate-200">
                  <td className="py-2.5 font-semibold text-gray-900">Total</td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(opexLines.reduce((s, l) => s + l.priorYearTotal, 0))}</td>
                  <td className="py-2.5"></td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">
                    {fmt(opexLines.reduce((s, l) => {
                      if (l.costBehavior === 'fixed') return s + (l.monthlyAmount || 0) * 12
                      if (l.costBehavior === 'variable') return s + (l.percentOfRevenue || 0) / 100 * totalForecastRevenue
                      if (l.costBehavior === 'adhoc') return s + (l.expectedAnnualAmount || 0)
                      if (l.costBehavior === 'seasonal') return s + (l.seasonalTargetAmount || l.priorYearTotal * (1 + (l.seasonalGrowthPct || 0) / 100))
                      return s + l.priorYearTotal
                    }, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscriptions */}
      {subs && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <SectionHeader title="Subscriptions Audit" icon={Wallet} onEdit={() => onEditStep(6)} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-xs text-gray-500">Essential</p>
              <p className="text-sm font-semibold text-green-700">{fmt(subs.essentialAnnual)}</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <p className="text-xs text-gray-500">Review</p>
              <p className="text-sm font-semibold text-amber-700">{fmt(subs.reviewAnnual)}</p>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <p className="text-xs text-gray-500">Reduce</p>
              <p className="text-sm font-semibold text-orange-700">{fmt(subs.reduceAnnual)}</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-xs text-gray-500">Cancel</p>
              <p className="text-sm font-semibold text-red-700">{fmt(subs.cancelAnnual)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-600 pt-3 border-t border-slate-100">
            <span>{subs.vendorCount} vendors audited</span>
            <span>Total: <strong>{fmt(subs.totalAnnual)}/yr</strong></span>
            <span className="text-green-600 font-medium">Potential savings: {fmt(subs.potentialSavings)}</span>
          </div>
        </div>
      )}

      {/* CapEx */}
      {capexItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <SectionHeader title="Capital Expenditure" icon={Building2} onEdit={() => onEditStep(7)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {capexItems.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-900">{item.name}</td>
                    <td className="py-2 text-gray-500 capitalize">{item.category}</td>
                    <td className="py-2 text-right text-gray-500">{item.month}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{fmt(item.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={3} className="py-2.5 font-semibold text-gray-900">Total</td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(capexItems.reduce((s, item) => s + item.amount, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
