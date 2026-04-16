import { useState, useCallback } from 'react'
import type { ReportTemplate, MonthlyReportSettings, TemplateColumnSettings } from '../types'
import { DEFAULT_SECTIONS } from '../types'

export function useReportTemplates(businessId: string) {
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    if (!businessId) return []
    setIsLoading(true)
    try {
      const res = await fetch(`/api/monthly-report/templates?business_id=${businessId}`)
      const data = await res.json()
      if (res.ok) {
        setTemplates(data.templates || [])
        return data.templates as ReportTemplate[]
      }
    } catch (err) {
      console.error('[useReportTemplates] loadTemplates error:', err)
    } finally {
      setIsLoading(false)
    }
    return []
  }, [businessId])

  /** Save current settings as a new named template */
  const saveTemplate = useCallback(async (
    name: string,
    settings: MonthlyReportSettings,
    isDefault: boolean
  ): Promise<ReportTemplate | null> => {
    if (!businessId) return null
    const columnSettings: TemplateColumnSettings = {
      show_prior_year: settings.show_prior_year,
      show_ytd: settings.show_ytd,
      show_unspent_budget: settings.show_unspent_budget,
      show_budget_next_month: settings.show_budget_next_month,
      show_budget_annual_total: settings.show_budget_annual_total,
    }
    try {
      const res = await fetch('/api/monthly-report/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          name,
          is_default: isDefault,
          sections: settings.sections,
          column_settings: columnSettings,
          budget_forecast_id: settings.budget_forecast_id || null,
          subscription_account_codes: settings.subscription_account_codes || [],
          wages_account_names: settings.wages_account_names || [],
        }),
      })
      const data = await res.json()
      if (res.ok && data.template) {
        setTemplates(prev => {
          // If new template is default, clear existing defaults
          const updated = isDefault
            ? prev.map(t => ({ ...t, is_default: false }))
            : [...prev]
          return [...updated, data.template].sort((a, b) => a.name.localeCompare(b.name))
        })
        setActiveTemplateId(data.template.id)
        return data.template
      }
    } catch (err) {
      console.error('[useReportTemplates] saveTemplate error:', err)
    }
    return null
  }, [businessId])

  /** Update an existing template (rename, toggle default, or update settings) */
  const updateTemplate = useCallback(async (
    id: string,
    updates: Partial<Omit<ReportTemplate, 'id' | 'business_id' | 'created_at' | 'updated_at'>>
  ): Promise<ReportTemplate | null> => {
    if (!businessId) return null
    try {
      const res = await fetch('/api/monthly-report/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, business_id: businessId, ...updates }),
      })
      const data = await res.json()
      if (res.ok && data.template) {
        setTemplates(prev => {
          let updated = prev.map(t => {
            if (updates.is_default === true && t.id !== id) return { ...t, is_default: false }
            return t
          })
          updated = updated.map(t => (t.id === id ? data.template : t))
          return updated.sort((a, b) => a.name.localeCompare(b.name))
        })
        return data.template
      }
    } catch (err) {
      console.error('[useReportTemplates] updateTemplate error:', err)
    }
    return null
  }, [businessId])

  /** Delete a template. Falls back to no active template if it was active. */
  const deleteTemplate = useCallback(async (id: string): Promise<boolean> => {
    if (!businessId) return false
    try {
      const res = await fetch(
        `/api/monthly-report/templates?id=${id}&business_id=${businessId}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
        if (activeTemplateId === id) setActiveTemplateId(null)
        return true
      }
    } catch (err) {
      console.error('[useReportTemplates] deleteTemplate error:', err)
    }
    return false
  }, [businessId, activeTemplateId])

  /**
   * Derive the MonthlyReportSettings fields from a template.
   * Returns a partial settings object — caller merges into existing settings.
   */
  const settingsFromTemplate = useCallback((
    template: ReportTemplate
  ): Partial<MonthlyReportSettings> => {
    return {
      sections: { ...DEFAULT_SECTIONS, ...template.sections },
      show_prior_year: template.column_settings?.show_prior_year ?? true,
      show_ytd: template.column_settings?.show_ytd ?? true,
      show_unspent_budget: template.column_settings?.show_unspent_budget ?? true,
      show_budget_next_month: template.column_settings?.show_budget_next_month ?? true,
      show_budget_annual_total: template.column_settings?.show_budget_annual_total ?? true,
      budget_forecast_id: template.budget_forecast_id ?? null,
      subscription_account_codes: template.subscription_account_codes ?? [],
      wages_account_names: template.wages_account_names ?? [],
    }
  }, [])

  const applyTemplate = useCallback((
    template: ReportTemplate,
    currentSettings: MonthlyReportSettings
  ): MonthlyReportSettings => {
    setActiveTemplateId(template.id)
    return { ...currentSettings, ...settingsFromTemplate(template) }
  }, [settingsFromTemplate])

  const activeTemplate = templates.find(t => t.id === activeTemplateId) ?? null

  return {
    templates,
    isLoading,
    activeTemplateId,
    activeTemplate,
    loadTemplates,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
    settingsFromTemplate,
    setActiveTemplateId,
  }
}
