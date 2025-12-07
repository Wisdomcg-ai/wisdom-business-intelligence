'use client'

import { Loader2, Lock, Unlock, Settings, TrendingUp } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ManageMetricsModal from './components/ManageMetricsModal'
import QuarterProgressCard from './components/QuarterProgressCard'
import MetricRow from './components/MetricRow'
import { useBusinessDashboard } from './hooks/useBusinessDashboard'
import WeeklyMetricsService from './services/weekly-metrics-service'
import { DashboardPreferencesService } from './services/dashboard-preferences-service'
import type { WeeklyMetricsSnapshot } from './services/weekly-metrics-service'

export default function BusinessDashboardPage() {
  const {
    mounted,
    isLoading,
    businessId,
    userId,
    weekPreference,
    snapshots,
    currentSnapshot,
    pastWeeksUnlocked,
    viewMode,
    dashboardPreferences,
    isManageMetricsOpen,
    financialData,
    coreMetrics,
    kpis,
    currentWeekRef,
    currentQuarterInfo,
    currentQuarter,
    columns,
    setWeekPreference,
    setPastWeeksUnlocked,
    setViewMode,
    setIsManageMetricsOpen,
    updateCurrentSnapshot,
    updatePastSnapshot,
    toggleQuarter,
    savePreferences,
    handleKpiCreated,
    isWeekEditable,
    calculateQTD,
    calculateKpiQTD,
    getQuarterProgress,
    getTrendStatus,
    formatCurrency,
    formatNumber,
    formatDate,
    parseDollarInput,
  } = useBusinessDashboard()

  // Handle Enter key to move to next input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const form = e.currentTarget.form
      const inputs = form ? Array.from(form.querySelectorAll('input:not([disabled])')) : []
      const index = inputs.indexOf(e.currentTarget)
      if (index > -1 && index < inputs.length - 1) {
        (inputs[index + 1] as HTMLInputElement).focus()
      }
    }
  }

  // Get quarter weeks helper
  const getQuarterWeeks = (quarterInfo: any) => {
    return WeeklyMetricsService.getWeeksInRange(
      quarterInfo.startDate,
      quarterInfo.endDate,
      weekPreference
    )
  }

  // Parse number input
  const parseNumberInput = (value: string): number => {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    return parseFloat(cleaned) || 0
  }

  if (!mounted) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-sm sm:text-base text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Calculate quarter progress data
  const progress = currentQuarterInfo ? getQuarterProgress(currentQuarterInfo) : { currentWeek: 0, totalWeeks: 0, percentComplete: 0 }

  // Get quarter snapshots for QTD calculations
  const quarterWeeks = currentQuarterInfo ? getQuarterWeeks(currentQuarterInfo) : []
  const quarterSnapshots = quarterWeeks
    .map((date: string) => snapshots.find(s => s.week_ending_date === date))
    .filter(Boolean) as WeeklyMetricsSnapshot[]

  // Calculate QTD actuals
  const revenueQTD = calculateQTD(quarterSnapshots, 'revenue_actual')
  const grossProfitQTD = calculateQTD(quarterSnapshots, 'gross_profit_actual')
  const netProfitQTD = calculateQTD(quarterSnapshots, 'net_profit_actual')

  // Get quarter targets
  const revenueTarget = (financialData?.revenue?.year1 || 0) / 4
  const grossProfitTarget = (financialData?.grossProfit?.year1 || 0) / 4
  const netProfitTarget = (financialData?.netProfit?.year1 || 0) / 4

  // Calculate trends
  const revenueTrend = getTrendStatus(revenueQTD, revenueTarget, progress.percentComplete)
  const grossProfitTrend = getTrendStatus(grossProfitQTD, grossProfitTarget, progress.percentComplete)
  const netProfitTrend = getTrendStatus(netProfitQTD, netProfitTarget, progress.percentComplete)

  // Check metric visibility
  const isMetricVisible = (metricId: string) => DashboardPreferencesService.isMetricVisible(metricId, dashboardPreferences)
  const isKpiVisible = (kpiId: string) => DashboardPreferencesService.isKpiVisible(kpiId, dashboardPreferences)

  // Visible KPIs
  const visibleKpis = kpis.filter(kpi => isKpiVisible(kpi.id))

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx>{`
        input[type='number']::-webkit-inner-spin-button,
        input[type='number']::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type='number'] {
          -moz-appearance: textfield;
        }
      `}</style>
      {/* Page Header */}
      <PageHeader
        variant="banner"
        title="KPI Dashboard"
        subtitle="Track your weekly progress against annual targets"
        icon={TrendingUp}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Lock/Unlock Button */}
            <button
              onClick={() => setPastWeeksUnlocked(!pastWeeksUnlocked)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                pastWeeksUnlocked
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              {pastWeeksUnlocked ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span className="hidden sm:inline">Lock</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit Past</span>
                </>
              )}
            </button>
          </div>
        }
      />

      <div className="max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8">
        {/* Quarter Progress Summary */}
        {currentQuarterInfo && (
          <QuarterProgressCard
            currentQuarterInfo={currentQuarterInfo}
            progress={progress}
            revenueQTD={revenueQTD}
            grossProfitQTD={grossProfitQTD}
            netProfitQTD={netProfitQTD}
            revenueTarget={revenueTarget}
            grossProfitTarget={grossProfitTarget}
            netProfitTarget={netProfitTarget}
            revenueTrend={revenueTrend}
            grossProfitTrend={grossProfitTrend}
            netProfitTrend={netProfitTrend}
            formatCurrency={formatCurrency}
          />
        )}

        {/* Metrics Table */}
        <div className="rounded-xl shadow-sm border border-gray-200 bg-white overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">Business Metrics Dashboard</h2>

              <div className="flex items-center gap-2 sm:gap-3">
                {/* View Mode Toggle */}
                <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50">
                  <button
                    onClick={() => setViewMode('quarter')}
                    className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-l-lg transition-colors ${
                      viewMode === 'quarter'
                        ? 'bg-brand-orange text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="hidden sm:inline">Current </span>Quarter
                  </button>
                  <button
                    onClick={() => setViewMode('year')}
                    className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-r-lg transition-colors ${
                      viewMode === 'year'
                        ? 'bg-brand-orange text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="hidden sm:inline">Current </span>Year
                  </button>
                </div>

                {/* Manage Metrics Button */}
                <button
                  onClick={() => setIsManageMetricsOpen(true)}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Manage</span>
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()}>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }} />
                  <col style={{ width: '140px', minWidth: '140px', maxWidth: '140px' }} />
                  <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                  <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                  {columns.map((col, idx) => (
                    <col key={col.quarterKey || col.date || idx} style={{ width: col.type === 'week' ? '144px' : '128px' }} />
                  ))}
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-50 z-20" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }}>
                      Metric
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-[200px] bg-gray-50 z-20" style={{ width: '140px', minWidth: '140px', maxWidth: '140px' }}>
                      Annual Target
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-[340px] bg-gray-50 z-20" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                      Q{currentQuarter} Target
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-[460px] bg-gray-50 z-20" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                      QTD Actual
                    </th>
                    {columns.map((col, idx) => {
                      if (col.type === 'quarter-collapsed') {
                        return (
                          <th key={col.quarterKey} className="w-32 px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-100 cursor-pointer hover:bg-gray-200"
                              onClick={() => toggleQuarter(col.quarterKey!)}>
                            <div className="flex flex-col items-center">
                              <span>{col.quarterLabel}</span>
                              <span className="text-xs text-gray-500">{col.quarterDateRange}</span>
                              <span className="text-lg">▶</span>
                            </div>
                          </th>
                        )
                      } else if (col.type === 'quarter-header') {
                        return (
                          <th key={col.quarterKey} className="w-32 px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-brand-orange-100 cursor-pointer hover:bg-brand-orange-200"
                              onClick={() => toggleQuarter(col.quarterKey!)}>
                            <div className="flex flex-col items-center">
                              <span>{col.quarterLabel}</span>
                              <span className="text-xs text-gray-500">{col.quarterDateRange}</span>
                              <span className="text-lg">▼</span>
                            </div>
                          </th>
                        )
                      } else {
                        return (
                          <th
                            key={col.date || idx}
                            ref={col.isCurrentWeek ? currentWeekRef : null}
                            className={`w-36 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider ${col.isCurrentWeek ? 'bg-brand-orange-50 text-brand-orange-700' : 'text-gray-700'}`}>
                            {col.date ? formatDate(col.date) : ''}
                          </th>
                        )
                      }
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Financial Goals Section */}
                  <tr className="bg-gray-100">
                    <td className="px-6 py-3 text-left text-sm font-bold text-gray-900 uppercase tracking-wider sticky left-0 bg-gray-100 z-10" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }}>
                      Financial Goals
                    </td>
                    <td colSpan={3 + columns.length} className="px-4 py-3 bg-gray-100"></td>
                  </tr>

                  {/* Revenue */}
                  <MetricRow
                    label="Revenue"
                    annualTarget={financialData?.revenue?.year1 || 0}
                    quarterlyTarget={(financialData?.revenue?.year1 || 0) / 4}
                    metricKey="revenue_actual"
                    columns={columns}
                    currentSnapshot={currentSnapshot}
                    currentQuarterInfo={currentQuarterInfo}
                    snapshots={snapshots}
                    weekPreference={weekPreference}
                    formatValue={formatCurrency}
                    parseValue={parseDollarInput}
                    isWeekEditable={isWeekEditable}
                    updateCurrentSnapshot={updateCurrentSnapshot}
                    updatePastSnapshot={updatePastSnapshot}
                    toggleQuarter={toggleQuarter}
                    calculateQTD={calculateQTD}
                    getQuarterProgress={getQuarterProgress}
                    getTrendStatus={getTrendStatus}
                    getQuarterWeeks={getQuarterWeeks}
                    handleKeyDown={handleKeyDown}
                    placeholder="$0"
                  />

                  {/* Gross Profit */}
                  <MetricRow
                    label="Gross Profit"
                    annualTarget={financialData?.grossProfit?.year1 || 0}
                    quarterlyTarget={(financialData?.grossProfit?.year1 || 0) / 4}
                    metricKey="gross_profit_actual"
                    columns={columns}
                    currentSnapshot={currentSnapshot}
                    currentQuarterInfo={currentQuarterInfo}
                    snapshots={snapshots}
                    weekPreference={weekPreference}
                    formatValue={formatCurrency}
                    parseValue={parseDollarInput}
                    isWeekEditable={isWeekEditable}
                    updateCurrentSnapshot={updateCurrentSnapshot}
                    updatePastSnapshot={updatePastSnapshot}
                    toggleQuarter={toggleQuarter}
                    calculateQTD={calculateQTD}
                    getQuarterProgress={getQuarterProgress}
                    getTrendStatus={getTrendStatus}
                    getQuarterWeeks={getQuarterWeeks}
                    handleKeyDown={handleKeyDown}
                    placeholder="$0"
                  />

                  {/* Net Profit */}
                  <MetricRow
                    label="Net Profit"
                    annualTarget={financialData?.netProfit?.year1 || 0}
                    quarterlyTarget={(financialData?.netProfit?.year1 || 0) / 4}
                    metricKey="net_profit_actual"
                    columns={columns}
                    currentSnapshot={currentSnapshot}
                    currentQuarterInfo={currentQuarterInfo}
                    snapshots={snapshots}
                    weekPreference={weekPreference}
                    formatValue={formatCurrency}
                    parseValue={parseDollarInput}
                    isWeekEditable={isWeekEditable}
                    updateCurrentSnapshot={updateCurrentSnapshot}
                    updatePastSnapshot={updatePastSnapshot}
                    toggleQuarter={toggleQuarter}
                    calculateQTD={calculateQTD}
                    getQuarterProgress={getQuarterProgress}
                    getTrendStatus={getTrendStatus}
                    getQuarterWeeks={getQuarterWeeks}
                    handleKeyDown={handleKeyDown}
                    placeholder="$0"
                  />

                  {/* Core Business Metrics Section */}
                  <tr className="bg-gray-100">
                    <td className="px-6 py-3 text-left text-sm font-bold text-gray-900 uppercase tracking-wider sticky left-0 bg-gray-100 z-10" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }}>
                      Core Business Metrics
                    </td>
                    <td colSpan={3 + columns.length} className="px-4 py-3 bg-gray-100"></td>
                  </tr>

                  {/* Leads */}
                  {isMetricVisible('leads') && (
                    <MetricRow
                      label="Leads per Month"
                      annualTarget={(coreMetrics?.leadsPerMonth?.year1 || 0) * 12}
                      quarterlyTarget={(coreMetrics?.leadsPerMonth?.year1 || 0) * 3}
                      metricKey="leads_actual"
                      columns={columns}
                      currentSnapshot={currentSnapshot}
                      currentQuarterInfo={currentQuarterInfo}
                      snapshots={snapshots}
                      weekPreference={weekPreference}
                      formatValue={formatNumber}
                      parseValue={parseNumberInput}
                      isWeekEditable={isWeekEditable}
                      updateCurrentSnapshot={updateCurrentSnapshot}
                      updatePastSnapshot={updatePastSnapshot}
                      toggleQuarter={toggleQuarter}
                      calculateQTD={calculateQTD}
                      getQuarterProgress={getQuarterProgress}
                      getTrendStatus={getTrendStatus}
                      getQuarterWeeks={getQuarterWeeks}
                      handleKeyDown={handleKeyDown}
                      inputType="number"
                      placeholder="0"
                    />
                  )}

                  {/* Conversion Rate */}
                  {isMetricVisible('conversion_rate') && (
                    <MetricRow
                      label="Conversion Rate"
                      annualTarget={coreMetrics?.conversionRate?.year1 || 0}
                      quarterlyTarget={coreMetrics?.conversionRate?.year1 || 0}
                      metricKey="conversion_rate_actual"
                      columns={columns}
                      currentSnapshot={currentSnapshot}
                      currentQuarterInfo={currentQuarterInfo}
                      snapshots={snapshots}
                      weekPreference={weekPreference}
                      formatValue={(v) => v ? `${v}%` : ''}
                      parseValue={parseNumberInput}
                      isWeekEditable={isWeekEditable}
                      updateCurrentSnapshot={updateCurrentSnapshot}
                      updatePastSnapshot={updatePastSnapshot}
                      toggleQuarter={toggleQuarter}
                      calculateQTD={calculateQTD}
                      getQuarterProgress={getQuarterProgress}
                      getTrendStatus={getTrendStatus}
                      getQuarterWeeks={getQuarterWeeks}
                      handleKeyDown={handleKeyDown}
                      inputType="percentage"
                      placeholder="0%"
                    />
                  )}

                  {/* Avg Transaction Value */}
                  {isMetricVisible('avg_transaction') && (
                    <MetricRow
                      label="Avg Transaction Value"
                      annualTarget={coreMetrics?.avgTransactionValue?.year1 || 0}
                      quarterlyTarget={coreMetrics?.avgTransactionValue?.year1 || 0}
                      metricKey="avg_transaction_value_actual"
                      columns={columns}
                      currentSnapshot={currentSnapshot}
                      currentQuarterInfo={currentQuarterInfo}
                      snapshots={snapshots}
                      weekPreference={weekPreference}
                      formatValue={formatCurrency}
                      parseValue={parseDollarInput}
                      isWeekEditable={isWeekEditable}
                      updateCurrentSnapshot={updateCurrentSnapshot}
                      updatePastSnapshot={updatePastSnapshot}
                      toggleQuarter={toggleQuarter}
                      calculateQTD={calculateQTD}
                      getQuarterProgress={getQuarterProgress}
                      getTrendStatus={getTrendStatus}
                      getQuarterWeeks={getQuarterWeeks}
                      handleKeyDown={handleKeyDown}
                      placeholder="$0"
                    />
                  )}

                  {/* Team Headcount */}
                  {isMetricVisible('team_headcount') && (
                    <MetricRow
                      label="Team Headcount"
                      annualTarget={coreMetrics?.teamHeadcount?.year1 || 0}
                      quarterlyTarget={coreMetrics?.teamHeadcount?.year1 || 0}
                      metricKey="team_headcount_actual"
                      columns={columns}
                      currentSnapshot={currentSnapshot}
                      currentQuarterInfo={currentQuarterInfo}
                      snapshots={snapshots}
                      weekPreference={weekPreference}
                      formatValue={formatNumber}
                      parseValue={parseNumberInput}
                      isWeekEditable={isWeekEditable}
                      updateCurrentSnapshot={updateCurrentSnapshot}
                      updatePastSnapshot={updatePastSnapshot}
                      toggleQuarter={toggleQuarter}
                      calculateQTD={calculateQTD}
                      getQuarterProgress={getQuarterProgress}
                      getTrendStatus={getTrendStatus}
                      getQuarterWeeks={getQuarterWeeks}
                      handleKeyDown={handleKeyDown}
                      inputType="number"
                      placeholder="0"
                    />
                  )}

                  {/* Owner Hours */}
                  {isMetricVisible('owner_hours') && (
                    <MetricRow
                      label="Owner Hours/Week"
                      annualTarget={coreMetrics?.ownerHoursPerWeek?.year1 || 0}
                      quarterlyTarget={coreMetrics?.ownerHoursPerWeek?.year1 || 0}
                      metricKey="owner_hours_actual"
                      columns={columns}
                      currentSnapshot={currentSnapshot}
                      currentQuarterInfo={currentQuarterInfo}
                      snapshots={snapshots}
                      weekPreference={weekPreference}
                      formatValue={formatNumber}
                      parseValue={parseNumberInput}
                      isWeekEditable={isWeekEditable}
                      updateCurrentSnapshot={updateCurrentSnapshot}
                      updatePastSnapshot={updatePastSnapshot}
                      toggleQuarter={toggleQuarter}
                      calculateQTD={calculateQTD}
                      getQuarterProgress={getQuarterProgress}
                      getTrendStatus={getTrendStatus}
                      getQuarterWeeks={getQuarterWeeks}
                      handleKeyDown={handleKeyDown}
                      inputType="number"
                      placeholder="0"
                    />
                  )}

                  {/* Custom KPIs Section */}
                  {visibleKpis.length > 0 && (
                    <>
                      <tr className="bg-gray-100">
                        <td className="px-6 py-3 text-left text-sm font-bold text-gray-900 uppercase tracking-wider sticky left-0 bg-gray-100 z-10" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }}>
                          Custom KPIs
                        </td>
                        <td colSpan={3 + columns.length} className="px-4 py-3 bg-gray-100"></td>
                      </tr>

                      {visibleKpis.map((kpi) => {
                        const formatKpiValue = (v: number | undefined | null) => {
                          if (!v && v !== 0) return ''
                          if (kpi.unit === 'currency') return formatCurrency(v)
                          if (kpi.unit === 'percentage') return `${v}%`
                          return formatNumber(v)
                        }

                        return (
                          <tr key={kpi.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }}>
                              {kpi.name}
                            </td>
                            <td className="px-4 py-4 text-sm text-right text-gray-600 font-semibold sticky bg-white z-10" style={{ left: '200px', width: '140px', minWidth: '140px', maxWidth: '140px' }}>
                              {formatKpiValue(kpi.year1Target)}
                            </td>
                            <td className="px-4 py-4 text-sm text-right text-gray-600 font-semibold sticky bg-white z-10" style={{ left: '340px', width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                              {formatKpiValue(kpi.year1Target / 4)}
                            </td>
                            <td className="px-4 py-4 text-sm text-right font-semibold sticky bg-white z-10" style={{ left: '460px', width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                              {formatKpiValue(calculateKpiQTD(quarterSnapshots, kpi.id))}
                            </td>
                            {columns.map((col, idx) => {
                              if (col.type === 'quarter-collapsed') {
                                const qtd = calculateKpiQTD(col.quarterSnapshots || [], kpi.id)
                                return (
                                  <td
                                    key={col.quarterKey}
                                    className="px-3 py-4 text-sm text-center bg-gray-50 cursor-pointer hover:opacity-80"
                                    onClick={() => toggleQuarter(col.quarterKey!)}
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className="text-gray-900 font-medium">{formatKpiValue(qtd)}</span>
                                      <span className="text-xs text-gray-500">QTD</span>
                                    </div>
                                  </td>
                                )
                              } else if (col.type === 'quarter-header') {
                                return (
                                  <td key={col.quarterKey} className="px-3 py-4 text-sm text-center bg-brand-orange-50 border-l-2 border-brand-orange-200"></td>
                                )
                              } else {
                                const isEditable = isWeekEditable(col.isCurrentWeek || false, col.date)
                                const value = col.isCurrentWeek
                                  ? currentSnapshot?.kpi_actuals?.[kpi.id]
                                  : col.snapshot?.kpi_actuals?.[kpi.id]

                                return (
                                  <td key={col.date || idx} className={`px-3 py-4 text-sm text-center ${col.isCurrentWeek ? 'bg-brand-orange-50' : ''}`}>
                                    {isEditable ? (
                                      <input
                                        type="text"
                                        value={formatKpiValue(value)}
                                        onChange={(e) => {
                                          const parsed = kpi.unit === 'currency' ? parseDollarInput(e.target.value) : parseNumberInput(e.target.value)
                                          if (col.isCurrentWeek) {
                                            updateCurrentSnapshot({
                                              kpi_actuals: { ...currentSnapshot?.kpi_actuals, [kpi.id]: parsed }
                                            })
                                          } else if (col.snapshot) {
                                            updatePastSnapshot(col.snapshot, {
                                              kpi_actuals: { ...col.snapshot.kpi_actuals, [kpi.id]: parsed }
                                            })
                                          }
                                        }}
                                        onKeyDown={handleKeyDown}
                                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 transition-colors"
                                        placeholder={kpi.unit === 'currency' ? '$0' : '0'}
                                      />
                                    ) : (
                                      <span className="text-gray-900 text-sm">{formatKpiValue(value)}</span>
                                    )}
                                  </td>
                                )
                              }
                            })}
                          </tr>
                        )
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </form>
        </div>

        {/* Manage Metrics Modal */}
        {dashboardPreferences && (
          <ManageMetricsModal
            isOpen={isManageMetricsOpen}
            onClose={() => setIsManageMetricsOpen(false)}
            preferences={dashboardPreferences}
            kpis={kpis}
            onSave={savePreferences}
            businessId={businessId}
            userId={userId}
            onKpiCreated={handleKpiCreated}
          />
        )}
      </div>
    </div>
  )
}
