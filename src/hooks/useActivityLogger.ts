'use client'

import { useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { calculateDiff, describeChanges, describeChange } from '@/lib/audit'

export interface ActivityLogOptions {
  tableName: string
  recordId: string
  action: 'create' | 'update' | 'delete'
  oldData?: Record<string, unknown>
  newData?: Record<string, unknown>
  description?: string
  fieldsToTrack?: string[]
}

export interface UseActivityLoggerReturn {
  logActivity: (options: ActivityLogOptions) => Promise<boolean>
  logCreate: (tableName: string, recordId: string, data: Record<string, unknown>) => Promise<boolean>
  logUpdate: (tableName: string, recordId: string, oldData: Record<string, unknown>, newData: Record<string, unknown>, fieldsToTrack?: string[]) => Promise<boolean>
  logDelete: (tableName: string, recordId: string, data?: Record<string, unknown>) => Promise<boolean>
}

/**
 * Hook to log user activity/changes for audit trail
 * Automatically captures page path, user info, and business context
 */
export function useActivityLogger(): UseActivityLoggerReturn {
  const pathname = usePathname()
  const { activeBusiness } = useBusinessContext()
  const loggingRef = useRef(false)

  const logActivity = useCallback(async (options: ActivityLogOptions): Promise<boolean> => {
    const {
      tableName,
      recordId,
      action,
      oldData,
      newData,
      description,
      fieldsToTrack
    } = options

    // Prevent double logging
    if (loggingRef.current) return true

    // Require business context
    if (!activeBusiness?.id) {
      console.warn('[ActivityLogger] No active business, skipping log')
      return false
    }

    // Calculate changes for updates
    let changes: Record<string, { old: unknown; new: unknown }> | undefined
    let autoDescription = description

    if (action === 'update' && oldData && newData) {
      changes = calculateDiff(oldData, newData, fieldsToTrack)

      // Skip if no actual changes
      if (Object.keys(changes).length === 0) {
        return true
      }

      if (!autoDescription) {
        autoDescription = describeChanges(tableName, changes)
      }
    } else if (action === 'create' && !autoDescription) {
      autoDescription = describeChange(tableName, 'create')
    } else if (action === 'delete' && !autoDescription) {
      autoDescription = describeChange(tableName, 'delete')
    }

    try {
      loggingRef.current = true

      const response = await fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: activeBusiness.id,
          table_name: tableName,
          record_id: recordId,
          action,
          old_value: action === 'delete' ? oldData : undefined,
          new_value: action === 'create' ? newData : undefined,
          changes: action === 'update' ? changes : undefined,
          description: autoDescription,
          page_path: pathname
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('[ActivityLogger] Failed to log:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('[ActivityLogger] Error:', error)
      return false
    } finally {
      loggingRef.current = false
    }
  }, [activeBusiness, pathname])

  const logCreate = useCallback(async (
    tableName: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<boolean> => {
    return logActivity({
      tableName,
      recordId,
      action: 'create',
      newData: data
    })
  }, [logActivity])

  const logUpdate = useCallback(async (
    tableName: string,
    recordId: string,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    fieldsToTrack?: string[]
  ): Promise<boolean> => {
    return logActivity({
      tableName,
      recordId,
      action: 'update',
      oldData,
      newData,
      fieldsToTrack
    })
  }, [logActivity])

  const logDelete = useCallback(async (
    tableName: string,
    recordId: string,
    data?: Record<string, unknown>
  ): Promise<boolean> => {
    return logActivity({
      tableName,
      recordId,
      action: 'delete',
      oldData: data
    })
  }, [logActivity])

  return {
    logActivity,
    logCreate,
    logUpdate,
    logDelete
  }
}

export default useActivityLogger
