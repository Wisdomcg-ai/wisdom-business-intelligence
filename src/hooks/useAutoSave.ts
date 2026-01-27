/**
 * useAutoSave Hook
 * ================
 *
 * A reusable hook for implementing reliable auto-save functionality across the platform.
 *
 * Features:
 * - Debounced saves (configurable, default 2s)
 * - Dirty state tracking (only saves when user makes changes)
 * - Load-complete flag (prevents saving during initial data load)
 * - Empty state guard (prevents saving empty/invalid data)
 * - JSON comparison (skips save if data unchanged)
 * - localStorage backup for crash recovery
 * - Save status indicator support
 *
 * Usage:
 * ```typescript
 * const { setDirty, saveStatus, markLoadComplete } = useAutoSave({
 *   data: formData,
 *   saveFunction: async (data) => {
 *     const { error } = await supabase.from('table').upsert(data)
 *     return { success: !error, error: error?.message }
 *   },
 *   storageKey: 'my-form-backup',
 *   emptyStateGuard: (data) => !data.name || !data.email
 * })
 *
 * // Call setDirty() in your onChange handlers
 * // Call markLoadComplete() after initial data loads
 * ```
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { logSaveError } from '@/lib/error-logger'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface UseAutoSaveOptions<T> {
  /** The data to auto-save */
  data: T
  /** Function to perform the save operation */
  saveFunction: (data: T) => Promise<{ success: boolean; error?: string }>
  /** Debounce delay in milliseconds (default: 2000) */
  debounceMs?: number
  /** Enable/disable auto-save (default: true) */
  isEnabled?: boolean
  /** Returns true if data is empty/invalid and should NOT be saved */
  emptyStateGuard?: (data: T) => boolean
  /** localStorage key for backup (optional) */
  storageKey?: string
  /** Callback when save completes */
  onSaveComplete?: (success: boolean, error?: string) => void
  /** Callback when data is recovered from localStorage */
  onDataRecovered?: (data: T) => void
  /** Component name for error logging */
  component?: string
  /** Business ID for error logging context */
  businessId?: string
}

export interface UseAutoSaveReturn<T> {
  /** Whether there are unsaved changes */
  isDirty: boolean
  /** Mark the data as dirty (call this in onChange handlers) */
  setDirty: () => void
  /** Current save status */
  saveStatus: SaveStatus
  /** Last saved timestamp */
  lastSaved: Date | null
  /** Last error message */
  lastError: string | null
  /** Mark initial load as complete (enables auto-save) */
  markLoadComplete: () => void
  /** Whether initial load is complete */
  isLoadComplete: boolean
  /** Force an immediate save */
  forceSave: () => Promise<void>
  /** Clear the dirty flag without saving */
  clearDirty: () => void
  /** Clear localStorage backup */
  clearBackup: () => void
  /** Check if there's a backup available */
  hasBackup: boolean
  /** Recover data from backup */
  recoverFromBackup: () => T | null
}

