'use client'

import { FinancialData, CoreMetricsData, KPIData, YearType } from '../types'
import { FinancialGoalsSection, CoreMetricsSection, KPISection } from './step1'

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
      {/* Year Type & Industry Selector */}
      <div className="bg-gradient-to-r from-teal-50 to-teal-100 rounded-lg border border-teal-200 p-4">
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
                      ? 'bg-teal-600 text-white shadow-md'
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
            <span className="text-sm text-teal-700 font-semibold capitalize">
              {industry?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
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
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
        <p className="text-sm text-teal-800">
          <strong>Tip:</strong> Set realistic targets based on your current performance. These will drive your annual and 90-day plans.
        </p>
      </div>
    </div>
  )
}
