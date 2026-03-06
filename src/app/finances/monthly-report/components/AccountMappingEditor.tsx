'use client'

import { useState, useEffect } from 'react'
import { Check, AlertCircle, Wand2, CheckCircle, Link2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import type { AccountMapping, ReportCategory, ForecastPLLine } from '../types'
import UnmappedAccountsAlert from './UnmappedAccountsAlert'

const CATEGORIES: ReportCategory[] = [
  'Revenue',
  'Cost of Sales',
  'Operating Expenses',
  'Other Income',
  'Other Expenses',
]

interface AccountMappingEditorProps {
  businessId: string
  mappings: AccountMapping[]
  unmapped: { account_name: string; account_type: string; section: string }[]
  isLoading: boolean
  onAutoMap: () => Promise<any>
  onSaveMapping: (mapping: Partial<AccountMapping>) => Promise<any>
  onConfirmAll: () => Promise<any>
  onRefresh: () => void
}

export default function AccountMappingEditor({
  businessId,
  mappings,
  unmapped,
  isLoading,
  onAutoMap,
  onSaveMapping,
  onConfirmAll,
  onRefresh,
}: AccountMappingEditorProps) {
  const [forecastLines, setForecastLines] = useState<ForecastPLLine[]>([])
  const [isAutoMapping, setIsAutoMapping] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  // Load forecast P&L lines for the budget line dropdown
  useEffect(() => {
    async function loadForecastLines() {
      const supabase = createClient()
      // Get the active forecast (resolve business_profiles.id from businesses.id)
      const idsToTry = await resolveBusinessIds(supabase, businessId)
      let forecast: any = null
      for (const id of idsToTry) {
        const { data: fc } = await supabase
          .from('financial_forecasts')
          .select('id')
          .eq('business_id', id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (fc) { forecast = fc; break }
      }

      if (forecast) {
        const { data: lines } = await supabase
          .from('forecast_pl_lines')
          .select('id, account_name, category, forecast_months')
          .eq('forecast_id', forecast.id)

        setForecastLines(lines || [])
      }
    }
    if (businessId) loadForecastLines()
  }, [businessId])

  const handleAutoMap = async () => {
    setIsAutoMapping(true)
    try {
      const result = await onAutoMap()
      if (result.mapped_count === 0) {
        toast.error('No Xero accounts found. Please click "Sync P&L Data" on the Xero banner above first.')
      } else {
        const codeInfo = result.matched_by_code ? ` (${result.matched_by_code} by code, ${result.matched_by_name} by name)` : ''
        toast.success(`Auto-mapped ${result.mapped_count} accounts — ${result.matched_to_forecast_count} matched to budget${codeInfo}`)
      }
    } catch (err) {
      toast.error('Failed to auto-map accounts')
    } finally {
      setIsAutoMapping(false)
    }
  }

  const handleConfirmAll = async () => {
    setIsConfirming(true)
    try {
      const count = await onConfirmAll()
      toast.success(`Confirmed ${count} mappings`)
    } catch (err) {
      toast.error('Failed to confirm mappings')
    } finally {
      setIsConfirming(false)
    }
  }

  const handleCategoryChange = async (mapping: AccountMapping, newCategory: ReportCategory) => {
    try {
      await onSaveMapping({
        xero_account_name: mapping.xero_account_name,
        xero_account_code: mapping.xero_account_code,
        xero_account_type: mapping.xero_account_type,
        report_category: newCategory,
        is_confirmed: true,
      })
      toast.success(`Updated ${mapping.xero_account_name}`)
    } catch (err) {
      toast.error('Failed to update mapping')
    }
  }

  const handleForecastLineChange = async (mapping: AccountMapping, forecastLineId: string) => {
    const forecastLine = forecastLines.find(l => l.id === forecastLineId)
    try {
      await onSaveMapping({
        xero_account_name: mapping.xero_account_name,
        report_category: mapping.report_category,
        forecast_pl_line_id: forecastLineId || null,
        forecast_pl_line_name: forecastLine?.account_name || null,
        is_confirmed: true,
      })
      toast.success(`Linked ${mapping.xero_account_name} to ${forecastLine?.account_name || 'none'}`)
    } catch (err) {
      toast.error('Failed to update mapping')
    }
  }

  const unconfirmedCount = mappings.filter(m => !m.is_confirmed).length
  const matchedCount = mappings.filter(m => m.forecast_pl_line_id).length
  const unmatchedCount = mappings.filter(m => !m.forecast_pl_line_id).length

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Account Mappings ({mappings.length})
          </h3>
          {matchedCount > 0 && (
            <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              {matchedCount} matched
            </span>
          )}
          {unmatchedCount > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Unlink className="w-3 h-3" />
              {unmatchedCount} no budget line
            </span>
          )}
          {unconfirmedCount > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              {unconfirmedCount} unconfirmed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoMap}
            disabled={isAutoMapping || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-brand-navy text-white hover:bg-brand-navy-800 transition-colors disabled:opacity-50"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {isAutoMapping ? 'Mapping...' : 'Auto-Map'}
          </button>
          {unconfirmedCount > 0 && (
            <button
              onClick={handleConfirmAll}
              disabled={isConfirming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isConfirming ? 'Confirming...' : 'Confirm All'}
            </button>
          )}
        </div>
      </div>

      {/* Unmapped alert */}
      <div className="px-4 pt-3">
        <UnmappedAccountsAlert
          count={unmapped.length}
          onAutoMap={handleAutoMap}
          isLoading={isAutoMapping}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left font-medium">Xero Account</th>
              <th className="px-4 py-3 text-left font-medium">Report Category</th>
              <th className="px-4 py-3 text-left font-medium">Matched Budget Line</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 && !isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                  No account mappings yet. Click &quot;Auto-Map&quot; to get started.
                </td>
              </tr>
            )}
            {mappings.map((mapping) => (
              <tr key={mapping.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="text-sm text-gray-900 font-medium">
                    {mapping.xero_account_name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {mapping.xero_account_code && (
                      <span className="text-xs text-gray-400 font-mono">{mapping.xero_account_code}</span>
                    )}
                    {mapping.xero_account_type && (
                      <span className="text-xs text-gray-400">{mapping.xero_account_type}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={mapping.report_category}
                    onChange={(e) => handleCategoryChange(mapping, e.target.value as ReportCategory)}
                    className="text-sm rounded border-gray-300 py-1 px-2 focus:border-brand-orange focus:ring-brand-orange"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={mapping.forecast_pl_line_id || ''}
                    onChange={(e) => handleForecastLineChange(mapping, e.target.value)}
                    className={`text-sm rounded border-gray-300 py-1 px-2 focus:border-brand-orange focus:ring-brand-orange max-w-[220px] ${
                      !mapping.forecast_pl_line_id ? 'text-gray-400' : ''
                    }`}
                  >
                    <option value="">— No budget line —</option>
                    {forecastLines.map(line => (
                      <option key={line.id} value={line.id}>{line.account_name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {mapping.is_confirmed ? (
                    <Check className="w-4 h-4 text-green-600 inline" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500 inline" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