export function useAutoSave<T>({
  data,
  saveFunction,
  debounceMs = 2000,
  isEnabled = true,
  emptyStateGuard,
  storageKey,
  onSaveComplete,
  onDataRecovered,
  component = 'unknown',
  businessId
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  // State
  const [isDirty, setIsDirty] = useState(false)
  const [isLoadComplete, setIsLoadComplete] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [hasBackup, setHasBackup] = useState(false)

  // Refs for avoiding stale closures
  const dataRef = useRef<T>(data)
  const lastSavedDataRef = useRef<string>('')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = useRef(false)

  // Update data ref when data changes
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Check for backup on mount
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      const backup = localStorage.getItem(storageKey)
      setHasBackup(!!backup)
    }
  }, [storageKey])

  // Save to localStorage backup
  const saveBackup = useCallback((dataToBackup: T) => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(dataToBackup))
        localStorage.setItem(`${storageKey}_timestamp`, new Date().toISOString())
        setHasBackup(true)
      } catch (e) {
        console.warn('Failed to save backup to localStorage:', e)
      }
    }
  }, [storageKey])

  // Clear localStorage backup
  const clearBackup = useCallback(() => {
    if (storageKey && typeof window !== 'undefined') {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(`${storageKey}_timestamp`)
      setHasBackup(false)
    }
  }, [storageKey])

  // Recover from backup
  const recoverFromBackup = useCallback((): T | null => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const backup = localStorage.getItem(storageKey)
        if (backup) {
          const recoveredData = JSON.parse(backup) as T
          onDataRecovered?.(recoveredData)
          return recoveredData
        }
      } catch (e) {
        console.warn('Failed to recover from backup:', e)
      }
    }
    return null
  }, [storageKey, onDataRecovered])

  // Perform the actual save
  const performSave = useCallback(async () => {
    // Guard: Don't save if already saving
    if (isSavingRef.current) return

    // Guard: Don't save if load not complete
    if (!isLoadComplete) {
      console.log('[AutoSave] Skipping save - load not complete')
      return
    }

    // Guard: Don't save if not dirty
    if (!isDirty) {
      console.log('[AutoSave] Skipping save - not dirty')
      return
    }

    // Guard: Check empty state
    const currentData = dataRef.current
    if (emptyStateGuard && emptyStateGuard(currentData)) {
      console.log('[AutoSave] Skipping save - empty state guard triggered')
      return
    }

    // Guard: Check if data actually changed (JSON comparison)
    const currentDataJson = JSON.stringify(currentData)
    if (currentDataJson === lastSavedDataRef.current) {
      console.log('[AutoSave] Skipping save - data unchanged')
      setIsDirty(false)
      return
    }

    // Perform save
    isSavingRef.current = true
    setSaveStatus('saving')
    setLastError(null)

    try {
      // Save backup before attempting save
      saveBackup(currentData)

      const result = await saveFunction(currentData)

      if (result.success) {
        lastSavedDataRef.current = currentDataJson
        setLastSaved(new Date())
        setSaveStatus('saved')
        setIsDirty(false)
        clearBackup() // Clear backup on successful save
        console.log('[AutoSave] Save successful')
      } else {
        setLastError(result.error || 'Save failed')
        setSaveStatus('error')
        console.error('[AutoSave] Save failed:', result.error)
        logSaveError(component, result.error || 'Save failed', businessId)
      }

      onSaveComplete?.(result.success, result.error)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setLastError(errorMessage)
      setSaveStatus('error')
      console.error('[AutoSave] Save error:', error)
      logSaveError(component, errorMessage, businessId)
      onSaveComplete?.(false, errorMessage)
    } finally {
      isSavingRef.current = false
    }
  }, [isLoadComplete, isDirty, emptyStateGuard, saveFunction, saveBackup, clearBackup, onSaveComplete])

  // Force immediate save
  const forceSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    await performSave()
  }, [performSave])

  // Set dirty and trigger debounced save
  const setDirty = useCallback(() => {
    if (!isEnabled) return

    setIsDirty(true)

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new debounced save
    saveTimeoutRef.current = setTimeout(() => {
      performSave()
    }, debounceMs)
  }, [isEnabled, debounceMs, performSave])

  // Clear dirty without saving
  const clearDirty = useCallback(() => {
    setIsDirty(false)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
  }, [])

  // Mark load as complete
  const markLoadComplete = useCallback(() => {
    // Store current data as "last saved" to prevent immediate save
    lastSavedDataRef.current = JSON.stringify(dataRef.current)
    setIsLoadComplete(true)
    console.log('[AutoSave] Load complete - auto-save enabled')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Save on page unload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && isLoadComplete) {
        // Save backup
        saveBackup(dataRef.current)
        // Show browser warning
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, isLoadComplete, saveBackup])

  // Reset saved status after 3 seconds
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [saveStatus])

  return {
    isDirty,
    setDirty,
    saveStatus,
    lastSaved,
    lastError,
    markLoadComplete,
    isLoadComplete,
    forceSave,
    clearDirty,
    clearBackup,
    hasBackup,
    recoverFromBackup
  }
}

/**
 * SaveStatusIndicator Component
 * A simple component to display save status
 */
export function getSaveStatusText(status: SaveStatus, lastSaved: Date | null): string {
  switch (status) {
    case 'saving':
      return 'Saving...'
    case 'saved':
      return 'All changes saved'
    case 'error':
      return 'Failed to save'
    case 'idle':
      if (lastSaved) {
        const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000)
        if (seconds < 60) return 'All changes saved'
        if (seconds < 3600) return `Saved ${Math.floor(seconds / 60)}m ago`
        return `Saved ${Math.floor(seconds / 3600)}h ago`
      }
      return ''
    default:
      return ''
  }
}

export function getSaveStatusColor(status: SaveStatus): string {
  switch (status) {
    case 'saving':
      return 'text-amber-600'
    case 'saved':
      return 'text-green-600'
    case 'error':
      return 'text-red-600'
    default:
      return 'text-gray-500'
  }
}
