'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseUnreadMessagesOptions {
  role: 'client' | 'coach'
  businessId?: string // For clients - their business ID
}

export function useUnreadMessages({ role, businessId }: UseUnreadMessagesOptions) {
  const supabase = createClient()
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadUnreadCount = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (role === 'client') {
        // Client: count messages where recipient is current user and read is false
        // OR sender_type is 'coach' and read is false for their business
        let bId = businessId

        // If no businessId provided, get user's business
        if (!bId) {
          // First try via business_users
          const { data: businessUser } = await supabase
            .from('business_users')
            .select('business_id')
            .eq('user_id', user.id)
            .maybeSingle()

          if (businessUser) {
            bId = businessUser.business_id
          } else {
            // Fallback to owner_id
            const { data: business } = await supabase
              .from('businesses')
              .select('id')
              .eq('owner_id', user.id)
              .maybeSingle()
            bId = business?.id
          }
        }

        if (!bId) {
          setUnreadCount(0)
          setLoading(false)
          return
        }

        const { count, error } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', bId)
          .eq('read', false)
          .neq('sender_id', user.id)

        if (!error) {
          setUnreadCount(count || 0)
        }
      } else {
        // Coach: count unread messages across all assigned businesses
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('assigned_coach_id', user.id)

        if (!businesses || businesses.length === 0) {
          setUnreadCount(0)
          setLoading(false)
          return
        }

        const businessIds = businesses.map(b => b.id)

        const { count, error } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('business_id', businessIds)
          .eq('read', false)
          .neq('sender_id', user.id)

        if (!error) {
          setUnreadCount(count || 0)
        }
      }
    } catch (error) {
      console.error('Error loading unread count:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, role, businessId])

  useEffect(() => {
    loadUnreadCount()

    // Set up real-time subscription
    let channel: RealtimeChannel | null = null

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      channel = supabase
        .channel('messages-count')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages'
          },
          () => {
            // Reload count on any message change
            loadUnreadCount()
          }
        )
        .subscribe()
    }

    setupSubscription()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [loadUnreadCount, supabase])

  const refresh = useCallback(() => {
    loadUnreadCount()
  }, [loadUnreadCount])

  return { unreadCount, loading, refresh }
}

export default useUnreadMessages
