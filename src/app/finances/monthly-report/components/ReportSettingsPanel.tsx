'use client'

import { useState, useEffect } from 'react'
import { X, Settings, BookmarkPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyReportSettings, ReportSections, ForecastOption, AccountMapping, ReportTemplate } from '../types'
import { createClient } from '@/lib/supabase/client'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import TemplatePicker from './TemplatePicker'
import TemplateSaveModal from './TemplateSaveModal'

interface ReportSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  businessId: string
  settings: MonthlyReportSettings
  onSettingsChange: (settings: MonthlyReportSettings) => void
  // Phase 35 D-16: passed through so settings save can revert an approved/sent
  // report to draft when the coach edits sections / template / pdf layout.
  reportMonth?: string
  // Phase 42 D-17: optional callback fired after a 2xx settings save — the
  // page wires this to useReportStatus.refresh() so the status pill updates
  // within ~500ms of the save (parity with auto-save / layout saves).
  onSaveSuccess?: () => void
  // Template props (optional — graceful degradation when not yet wired)
  templates?: ReportTemplate[]
  activeTemplateId?: string | null
  templatesLoading?: boolean
  onApplyTemplate?: (template: ReportTemplate) => void
  onDeleteTemplate?: (template: ReportTemplate) => void
  onSetDefaultTemplate?: (template: ReportTemplate) => void
  onSaveTemplate?: (name: string, isDefault: boolean) => Promise<void>
}

interface SectionGroup {
  title: string
  description: string
  items: { key: keyof ReportSections; label: string }[]
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    title: 'Report Sections',
    description: 'Controls which tabs and PDF pages are included',
    items: [
      { key: 'revenue_detail', label: 'Revenue Detail' },
      { key: 'cogs_detail', label: 'Cost of Sales Detail' },
      { key: 'opex_detail', label: 'Operating Expenses Detail' },
      { key: 'payroll_detail', label: 'Payroll Detail' },
      { key: 'subscription_detail', label: 'Subscription Detail' },
      { key: 'balance_sheet', label: 'Balance Sheet' },
      { key: 'cashflow', label: 'Cashflow Forecast' },
      { key: 'trend_charts', label: 'Trend Charts' },
    ],
  },
  {
    title: 'P&L Charts',
    description: 'Visual analysis of profit & loss performance',
    items: [
      { key: 'chart_revenue_vs_expenses', label: 'Revenue vs Expenses Trend' },
      { key: 'chart_revenue_breakdown', label: 'Where Your Revenue Goes' },
      { key: 'chart_break_even', label: 'Break-Even Analysis' },
      { key: 'chart_variance_heatmap', label: 'Variance Heatmap' },
      { key: 'chart_budget_burn_rate', label: 'Budget Burn Rate' },
    ],
  },
  {
    title: 'Cashflow Charts',
    description: 'Requires cashflow forecast data',
    items: [
      { key: 'chart_cash_runway', label: 'Cash Runway' },
      { key: 'chart_cumulative_net_cash', label: 'Cumulative Net Cash' },
      { key: 'chart_working_capital_gap', label: 'Working Capital Gap' },
    ],
  },
  {
    title: 'People & Subscriptions Charts',
    description: 'Requires wages or subscription data configured',
    items: [
      { key: 'chart_team_cost_pct', label: 'Team Cost as % of Revenue' },
      { key: 'chart_cost_per_employee', label: 'Cost per Employee' },
      { key: 'chart_subscription_creep', label: 'Subscription Creep' },
    ],
  },
]

const COLUMN_LABELS = {
  show_prior_year: 'Prior Year Comparison',
  show_ytd: 'Year-to-Date (YTD)',
  show_unspent_budget: 'Unspent Budget',
  show_budget_next_month: 'Budget Next Month',
  show_budget_annual_total: 'Budget Annual Total',
}

