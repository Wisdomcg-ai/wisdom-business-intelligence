'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveBusinessId } from '@/lib/business/resolveBusinessId'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { Loader2, Banknote } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ForecastService from '@/app/finances/forecast/services/forecast-service'
import type { FinancialForecast, PLLine, XeroConnection } from '@/app/finances/forecast/types'
import CashflowForecastTab from '@/app/finances/forecast/components/CashflowForecastTab'
import { getForecastFiscalYear } from '@/app/finances/forecast/utils/fiscal-year'
import { useXeroKeepalive } from '@/hooks/useXeroKeepalive'
import { DataIntegrityBanner } from '@/components/data-integrity/DataIntegrityBanner'
import type { DataQuality, PerTenantQuality } from '@/lib/services/forecast-read-service'

export default function CashflowForecastPage() {
  const supabase = createClient()
  const { activeBusiness, currentUser, isLoading: contextLoading } = useBusinessContext()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [businessId, setBusinessId] = useState('')
  const [forecast, setForecast] = useState<FinancialForecast | null>(null)
  const [plLines, setPlLines] = useState<PLLine[]>([])
  const [xeroConnection, setXeroConnection] = useState<XeroConnection | null>(null)
  const [error, setError] = useState<string | null>(null)
  // D-44.2-03 read-path quality gate from /api/forecast/cashflow/xero-actuals.
  const [dataQuality, setDataQuality] = useState<DataQuality>('verified')
  const [perTenantQuality, setPerTenantQuality] = useState<PerTenantQuality[]>([])

  // Keep Xero tokens fresh
  useXeroKeepalive(businessId || null, !!xeroConnection)

  useEffect(() => {
    setMounted(true)
    if (!contextLoading) {
      loadData()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadData = async () => {
    try {
      setIsLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsLoading(false)
        return
      }

      // Business resolution via the shared role-aware helper.
      const { businessId: bizId } = await resolveBusinessId(supabase, {
        userId: user.id,
        role: currentUser?.role ?? null,
        activeBusinessId: activeBusiness?.id ?? null,
      })
      if (!bizId) {
        setIsLoading(false)
        return
      }
      setBusinessId(bizId)

      // Get active forecast
      const fiscalYear = getForecastFiscalYear()
      const { forecast: loadedForecast, error: forecastError } =
        await ForecastService.getOrCreateForecast(bizId, user.id, fiscalYear)

      if (forecastError || !loadedForecast) {
        setError('No forecast found. Create a forecast first.')
        setIsLoading(false)
        return
      }

      setForecast(loadedForecast)

      // Load P&L lines
      const lines = await ForecastService.loadPLLines(loadedForecast.id!)
      setPlLines(lines)

      // Load Xero connection
      try {
        const statusRes = await fetch(`/api/Xero/status?business_id=${bizId}`)
        const statusData = await statusRes.json()
        if (statusData.connected && statusData.connection) {
          setXeroConnection(statusData.connection)
        }
      } catch (err) {
        console.error('[Cashflow] Error loading Xero connection:', err)
        const xeroConn = await ForecastService.getXeroConnection(bizId)
        setXeroConnection(xeroConn)
      }

      // D-44.2-03 — read-path quality from cashflow xero-actuals endpoint.
      try {
        const params = new URLSearchParams({ business_id: bizId })
        if (loadedForecast.id) params.set('forecast_id', loadedForecast.id)
        const qualityRes = await fetch(`/api/forecast/cashflow/xero-actuals?${params.toString()}`)
        if (qualityRes.ok) {
          const qualityData = await qualityRes.json()
          if (qualityData.data_quality) setDataQuality(qualityData.data_quality)
          if (Array.isArray(qualityData.per_tenant_quality)) setPerTenantQuality(qualityData.per_tenant_quality)
        }
      } catch {
        // Non-blocking — banner stays as 'verified' (silent) on fetch failure.
      }

      setIsLoading(false)
    } catch (err) {
      console.error('[Cashflow] Error loading data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
      setIsLoading(false)
    }
  }

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading cashflow forecast...</p>
        </div>
      </div>
    )
  }

  if (!businessId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md text-center px-6">
          <Banknote className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No client selected</h2>
          <p className="text-gray-600 mb-4">
            Open a client from the coach portal to view their cashflow forecast.
          </p>
          <a
            href="/coach/clients"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            Go to Clients
          </a>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto pt-12">
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <Banknote className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Cashflow Forecast</h2>
            <p className="text-sm text-gray-500">{error}</p>
            <button
              onClick={() => { setError(null); loadData() }}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="Cashflow Forecast"
        subtitle={forecast?.name || 'Cash position month by month'}
        icon={Banknote}
      />

      {/* D-44.2-02 — read-path data integrity banner. Renders nothing when verified. */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <DataIntegrityBanner
          quality={dataQuality}
          perTenantQuality={perTenantQuality}
          lastSyncAt={perTenantQuality[0]?.last_sync_at ?? null}
        />
      </div>

      <div className="max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8">
        {forecast && (
          <CashflowForecastTab
            forecast={forecast}
            plLines={plLines}
            businessId={businessId}
            hasXeroConnection={!!xeroConnection}
          />
        )}
      </div>
    </div>
  )
}
