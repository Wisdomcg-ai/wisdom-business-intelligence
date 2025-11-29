// /src/components/todos/hooks/useMorningRitual.ts
// Hook for managing morning ritual state and tracking

import { useState, useEffect, useCallback } from 'react'
import type { SupabaseClient } from '@supabase/auth-helpers-nextjs'
import type { MorningRitualState } from '../utils/types'

export function useMorningRitual(
  supabase: SupabaseClient,
  businessId: string,
  userId: string
) {
  const [ritualState, setRitualState] = useState<MorningRitualState>({
    lastCompleted: null,
    currentStreak: 0,
    totalCompleted: 0,
    todaysMust: null,
    todaysTopThree: []
  })
  
  // Check if ritual was completed today
  const checkRitualStatus = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Check for today's daily MUSTs record
      const { data: todaysMusts } = await supabase
        .from('daily_musts')
        .select('*')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .eq('date', today)
        .single()
      
      if (todaysMusts && todaysMusts.completed_at) {
        setRitualState(prev => ({
          ...prev,
          lastCompleted: todaysMusts.completed_at,
          todaysMust: todaysMusts.must_task_id,
          todaysTopThree: [
            todaysMusts.top_three_1_id,
            todaysMusts.top_three_2_id,
            todaysMusts.top_three_3_id
          ].filter(Boolean)
        }))
      }
      
      // Calculate streak
      const { data: recentMusts } = await supabase
        .from('daily_musts')
        .select('date, completed_at')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .order('date', { ascending: false })
        .limit(30)
      
      if (recentMusts && recentMusts.length > 0) {
        let streak = 0
        const dates = recentMusts.map(m => new Date(m.date))
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        for (let i = 0; i < dates.length; i++) {
          const checkDate = new Date(today)
          checkDate.setDate(checkDate.getDate() - i)
          checkDate.setHours(0, 0, 0, 0)
          
          const hasEntry = dates.some(d => {
            const entryDate = new Date(d)
            entryDate.setHours(0, 0, 0, 0)
            return entryDate.getTime() === checkDate.getTime()
          })
          
          if (hasEntry) {
            streak++
          } else if (i > 0) {
            // Skip today if checking streak, but break if missing day in past
            break
          }
        }
        
        setRitualState(prev => ({
          ...prev,
          currentStreak: streak,
          totalCompleted: recentMusts.length
        }))
      }
    } catch (error) {
      console.error('Error checking ritual status:', error)
    }
  }, [supabase, businessId, userId])
  
  // Start morning ritual
  const startRitual = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    
    try {
      // Create or update today's daily_musts record
      const { data: existing } = await supabase
        .from('daily_musts')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .eq('date', today)
        .single()
      
      if (!existing) {
        await supabase
          .from('daily_musts')
          .insert([{
            business_id: businessId,
            user_id: userId,
            date: today,
            completed_at: null
          }])
      }
      
      return true
    } catch (error) {
      console.error('Error starting ritual:', error)
      return false
    }
  }, [supabase, businessId, userId])
  
  // Complete morning ritual
  const completeRitual = useCallback(async (
    mustTaskId: string | null,
    topThreeIds: string[],
    reflection?: string
  ) => {
    const today = new Date().toISOString().split('T')[0]
    
    try {
      // Update daily_musts record
      const { error } = await supabase
        .from('daily_musts')
        .update({
          must_task_id: mustTaskId,
          top_three_1_id: topThreeIds[0] || null,
          top_three_2_id: topThreeIds[1] || null,
          top_three_3_id: topThreeIds[2] || null,
          completed_at: new Date().toISOString(),
          reflection_notes: reflection || null
        })
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .eq('date', today)
      
      if (error) throw error
      
      // Update todo items with MUST flags
      // Clear all existing MUST flags first
      await supabase
        .from('todo_items')
        .update({ is_must: false, is_top_three: false })
        .eq('business_id', businessId)
      
      // Set new MUST flag
      if (mustTaskId) {
        await supabase
          .from('todo_items')
          .update({ is_must: true })
          .eq('id', mustTaskId)
      }
      
      // Set TOP 3 flags
      for (const id of topThreeIds) {
        if (id) {
          await supabase
            .from('todo_items')
            .update({ is_top_three: true })
            .eq('id', id)
        }
      }
      
      // Update local state
      await checkRitualStatus()
      
      return true
    } catch (error) {
      console.error('Error completing ritual:', error)
      return false
    }
  }, [supabase, businessId, userId, checkRitualStatus])
  
  // Initial load
  useEffect(() => {
    checkRitualStatus()
  }, [checkRitualStatus])
  
  return {
    ritualState,
    startRitual,
    completeRitual,
    checkRitualStatus
  }
}