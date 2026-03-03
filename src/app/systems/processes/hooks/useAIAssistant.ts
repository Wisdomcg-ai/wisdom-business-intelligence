'use client'

import { useState, useCallback } from 'react'
import type { ProcessSnapshot, StickyNote } from '@/types/process-builder'
import { STICKY_NOTE_COLORS } from '@/types/process-builder'

interface AIResponse {
  response: string
  suggestions?: string[]
}

export function useAIAssistant() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callAI = useCallback(async (
    stage: string,
    userMessage: string,
    processData: Record<string, unknown>
  ): Promise<AIResponse | null> => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          userMessage,
          processData,
          conversationHistory: [],
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'AI request failed')
      }

      const json = await res.json()
      return { response: json.response }
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * AI Suggest: Reviews existing notes and suggests missing steps
   */
  const suggestMissingSteps = useCallback(async (
    snapshot: ProcessSnapshot,
    processName: string
  ): Promise<StickyNote[]> => {
    const existingSteps = [
      ...snapshot.notes.map((n) => n.text),
      ...snapshot.steps.map((s) => s.action_name),
    ]

    const result = await callAI(
      'step_suggest',
      `Process: "${processName}". Existing steps: ${existingSteps.join(', ')}. Suggest 3-5 missing steps that are commonly forgotten. Return ONLY a JSON array of step name strings, nothing else.`,
      { processName, existingSteps }
    )

    if (!result?.response) return []

    try {
      // Try to parse JSON array from response
      const match = result.response.match(/\[[\s\S]*?\]/)
      if (match) {
        const suggestions: string[] = JSON.parse(match[0])
        return suggestions.map((text) => ({
          id: crypto.randomUUID(),
          text,
          color: STICKY_NOTE_COLORS[4], // purple tint for AI suggestions
        }))
      }
    } catch {
      // If JSON parsing fails, try line-by-line
      const lines = result.response.split('\n').filter((l) => l.trim())
      return lines.slice(0, 5).map((text) => ({
        id: crypto.randomUUID(),
        text: text.replace(/^[-*\d.)\s]+/, '').trim(),
        color: STICKY_NOTE_COLORS[4],
      }))
    }

    return []
  }, [callAI])

  /**
   * AI Check: Reviews the complete diagram and flags issues
   */
  const checkDiagram = useCallback(async (
    snapshot: ProcessSnapshot,
    processName: string
  ): Promise<string | null> => {
    const stepsDesc = snapshot.steps.map((s) =>
      `${s.action_name} (${s.step_type}, lane: ${snapshot.swimlanes.find((l) => l.id === s.swimlane_id)?.name || 'unknown'})`
    ).join('; ')

    const result = await callAI(
      'diagram_check',
      `Process: "${processName}". Steps: ${stepsDesc}. Lanes: ${snapshot.swimlanes.map((l) => l.name).join(', ')}. Review this process and identify: 1) Missing decision points 2) Handoff gaps between roles 3) Disconnected steps 4) Missing feedback loops. Keep it brief.`,
      { processName, stepCount: snapshot.steps.length }
    )

    return result?.response || null
  }, [callAI])

  /**
   * AI Enrich: Auto-fills step details
   */
  const enrichStep = useCallback(async (
    stepName: string,
    processName: string
  ): Promise<Partial<{
    estimated_duration: string
    systems_used: string[]
    documents_needed: string[]
    success_criteria: string
    description: string
  }> | null> => {
    const result = await callAI(
      'step_enrich',
      `Process: "${processName}", Step: "${stepName}". Suggest realistic values for this step. Return a JSON object with keys: estimated_duration (string like "30 mins"), systems_used (array of software names), documents_needed (array), success_criteria (string), description (string). Return ONLY JSON.`,
      { processName, stepName }
    )

    if (!result?.response) return null

    try {
      const match = result.response.match(/\{[\s\S]*?\}/)
      if (match) {
        return JSON.parse(match[0])
      }
    } catch {
      // Parsing failed
    }

    return null
  }, [callAI])

  return {
    loading,
    error,
    suggestMissingSteps,
    checkDiagram,
    enrichStep,
  }
}
