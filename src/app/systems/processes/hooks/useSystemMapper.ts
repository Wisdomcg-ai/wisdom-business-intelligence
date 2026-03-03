'use client'

import { useState, useCallback, useRef } from 'react'
import type { ProcessSnapshot, ProcessFlowData, ProcessStepData, SwimlaneDefinition } from '@/types/process-builder'
import { SWIMLANE_COLOR_PALETTE } from '@/types/process-builder'
import type { BuilderAction } from '../types'

export interface MapperAction {
  type: string
  description: string
  undoActions?: BuilderAction[]
}

export interface MapperMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: MapperAction[]
}

interface AIToolCall {
  name: string
  args: Record<string, unknown>
}

interface AIResponse {
  message: string
  toolCalls?: AIToolCall[]
}

export function useSystemMapper(
  snapshot: ProcessSnapshot,
  dispatch: React.Dispatch<BuilderAction>
) {
  const [messages, setMessages] = useState<MapperMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const conversationRef = useRef<{ role: string; content: string }[]>([])

  const executeToolCall = useCallback(
    (call: AIToolCall): MapperAction | null => {
      switch (call.name) {
        case 'addLane': {
          const name = call.args.name as string
          const id = crypto.randomUUID()
          const colorIndex = snapshot.swimlanes.length % SWIMLANE_COLOR_PALETTE.length
          const lane: SwimlaneDefinition = {
            id,
            name,
            color: SWIMLANE_COLOR_PALETTE[colorIndex],
            order: snapshot.swimlanes.length,
          }
          dispatch({ type: 'ADD_SWIMLANE', payload: lane })
          return {
            type: 'addLane',
            description: `Added lane "${name}"`,
            undoActions: [{ type: 'DELETE_SWIMLANE', payload: id }],
          }
        }
        case 'addStep': {
          const id = crypto.randomUUID()
          const laneId = call.args.laneId as string || findLaneByName(snapshot, call.args.laneName as string)
          if (!laneId) return null
          const step: ProcessStepData = {
            id,
            swimlane_id: laneId,
            order_num: 0,
            action_name: call.args.name as string,
            step_type: (call.args.type as ProcessStepData['step_type']) || 'action',
            description: call.args.description as string | undefined,
            estimated_duration: call.args.duration as string | undefined,
            systems_used: (call.args.systems as string[]) || [],
            documents_needed: (call.args.documents as string[]) || [],
          }
          dispatch({ type: 'ADD_STEP', payload: step })
          return {
            type: 'addStep',
            description: `Added "${call.args.name}" to ${getLaneName(snapshot, laneId)}`,
            undoActions: [{ type: 'DELETE_STEP', payload: id }],
          }
        }
        case 'addDecision': {
          const id = crypto.randomUUID()
          const laneId = call.args.laneId as string || findLaneByName(snapshot, call.args.laneName as string)
          if (!laneId) return null
          const step: ProcessStepData = {
            id,
            swimlane_id: laneId,
            order_num: 0,
            action_name: call.args.name as string,
            step_type: 'decision',
            decision_yes_label: call.args.yesLabel as string || 'Yes',
            decision_no_label: call.args.noLabel as string || 'No',
            systems_used: [],
            documents_needed: [],
          }
          dispatch({ type: 'ADD_STEP', payload: step })
          return {
            type: 'addDecision',
            description: `Added decision "${call.args.name}" to ${getLaneName(snapshot, laneId)}`,
            undoActions: [{ type: 'DELETE_STEP', payload: id }],
          }
        }
        case 'addFlow': {
          const fromId = call.args.fromStepId as string || findStepByName(snapshot, call.args.fromStep as string)
          const toId = call.args.toStepId as string || findStepByName(snapshot, call.args.toStep as string)
          if (!fromId || !toId) return null
          const id = crypto.randomUUID()
          // Auto-detect flow_type: if source is a decision step, use 'decision'
          const fromStepData = snapshot.steps.find((s) => s.id === fromId)
          const flowType = fromStepData?.step_type === 'decision' ? 'decision' : 'sequential'
          const flow: ProcessFlowData = {
            id,
            from_step_id: fromId,
            to_step_id: toId,
            flow_type: flowType,
            condition_label: call.args.label as string | undefined,
            condition_color: call.args.color as string | undefined,
          }
          dispatch({ type: 'ADD_FLOW', payload: flow })
          return {
            type: 'addFlow',
            description: `Connected steps with flow`,
            undoActions: [{ type: 'DELETE_FLOW', payload: id }],
          }
        }
        default:
          return null
      }
    },
    [snapshot, dispatch]
  )

  const sendMessage = useCallback(
    async (text: string) => {
      // Add user message
      const userMsg: MapperMessage = { role: 'user', content: text }
      setMessages((prev) => [...prev, userMsg])
      conversationRef.current.push({ role: 'user', content: text })

      setIsLoading(true)

      try {
        const res = await fetch('/api/processes/ai-mapper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversationRef.current,
            currentProcess: {
              swimlanes: snapshot.swimlanes.map((l) => ({ id: l.id, name: l.name })),
              steps: snapshot.steps.map((s) => ({
                id: s.id,
                name: s.action_name,
                laneId: s.swimlane_id,
                laneName: snapshot.swimlanes.find((l) => l.id === s.swimlane_id)?.name,
                type: s.step_type,
              })),
              flows: snapshot.flows.length,
            },
          }),
        })

        if (!res.ok) throw new Error('API error')
        const data: AIResponse = await res.json()

        // Execute tool calls
        const actions: MapperAction[] = []
        if (data.toolCalls) {
          for (const call of data.toolCalls) {
            const action = executeToolCall(call)
            if (action) actions.push(action)
          }
        }

        const aiMsg: MapperMessage = {
          role: 'assistant',
          content: data.message,
          actions: actions.length > 0 ? actions : undefined,
        }
        setMessages((prev) => [...prev, aiMsg])
        conversationRef.current.push({ role: 'assistant', content: data.message })
      } catch (error) {
        console.error('AI mapper error:', error)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I had trouble processing that. Could you try rephrasing?',
          },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [snapshot, executeToolCall]
  )

  const undo = useCallback(
    (messageIndex: number) => {
      const msg = messages[messageIndex]
      if (!msg?.actions) return

      // Execute undo actions in reverse
      for (const action of [...msg.actions].reverse()) {
        if (action.undoActions) {
          for (const undoAction of action.undoActions) {
            dispatch(undoAction)
          }
        }
      }

      // Remove the actions from the message
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex ? { ...m, actions: undefined, content: m.content + '\n\n(Undone)' } : m
        )
      )
    },
    [messages, dispatch]
  )

  return { messages, sendMessage, isLoading, undo }
}

function findLaneByName(snapshot: ProcessSnapshot, name?: string): string | null {
  if (!name) return null
  const lane = snapshot.swimlanes.find(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  )
  return lane?.id || null
}

function findStepByName(snapshot: ProcessSnapshot, name?: string): string | null {
  if (!name) return null
  const step = snapshot.steps.find(
    (s) => s.action_name.toLowerCase() === name.toLowerCase()
  )
  return step?.id || null
}

function getLaneName(snapshot: ProcessSnapshot, laneId: string): string {
  return snapshot.swimlanes.find((l) => l.id === laneId)?.name || 'Unknown'
}
