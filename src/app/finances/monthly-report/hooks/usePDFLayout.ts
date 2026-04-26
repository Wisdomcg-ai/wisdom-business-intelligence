import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { PDFLayout } from '../types/pdf-layout'
import type { MonthlyReportSettings } from '../types'

interface UsePDFLayoutReturn {
  layout: PDFLayout | null
  isLoading: boolean
  isSaving: boolean
  saveLayout: (layout: PDFLayout) => Promise<boolean>
  clearLayout: () => Promise<boolean>
}

/**
 * Hook to load/save PDF layout from the monthly_report_settings table.
 * The layout is stored as part of the settings (pdf_layout JSONB column).
 *
 * Phase 35 D-16: when `reportMonth` is provided, the settings save triggers
 * `revertReportIfApproved` server-side so editing the layout on an
 * approved/sent report silently reverts the pill to draft.
 */
export function usePDFLayout(
  businessId: string,
  settings: MonthlyReportSettings | null,
  onSettingsChange: (settings: MonthlyReportSettings) => void,
  reportMonth?: string,
): UsePDFLayoutReturn {
  const [isSaving, setIsSaving] = useState(false)

  const layout = settings?.pdf_layout ?? null

  const persistLayout = useCallback(async (newLayout: PDFLayout | null): Promise<boolean> => {
    if (!businessId || !settings) {
      console.warn('[usePDFLayout] Cannot save: missing businessId or settings')
      return false
    }
    setIsSaving(true)
    try {
      const payload = {
        business_id: settings.business_id,
        sections: settings.sections,
        show_prior_year: settings.show_prior_year,
        show_ytd: settings.show_ytd,
        show_unspent_budget: settings.show_unspent_budget,
        show_budget_next_month: settings.show_budget_next_month,
        show_budget_annual_total: settings.show_budget_annual_total,
        budget_forecast_id: settings.budget_forecast_id ?? null,
        subscription_account_codes: settings.subscription_account_codes ?? [],
        wages_account_names: settings.wages_account_names ?? [],
        pdf_layout: newLayout,
        // Phase 35 D-16: enables auto-revert when this save lands on an approved/sent report.
        report_month: reportMonth,
      }
      const res = await fetch('/api/monthly-report/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('[usePDFLayout] HTTP error:', res.status, text)
        toast.error('Failed to save layout')
        return false
      }
      const data = await res.json()
      if (data.success && data.settings) {
        onSettingsChange(data.settings)
        return true
      }
      console.error('[usePDFLayout] Save failed:', data.error)
      toast.error(data.error || 'Failed to save layout')
      return false
    } catch (err) {
      console.error('[usePDFLayout] Save error:', err)
      toast.error('Failed to save layout')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [businessId, settings, onSettingsChange, reportMonth])

  const saveLayout = useCallback(async (newLayout: PDFLayout): Promise<boolean> => {
    const ok = await persistLayout(newLayout)
    if (ok) toast.success('Layout saved')
    return ok
  }, [persistLayout])

  const clearLayout = useCallback(async (): Promise<boolean> => {
    const ok = await persistLayout(null)
    if (ok) toast.success('Layout reset to default')
    return ok
  }, [persistLayout])

  return {
    layout,
    isLoading: false,
    isSaving,
    saveLayout,
    clearLayout,
  }
}
