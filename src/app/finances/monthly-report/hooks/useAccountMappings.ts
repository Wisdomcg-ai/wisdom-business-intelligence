import { useState, useCallback } from 'react'
import type { AccountMapping } from '../types'

interface UnmappedAccount {
  account_name: string
  account_type: string
  section: string
}

export function useAccountMappings(businessId: string) {
  const [mappings, setMappings] = useState<AccountMapping[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedAccount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMappings = useCallback(async () => {
    if (!businessId) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/monthly-report/account-mappings?business_id=${businessId}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load mappings')
        return
      }

      setMappings(data.mappings || [])
      setUnmapped(data.unmapped || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mappings')
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  const saveMapping = useCallback(async (mapping: Partial<AccountMapping>) => {
    try {
      const res = await fetch('/api/monthly-report/account-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, ...mapping }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Refresh
      await loadMappings()
      return data.mapping
    } catch (err) {
      console.error('[useAccountMappings] Save error:', err)
      throw err
    }
  }, [businessId, loadMappings])

  const confirmAll = useCallback(async () => {
    try {
      const unconfirmedIds = mappings.filter(m => !m.is_confirmed).map(m => m.id!)
      if (unconfirmedIds.length === 0) return

      const res = await fetch('/api/monthly-report/account-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, mapping_ids: unconfirmedIds }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      await loadMappings()
      return data.confirmed_count
    } catch (err) {
      console.error('[useAccountMappings] Confirm all error:', err)
      throw err
    }
  }, [businessId, mappings, loadMappings])

  const autoMap = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/monthly-report/auto-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      await loadMappings()
      return data
    } catch (err) {
      console.error('[useAccountMappings] Auto-map error:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [businessId, loadMappings])

  return {
    mappings,
    unmapped,
    isLoading,
    error,
    loadMappings,
    saveMapping,
    confirmAll,
    autoMap,
  }
}
