'use client'

/**
 * Phase 67 Tier B — surfaces which Xero tenants are being consolidated
 * for the current business, with currency annotation for non-AUD tenants.
 *
 * Renders NOTHING when there's only one active tenant (single-tenant
 * single-currency = no risk of the "phantom mismatch" trap). For
 * multi-tenant, lists the tenant display names; for any non-AUD tenant,
 * annotates "(CCY → AUD)" so the operator sees that FX translation is
 * happening. Prevents the IICT-style trap where the user reconciles
 * against a Calxa export that includes a different set of members.
 */
import { useEffect, useState } from 'react'

type Tenant = {
  tenant_id: string
  tenant_name: string
  display_name: string | null
  functional_currency: string
  include_in_consolidation: boolean
}

interface Props {
  businessId: string | null | undefined
}

export function ConsolidatedMembersBadge({ businessId }: Props) {
  const [tenants, setTenants] = useState<Tenant[] | null>(null)

  useEffect(() => {
    if (!businessId) {
      setTenants(null)
      return
    }
    let aborted = false
    fetch(`/api/Xero/active-tenants?business_id=${encodeURIComponent(businessId)}`)
      .then(async (res) => {
        if (!res.ok || aborted) return
        const data = await res.json()
        if (!aborted) setTenants(Array.isArray(data.tenants) ? data.tenants : [])
      })
      .catch(() => {
        if (!aborted) setTenants([])
      })
    return () => {
      aborted = true
    }
  }, [businessId])

  if (!tenants || tenants.length <= 1) return null

  const included = tenants.filter((t) => t.include_in_consolidation)
  if (included.length <= 1) return null

  const hasNonAud = included.some((t) => t.functional_currency !== 'AUD')

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
      <div className="font-medium text-blue-900">
        Consolidating {included.length} tenants
        {hasNonAud && <span className="ml-2 text-xs font-normal text-blue-700">(FX-translated to AUD)</span>}
      </div>
      <ul className="mt-1 text-blue-800">
        {included.map((t) => {
          const name = t.display_name || t.tenant_name
          const isFx = t.functional_currency !== 'AUD'
          return (
            <li key={t.tenant_id} className="text-xs">
              • {name}
              {isFx && (
                <span className="ml-1 text-blue-600">
                  ({t.functional_currency} → AUD)
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
