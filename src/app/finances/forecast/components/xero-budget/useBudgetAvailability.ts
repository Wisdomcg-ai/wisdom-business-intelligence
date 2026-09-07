'use client'

/**
 * One hook behind every "Start from Xero budget" surface (forecast empty
 * state, Forecast Builder selector). Fetches GET /api/Xero/budgets for the
 * TARGET fiscal year and exposes the five-state result plus the flattened
 * (org, budget) choices. A failed CHECK is `failed`, distinct from the API's
 * own `none` — the UI must never render it as "no budget".
 */
import { useCallback, useEffect, useState } from 'react'
import type { BudgetAvailabilityResponse } from '@/lib/xero/budget-availability'
import { listBudgetChoices, type BudgetChoice } from '@/lib/forecast/xero-budget-seed-client'

export type BudgetUiState = BudgetAvailabilityResponse['state'] | 'checking' | 'failed'

export interface BudgetAvailability {
  /** What to render. `checking` while the request is in flight. */
  state: BudgetUiState
  /** Every (org, budget) pair that can be imported. */
  choices: BudgetChoice[]
  /** The one choice when there is exactly one — seed straight away, no picker. */
  singleChoice: BudgetChoice | null
  /** Number of connected orgs in the response (drives "(org name)" hints). */
  orgCount: number
  /** True when a "Start from Xero budget" control should be on screen (enabled or not). */
  ctaVisible: boolean
  /** Re-run the check (the Retry affordance on `failed` / `error`). */
  retry: () => void
}

export function useBudgetAvailability(
  businessId: string | null | undefined,
  fiscalYear: number,
  enabled: boolean,
): BudgetAvailability {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle')
  const [response, setResponse] = useState<BudgetAvailabilityResponse | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!businessId || !enabled) return
    let cancelled = false
    setStatus('loading')

    fetch(`/api/Xero/budgets?business_id=${encodeURIComponent(businessId)}&fiscal_year=${fiscalYear}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as BudgetAvailabilityResponse
      })
      .then((json) => {
        if (cancelled) return
        setResponse(json)
        setStatus('ok')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn('[useBudgetAvailability] budgets fetch failed', err)
        setResponse(null)
        setStatus('failed')
      })

    return () => {
      cancelled = true
    }
  }, [businessId, fiscalYear, enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const choices = status === 'ok' ? listBudgetChoices(response) : []
  const state: BudgetUiState =
    status === 'ok' && response ? response.state : status === 'failed' ? 'failed' : 'checking'

  return {
    state,
    choices,
    singleChoice: choices.length === 1 ? choices[0] : null,
    orgCount: response?.orgs.length ?? 0,
    ctaVisible: enabled && (state === 'available' || state === 'scope_missing'),
    retry,
  }
}
