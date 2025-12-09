/**
 * usePresence Hook
 * Real-time presence tracking for collaborative editing
 * Shows who's viewing/editing pages and provides soft edit locking
 */

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface PresenceUser {
  user_id: string
  user_name: string
  user_avatar?: string
  page_path: string
  is_editing: boolean
  last_seen: string
}

interface UsePresenceOptions {
  businessId: string
  pagePath: string
  userId: string
  userName: string
  userAvatar?: string
}

interface UsePresenceReturn {
  /** Users currently viewing this page */
  viewingUsers: PresenceUser[]
  /** Users currently editing this page */
  editingUsers: PresenceUser[]
  /** All users online in this business */
  onlineUsers: PresenceUser[]
  /** Is the current user marked as editing */
  isEditing: boolean
  /** Set the current user's editing state */
  setEditing: (editing: boolean) => void
  /** Is another user currently editing this page */
  someoneElseEditing: boolean
  /** The user who is currently editing (if any) */
  currentEditor: PresenceUser | null
  /** Connection status */
  isConnected: boolean
}

const HEARTBEAT_INTERVAL = 30000 // 30 seconds
const STALE_THRESHOLD = 120000 // 2 minutes

export function usePresence(options: UsePresenceOptions): UsePresenceReturn {
  const { businessId, pagePath, userId, userName, userAvatar } = options

  const [viewingUsers, setViewingUsers] = useState<PresenceUser[]>([])
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const [isEditing, setIsEditingState] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  // Track presence in database for persistence
  const updateDatabasePresence = useCallback(async (editing: boolean) => {
    try {
      await supabase.from('active_editors').upsert(
        {
          business_id: businessId,
          user_id: userId,
          user_name: userName,
          user_avatar: userAvatar,
          page_path: pagePath,
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: 'business_id,user_id,page_path' }
      )
    } catch (error) {
      console.error('[Presence] Failed to update database:', error)
    }
  }, [businessId, userId, userName, userAvatar, pagePath, supabase])

  // Remove presence from database
  const removeDatabasePresence = useCallback(async () => {
    try {
      await supabase
        .from('active_editors')
        .delete()
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .eq('page_path', pagePath)
    } catch (error) {
      console.error('[Presence] Failed to remove from database:', error)
    }
  }, [businessId, userId, pagePath, supabase])

  // Set editing state and broadcast
  const setEditing = useCallback(async (editing: boolean) => {
    setIsEditingState(editing)

    if (channelRef.current) {
      await channelRef.current.track({
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        page_path: pagePath,
        is_editing: editing,
        last_seen: new Date().toISOString(),
      })
    }
  }, [userId, userName, userAvatar, pagePath])

  // Initialize presence channel
  useEffect(() => {
    if (!businessId || !userId) return

    const channelName = `presence:${businessId}`
    const channel = supabase.channel(channelName)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const allUsers: PresenceUser[] = []

        Object.values(state).forEach((presences) => {
          (presences as unknown as PresenceUser[]).forEach((presence) => {
            // Filter out stale presences
            const lastSeen = new Date(presence.last_seen).getTime()
            const now = Date.now()
            if (now - lastSeen < STALE_THRESHOLD) {
              allUsers.push(presence)
            }
          })
        })

        setOnlineUsers(allUsers)
        setViewingUsers(allUsers.filter((u) => u.page_path === pagePath))
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        // New user joined
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // User left
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)

          // Track our presence
          await channel.track({
            user_id: userId,
            user_name: userName,
            user_avatar: userAvatar,
            page_path: pagePath,
            is_editing: false,
            last_seen: new Date().toISOString(),
          })

          // Update database presence
          await updateDatabasePresence(false)
        } else {
          setIsConnected(false)
        }
      })

    channelRef.current = channel

    // Heartbeat to keep presence alive
    heartbeatRef.current = setInterval(async () => {
      if (channelRef.current) {
        await channelRef.current.track({
          user_id: userId,
          user_name: userName,
          user_avatar: userAvatar,
          page_path: pagePath,
          is_editing: isEditing,
          last_seen: new Date().toISOString(),
        })
        await updateDatabasePresence(isEditing)
      }
    }, HEARTBEAT_INTERVAL)

    // Cleanup on unmount
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }

      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }

      // Remove from database
      removeDatabasePresence()
    }
  }, [businessId, userId, userName, userAvatar, pagePath, isEditing, supabase, updateDatabasePresence, removeDatabasePresence])

  // Calculate derived state
  const editingUsers = viewingUsers.filter((u) => u.is_editing && u.user_id !== userId)
  const someoneElseEditing = editingUsers.length > 0
  const currentEditor = editingUsers[0] || null

  return {
    viewingUsers: viewingUsers.filter((u) => u.user_id !== userId),
    editingUsers,
    onlineUsers: onlineUsers.filter((u) => u.user_id !== userId),
    isEditing,
    setEditing,
    someoneElseEditing,
    currentEditor,
    isConnected,
  }
}

/**
 * Simplified hook for pages that just need to know if someone else is editing
 */
export function useEditLock(options: UsePresenceOptions) {
  const presence = usePresence(options)

  const startEditing = useCallback(async () => {
    if (presence.someoneElseEditing) {
      // Return false to indicate edit was blocked
      return {
        allowed: false,
        blocker: presence.currentEditor,
      }
    }

    await presence.setEditing(true)
    return { allowed: true, blocker: null }
  }, [presence])

  const stopEditing = useCallback(async () => {
    await presence.setEditing(false)
  }, [presence])

  return {
    ...presence,
    startEditing,
    stopEditing,
  }
}