export default function ReportSettingsPanel({
  isOpen,
  onClose,
  businessId,
  settings,
  onSettingsChange,
  reportMonth,
  onSaveSuccess,
  templates = [],
  activeTemplateId = null,
  templatesLoading = false,
  onApplyTemplate,
  onDeleteTemplate,
  onSetDefaultTemplate,
  onSaveTemplate,
}: ReportSettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<MonthlyReportSettings>(settings)
  const [forecasts, setForecasts] = useState<ForecastOption[]>([])
  const [expenseAccounts, setExpenseAccounts] = useState<AccountMapping[]>([])
  const [wagesAccountOptions, setWagesAccountOptions] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      // Resolve business_profiles.id from businesses.id
      const ids = await resolveBusinessIds(supabase, businessId)
      const forecastRes = await supabase
        .from('financial_forecasts')
        .select('id, name, fiscal_year, forecast_type, is_active')
        .in('business_id', ids.all)
        .order('created_at', { ascending: false })
      const [, mappingRes] = await Promise.all([
        Promise.resolve(forecastRes),
        supabase
          .from('account_mappings')
          .select('xero_account_code, xero_account_name, report_category, forecast_pl_line_name')
          .eq('business_id', businessId)
          .in('report_category', ['Operating Expenses', 'Cost of Sales'])
          .order('xero_account_name'),
      ])
      setForecasts(forecastRes.data || [])
      setExpenseAccounts((mappingRes.data || []) as AccountMapping[])

      // Build wages account options from BOTH Xero account names AND forecast line names
      const allMappings = (mappingRes.data || []) as AccountMapping[]
      const namesSet = new Set<string>()
      for (const m of allMappings) {
        if (m.xero_account_name) namesSet.add(m.xero_account_name)
        if (m.forecast_pl_line_name) namesSet.add(m.forecast_pl_line_name)
      }

      // Also load forecast_pl_lines expense categories for the active forecast
      // Categories in DB are 'Operating Expenses', 'Cost of Sales', etc. (not 'opex'/'cogs')
      const activeForecast = (forecastRes.data || []).find((f: ForecastOption) => f.is_active)
      if (activeForecast) {
        const { data: plLines } = await supabase
          .from('forecast_pl_lines')
          .select('account_name, category, is_from_payroll')
          .eq('forecast_id', activeForecast.id)
          .in('category', ['Operating Expenses', 'Cost of Sales'])
        for (const pl of plLines || []) {
          if (pl.account_name) namesSet.add(pl.account_name)
        }
      }

      setWagesAccountOptions(Array.from(namesSet).sort())
    }
    if (businessId && isOpen) loadData()
  }, [businessId, isOpen])

  const handleSectionToggle = (key: keyof ReportSections) => {
    setLocalSettings(prev => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections[key] },
    }))
  }

  const handleColumnToggle = (key: string) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: !prev[key as keyof MonthlyReportSettings],
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/monthly-report/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          sections: localSettings.sections,
          show_prior_year: localSettings.show_prior_year,
          show_ytd: localSettings.show_ytd,
          show_unspent_budget: localSettings.show_unspent_budget,
          show_budget_next_month: localSettings.show_budget_next_month,
          show_budget_annual_total: localSettings.show_budget_annual_total,
          budget_forecast_id: localSettings.budget_forecast_id,
          subscription_account_codes: localSettings.subscription_account_codes,
          wages_account_names: localSettings.wages_account_names,
          // Phase 35 D-16: enables auto-revert when this save lands on an approved/sent report.
          report_month: reportMonth,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      onSettingsChange(data.settings)
      // Phase 42 D-17: notify caller (page wires this to reportStatus.refresh()
      // so the status pill updates within ~500ms of the save).
      onSaveSuccess?.()
      toast.success('Settings saved')
      onClose()
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveTemplate = async (name: string, isDefault: boolean) => {
    if (!onSaveTemplate) return
    setIsSavingTemplate(true)
    try {
      await onSaveTemplate(name, isDefault)
      setShowSaveModal(false)
      toast.success(`Template "${name}" saved`)
    } catch {
      toast.error('Failed to save template')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Report Settings</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Templates */}
          {onApplyTemplate && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Templates</h3>
                {onSaveTemplate && (
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(true)}
                    className="flex items-center gap-1 text-xs text-brand-orange hover:text-brand-orange-600 font-medium"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Save as template
                  </button>
                )}
              </div>
              <TemplatePicker
                templates={templates}
                activeTemplateId={activeTemplateId}
                isLoading={templatesLoading}
                onApply={(template) => {
                  onApplyTemplate(template)
                  // Sync local settings to the applied template
                  setLocalSettings(prev => ({
                    ...prev,
                    sections: { ...prev.sections, ...template.sections },
                    show_prior_year: template.column_settings?.show_prior_year ?? prev.show_prior_year,
                    show_ytd: template.column_settings?.show_ytd ?? prev.show_ytd,
                    show_unspent_budget: template.column_settings?.show_unspent_budget ?? prev.show_unspent_budget,
                    show_budget_next_month: template.column_settings?.show_budget_next_month ?? prev.show_budget_next_month,
                    show_budget_annual_total: template.column_settings?.show_budget_annual_total ?? prev.show_budget_annual_total,
                    budget_forecast_id: template.budget_forecast_id ?? prev.budget_forecast_id,
                    subscription_account_codes: template.subscription_account_codes ?? prev.subscription_account_codes,
                    wages_account_names: template.wages_account_names ?? prev.wages_account_names,
                  }))
                }}
                onDelete={onDeleteTemplate ?? (() => {})}
                onSetDefault={onSetDefaultTemplate ?? (() => {})}
              />
            </div>
          )}

          {/* Budget Forecast Selection */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Budget Forecast</h3>
            <select
              value={localSettings.budget_forecast_id || ''}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, budget_forecast_id: e.target.value || null }))}
              className="w-full rounded-lg border-gray-300 text-sm focus:border-brand-orange focus:ring-brand-orange"
            >
              <option value="">Auto (most recent active forecast)</option>
              {forecasts.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} (FY{f.fiscal_year}){f.is_active ? ' - Active' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Grouped Sections */}
          {SECTION_GROUPS.map(group => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{group.title}</h3>
              <p className="text-xs text-gray-400 mb-2">{group.description}</p>
              <div className="space-y-2">
                {group.items.map(({ key, label }) => (
                  <div key={key}>
                    <label className="flex items-center gap-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={localSettings.sections[key] ?? false}
                        onChange={() => handleSectionToggle(key)}
                        className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>

                    {/* Subscription account picker */}
                    {key === 'subscription_detail' && localSettings.sections.subscription_detail && (
                      <div className="ml-8 mt-1 mb-2">
                        <p className="text-xs text-gray-500 mb-1">Select accounts containing subscription expenses:</p>
                        <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                          {expenseAccounts.filter(a => a.xero_account_code).map(acc => (
                            <label key={acc.xero_account_code} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={(localSettings.subscription_account_codes || []).includes(acc.xero_account_code!)}
                                onChange={(e) => {
                                  const codes = localSettings.subscription_account_codes || []
                                  setLocalSettings(prev => ({
                                    ...prev,
                                    subscription_account_codes: e.target.checked
                                      ? [...codes, acc.xero_account_code!]
                                      : codes.filter(c => c !== acc.xero_account_code),
                                  }))
                                }}
                                className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                              />
                              <span className="text-gray-700">{acc.xero_account_name}</span>
                              <span className="text-gray-400">({acc.xero_account_code})</span>
                            </label>
                          ))}
                          {expenseAccounts.filter(a => a.xero_account_code).length === 0 && (
                            <p className="text-xs text-gray-400 italic">No expense accounts mapped yet</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Wages account picker */}
                    {key === 'payroll_detail' && localSettings.sections.payroll_detail && (
                      <div className="ml-8 mt-1 mb-2">
                        <p className="text-xs text-gray-500 mb-1">Select accounts containing wages/payroll:</p>
                        <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                          {wagesAccountOptions.map(name => (
                            <label key={name} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={(localSettings.wages_account_names || []).includes(name)}
                                onChange={(e) => {
                                  const names = localSettings.wages_account_names || []
                                  setLocalSettings(prev => ({
                                    ...prev,
                                    wages_account_names: e.target.checked
                                      ? [...names, name]
                                      : names.filter(n => n !== name),
                                  }))
                                }}
                                className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                              />
                              <span className="text-gray-700">{name}</span>
                            </label>
                          ))}
                          {wagesAccountOptions.length === 0 && (
                            <p className="text-xs text-gray-400 italic">No expense accounts mapped yet</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Column Visibility */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Column Visibility</h3>
            <div className="space-y-2">
              {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={localSettings[key as keyof MonthlyReportSettings] as boolean}
                    onChange={() => handleColumnToggle(key)}
                    className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Template Save Modal */}
      <TemplateSaveModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveTemplate}
        isSaving={isSavingTemplate}
      />
    </div>
  )
}
