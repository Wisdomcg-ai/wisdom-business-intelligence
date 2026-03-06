'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface AsyncDataState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

interface UseAsyncDataReturn<T> extends AsyncDataState<T> {
  refetch: () => Promise<void>
}

/**
 * Hook for consistent async data fetching with loading/error states.
 *
 * Replaces the 50+ copies of the useState/useEffect/try-catch-finally pattern
 * scattered across the codebase. Handles:
 * - Loading state management
 * - Error capture
 * - Cleanup on unmount (prevents state updates after unmount)
 * - Manual refetch capability
 *
 * Usage:
 *   const { data, loading, error, refetch } = useAsyncData(
 *     () => fetchBusinessData(businessId),
 *     [businessId]
 *   )
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: React.DependencyList = []
): UseAsyncDataReturn<T> {
  const [state, setState] = useState<AsyncDataState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  const isMountedRef = useRef(true)

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const result = await fetchFn()
      if (isMountedRef.current) {
        setState({ data: result, loading: false, error: null })
      }
    } catch (err) {
      if (isMountedRef.current) {
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    isMountedRef.current = true
    execute()

    return () => {
      isMountedRef.current = false
    }
  }, [execute])

  return {
    ...state,
    refetch: execute,
  }
}

/**
 * Hook for async API calls (mutations) with loading/error states.
 *
 * Unlike useAsyncData, this doesn't auto-execute — you call the returned
 * function when ready (e.g., on form submit or button click).
 *
 * Usage:
 *   const { execute: saveGoals, loading: saving, error } = useAsyncAction(
 *     async (goals) => {
 *       const res = await fetch('/api/goals', { method: 'POST', body: JSON.stringify(goals) })
 *       if (!res.ok) throw new Error('Failed to save')
 *       return res.json()
 *     }
 *   )
 *
 *   <button onClick={() => saveGoals(formData)} disabled={saving}>Save</button>
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  actionFn: (...args: TArgs) => Promise<TResult>
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const execute = useCallback(async (...args: TArgs): Promise<TResult | null> => {
    setLoading(true)
    setError(null)

    try {
      const result = await actionFn(...args)
      if (isMountedRef.current) {
        setLoading(false)
      }
      return result
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      }
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { execute, loading, error }
}
