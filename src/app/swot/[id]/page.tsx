'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { SwotGrid } from '@/components/swot/SwotGrid'
import type { SwotCategory, SwotItem, SwotGridData } from '@/lib/swot/types'
import { useBusinessContext } from '@/hooks/useBusinessContext'

interface SwotAnalysis {
  id: string
  quarter: number
  year: number
  type: string
  status: string
  swot_score: number
  finalized_at: string | null
  created_at: string
  updated_at: string
}

export default function SwotDetailPage() {
  const router = useRouter()
  const params = useParams()
  const swotId = params?.id as string
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [analysis, setAnalysis] = useState<SwotAnalysis | null>(null)
  const [items, setItems] = useState<SwotGridData>({
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    if (!contextLoading) {
      loadSwotDetail()
    }
  }, [swotId, contextLoading, activeBusiness?.id])

  const loadSwotDetail = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Please log in to view this SWOT')
        return
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id

      // Fetch SWOT analysis
      const { data: swotData, error: swotError } = await supabase
        .from('swot_analyses')
        .select('*')
        .eq('id', swotId)
        .eq('business_id', targetUserId)
        .single()

      if (swotError) {
        console.error('Error fetching SWOT:', swotError)
        setError('SWOT analysis not found')
        return
      }

      setAnalysis(swotData)

      // Fetch SWOT items
      const { data: itemsData, error: itemsError } = await supabase
        .from('swot_items')
        .select('*')
        .eq('swot_analysis_id', swotId)
        .order('priority_order', { ascending: true })

      if (itemsError) {
        console.error('Error fetching items:', itemsError)
        setError('Failed to load SWOT items')
        return
      }

      // Group items by category
      const grouped: SwotGridData = {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: []
      }

      // Cast database response to SwotItem[] (database schema matches the type)
      const typedItems = itemsData as SwotItem[]
      typedItems.forEach((item) => {
        switch (item.category) {
          case 'strength':
            grouped.strengths.push(item)
            break
          case 'weakness':
            grouped.weaknesses.push(item)
            break
          case 'opportunity':
            grouped.opportunities.push(item)
            break
          case 'threat':
            grouped.threats.push(item)
            break
        }
      })

      setItems(grouped)
    } catch (err) {
      console.error('Error:', err)
      setError('An error occurred while loading the SWOT analysis')
    } finally {
      setLoading(false)
    }
  }

  const getQuarterLabel = (quarter: number, year: number) => {
    return `Q${quarter} ${year}`
  }

  const getCategoryKey = (category: SwotCategory): keyof SwotGridData => {
    switch (category) {
      case 'strength':
        return 'strengths'
      case 'weakness':
        return 'weaknesses'
      case 'opportunity':
        return 'opportunities'
      case 'threat':
        return 'threats'
    }
  }

  const handleAddItem = async (category: SwotCategory, title: string, description?: string) => {
    if (!analysis) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Please log in to add items.')
        return
      }

      const categoryKey = getCategoryKey(category)

      const { data: newItem, error } = await supabase
        .from('swot_items')
        .insert({
          swot_analysis_id: analysis.id,
          category,
          title,
          description,
          impact_level: 3,
          likelihood: category === 'opportunity' || category === 'threat' ? 3 : null,
          priority_order: items[categoryKey].length,
          status: 'active',
          created_by: user.id
        })
        .select()
        .single()

      if (error) throw error

      setItems(prevItems => {
        const newItems = {
          strengths: [...prevItems.strengths],
          weaknesses: [...prevItems.weaknesses],
          opportunities: [...prevItems.opportunities],
          threats: [...prevItems.threats]
        }
        newItems[categoryKey] = [...newItems[categoryKey], newItem as SwotItem]
        return newItems
      })

      setLastSaved(new Date())
    } catch (err: any) {
      console.error('Error adding item:', err)
      setError(`Failed to add item: ${err?.message || 'Unknown error'}`)
    }
  }

  const handleUpdateItem = async (itemId: string, updates: Partial<SwotItem>) => {
    try {
      const { error } = await supabase
        .from('swot_items')
        .update(updates)
        .eq('id', itemId)

      if (error) throw error

      setItems(prevItems => {
        const newItems = {
          strengths: prevItems.strengths.map(item => item.id === itemId ? { ...item, ...updates } : item),
          weaknesses: prevItems.weaknesses.map(item => item.id === itemId ? { ...item, ...updates } : item),
          opportunities: prevItems.opportunities.map(item => item.id === itemId ? { ...item, ...updates } : item),
          threats: prevItems.threats.map(item => item.id === itemId ? { ...item, ...updates } : item)
        }
        return newItems
      })

      setLastSaved(new Date())
    } catch (err: any) {
      console.error('Error updating item:', err)
      setError(`Failed to update item: ${err?.message || 'Unknown error'}`)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('swot_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      setItems(prevItems => ({
        strengths: prevItems.strengths.filter(item => item.id !== itemId),
        weaknesses: prevItems.weaknesses.filter(item => item.id !== itemId),
        opportunities: prevItems.opportunities.filter(item => item.id !== itemId),
        threats: prevItems.threats.filter(item => item.id !== itemId)
      }))

      setLastSaved(new Date())
    } catch (err: any) {
      console.error('Error deleting item:', err)
      setError(`Failed to delete item: ${err?.message || 'Unknown error'}`)
    }
  }

  const handleReorderItems = async (category: SwotCategory, reorderedItems: SwotItem[]) => {
    const categoryKey = getCategoryKey(category)

    try {
      const updates = reorderedItems.map((item, index) => ({
        id: item.id,
        priority_order: index
      }))

      for (const update of updates) {
        await supabase
          .from('swot_items')
          .update({ priority_order: update.priority_order })
          .eq('id', update.id)
      }

      setItems(prevItems => ({
        ...prevItems,
        [categoryKey]: reorderedItems
      }))

      setLastSaved(new Date())
    } catch (err: any) {
      console.error('Error reordering items:', err)
      setError(`Failed to reorder items: ${err?.message || 'Unknown error'}`)
    }
  }

  const handleSave = async () => {
    if (!analysis) return

    try {
      setSaving(true)

      const totalItems = Object.values(items).flat().length
      const strengthsCount = items.strengths.length
      const opportunitiesCount = items.opportunities.length

      let score = 0
      if (totalItems > 0) {
        const positiveRatio = (strengthsCount + opportunitiesCount) / totalItems
        score = Math.round(positiveRatio * 100)
      }

      const { error } = await supabase
        .from('swot_analyses')
        .update({
          swot_score: score,
          updated_at: new Date().toISOString()
        })
        .eq('id', analysis.id)

      if (error) throw error

      setLastSaved(new Date())
    } catch (err: any) {
      console.error('Error saving:', err)
      setError(`Failed to save: ${err?.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading SWOT Analysis...</p>
        </div>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-red-50 border border-red-200 rounded-md p-8 text-center">
            <p className="text-red-800 mb-4">{error || 'SWOT analysis not found'}</p>
            <button
              onClick={() => router.push('/swot/history')}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600"
            >
              Back to History
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/swot/history" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                SWOT Analysis - {getQuarterLabel(analysis.quarter, analysis.year)}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Created {new Date(analysis.created_at).toLocaleDateString()} • Score: {analysis.swot_score}%
              </p>
            </div>

            <div className="flex items-center gap-3">
              {lastSaved && (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </button>

              {analysis.status === 'final' && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Final
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* SWOT Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-12">
        <SwotGrid
          items={items}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onReorderItems={handleReorderItems}
          isReadOnly={false}
        />
      </div>
    </div>
  )
}
