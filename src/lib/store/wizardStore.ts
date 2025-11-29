// /lib/store/wizardStore.ts
// Zustand store for wizard state management and conversation history

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============================================
// Type Definitions
// ============================================

export interface ConversationMessage {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ProcessStep {
  id: string
  order: number
  title: string
  type: 'action' | 'decision'
  role: string
  documents: string
  systems: string
  amount: string
  timing: string
  decisionQuestion?: string
}

export interface WizardStore {
  // Process metadata
  currentProcessName: string
  currentTrigger: string
  
  // Conversation history
  conversationHistory: ConversationMessage[]
  currentInput: string
  
  // Process steps
  steps: ProcessStep[]
  
  // Actions - Process metadata
  setProcessInfo: (name: string, trigger: string) => void
  
  // Actions - Conversation
  addMessage: (message: Omit<ConversationMessage, 'id' | 'timestamp'>) => void
  setCurrentInput: (input: string) => void
  clearConversation: () => void
  
  // Actions - Steps
  addStep: (step: ProcessStep) => void
  updateStep: (id: string, step: Partial<ProcessStep>) => void
  deleteStep: (id: string) => void
  clearSteps: () => void
}

// ============================================
// Zustand Store with Persistence
// ============================================

export const useWizardStore = create<WizardStore>()(
  persist(
    (set) => ({
      // Initial state - Process metadata
      currentProcessName: '',
      currentTrigger: '',
      
      // Initial state - Conversation
      conversationHistory: [],
      currentInput: '',
      
      // Initial state - Steps
      steps: [],
      
      // ===== Process Info Actions =====
      setProcessInfo: (name: string, trigger: string) =>
        set({
          currentProcessName: name,
          currentTrigger: trigger,
        }),
      
      // ===== Conversation Actions =====
      /**
       * Add a message to the conversation history
       */
      addMessage: (message: Omit<ConversationMessage, 'id' | 'timestamp'>) =>
        set((state) => ({
          conversationHistory: [
            ...state.conversationHistory,
            {
              id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              ...message,
            },
          ],
        })),
      
      /**
       * Update the current input field
       */
      setCurrentInput: (input: string) =>
        set({
          currentInput: input,
        }),
      
      /**
       * Clear conversation history and reset input
       */
      clearConversation: () =>
        set({
          conversationHistory: [],
          currentInput: '',
        }),
      
      // ===== Steps Actions =====
      /**
       * Add a new step
       */
      addStep: (step: ProcessStep) =>
        set((state) => ({
          steps: [...state.steps, step],
        })),
      
      /**
       * Update an existing step
       */
      updateStep: (id: string, updates: Partial<ProcessStep>) =>
        set((state) => ({
          steps: state.steps.map((step) =>
            step.id === id ? { ...step, ...updates } : step
          ),
        })),
      
      /**
       * Delete a step
       */
      deleteStep: (id: string) =>
        set((state) => ({
          steps: state.steps.filter((step) => step.id !== id),
        })),
      
      /**
       * Clear all steps
       */
      clearSteps: () =>
        set({
          steps: [],
          currentProcessName: '',
          currentTrigger: '',
          conversationHistory: [],
          currentInput: '',
        }),
    }),
    {
      // Persist configuration
      name: 'wizard-store',
      // Only persist specific fields (not the entire store)
      partialize: (state) => ({
        currentProcessName: state.currentProcessName,
        currentTrigger: state.currentTrigger,
        conversationHistory: state.conversationHistory,
        currentInput: state.currentInput,
        steps: state.steps,
      }),
    }
  )
)