'use client'

import { FinancialData, CoreMetricsData, KPIData, YearType } from '../types'
import { FinancialGoalsSection, CoreMetricsSection, KPISection } from './step1'
import { HelpCircle } from 'lucide-react'

interface Step1Props {
  financialData: FinancialData
  updateFinancialValue: (metric: keyof FinancialData, period: 'current' | 'year1' | 'year2' | 'year3', value: number, isPercentage?: boolean) => void
  coreMetrics: CoreMetricsData
  updateCoreMetric: (metric: keyof CoreMetricsData, period: 'current' | 'year1' | 'year2' | 'year3', value: number) => void
  kpis: KPIData[]
  updateKPIValue: (kpiId: string, field: 'currentValue' | 'year1Target' | 'year2Target' | 'year3Target', value: number) => void
  addKPI?: (kpi: KPIData) => void
  deleteKPI: (kpiId: string) => void
  yearType: YearType
  setYearType: (type: YearType) => void
  collapsedSections: Set<string>
  toggleSection: (section: string) => void
  industry: string
  showKPIModal: boolean
  setShowKPIModal: (show: boolean) => void
  businessId?: string
}

export default function Step1GoalsAndKPIs({
  financialData,
  updateFinancialValue,
  coreMetrics,
  updateCoreMetric,
  kpis,
  updateKPIValue,
  addKPI,
  deleteKPI,
  yearType,
  setYearType,
  collapsedSections,
  toggleSection,
  industry,
  showKPIModal,
  setShowKPIModal,
  businessId
}: Step1Props) {
  return (
    <div className="space-y-6">
      {/* Task Banner */}
      <div className="bg-brand-navy rounded-lg p-4 text-white">
        <p className="text-base font-medium">
          📋 <strong>YOUR TASK:</strong> Set your 3-year, 2-year, and 1-year financial targets
        </p>
        <p className="text-sm text-white/70 mt-1">
          Start with your 3-year vision, then work backwards to define Year 2 milestones and Year 1 targets.
        </p>
      </div>

      {/* Year Type & Industry Selector */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="text-sm font-medium text-gray-700 mr-3">Period Type:</span>
            <div className="inline-flex bg-white rounded-lg p-1 shadow-sm">
              {(['FY', 'CY'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setYearType(type)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    yearType === type
                      ? 'bg-brand-orange text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {type === 'FY' ? 'Fiscal Year' : 'Calendar Year'}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-gray-600 block mb-1">INDUSTRY</span>
            <span className="text-sm text-brand-navy font-semibold capitalize">
              {industry?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Required Section Header */}
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 bg-brand-orange text-white text-xs font-bold rounded-full uppercase tracking-wide">
          Required
        </span>
        <span className="text-sm text-gray-600">Set your financial targets to drive your strategic plan</span>
      </div>

      {/* Financial Goals Section */}
      <FinancialGoalsSection
        financialData={financialData}
        updateFinancialValue={updateFinancialValue}
        yearType={yearType}
        isCollapsed={collapsedSections.has('financial')}
        onToggle={() => toggleSection('financial')}
        industry={industry}
        coreMetrics={coreMetrics}
        updateCoreMetric={updateCoreMetric}
      />

      {/* Optional Section Header */}
      <div className="flex items-center gap-2 mt-8">
        <span className="px-3 py-1 bg-gray-500 text-white text-xs font-bold rounded-full uppercase tracking-wide">
          Optional
        </span>
        <span className="text-sm text-gray-600">Track additional metrics for deeper insights</span>
        <div className="relative group">
          <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
          <div className="absolute left-6 top-0 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            Core Metrics and KPIs are optional but recommended. They help track progress beyond just financial targets and give you a more complete picture of your business health.
          </div>
        </div>
      </div>

      {/* Core Business Metrics Section */}
      <CoreMetricsSection
        coreMetrics={coreMetrics}
        updateCoreMetric={updateCoreMetric}
        financialData={financialData}
        yearType={yearType}
        isCollapsed={collapsedSections.has('core-metrics')}
        onToggle={() => toggleSection('core-metrics')}
      />

      {/* KPI Section */}
      <KPISection
        kpis={kpis}
        updateKPIValue={updateKPIValue}
        addKPI={addKPI}
        deleteKPI={deleteKPI}
        yearType={yearType}
        isCollapsed={collapsedSections.has('kpis')}
        onToggle={() => toggleSection('kpis')}
        showKPIModal={showKPIModal}
        setShowKPIModal={setShowKPIModal}
        businessId={businessId}
      />

      {/* Tip Box */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-700">
          <strong>Tip:</strong> Set realistic targets based on your current performance. These will drive your annual and 90-day plans.
        </p>
      </div>
    </div>
  )
}
