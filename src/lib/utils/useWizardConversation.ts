// ========================================
// File: hooks/useWizardConversation.ts
// Custom hook for managing wizard conversation
// ========================================

'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useWizardStore } from '@/lib/store/wizardStore';
import { ConversationEngine } from '@/lib/utils/conversationEngine';
import { ConversationTurn, ProcessStep, ProcessDecision } from '@/lib/types/wizard';
import {
  addConversationTurn,
  createProcessStep,
  createProcessDecision,
} from '@/lib/supabase/database';
import { v4 as uuidv4 } from 'uuid';

interface UseWizardConversationReturn {
  // State
  isLoading: boolean;
  error: string | null;
  currentQuestion: string;
  acknowledgment: string;

  // Methods
  sendMessage: (message: string) => Promise<void>;
  startWizard: (processName: string, profitCenter?: string) => Promise<void>;
  completeProcess: () => Promise<void>;
  resetWizard: () => void;

  // Getters
  getStepCount: () => number;
  getTurnCount: () => number;
  getPhase: () => string;
}

export function useWizardConversation(): UseWizardConversationReturn {
  const engineRef = useRef<ConversationEngine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(
    ConversationEngine.getOpeningQuestion('setup')
  );
  const [acknowledgment, setAcknowledgment] = useState('');

  // Get store methods
  const {
    processData,
    phase,
    initializeProcess,
    addConversationTurn: storeAddTurn,
    addStep,
    addDecision,
    updateCurrentStep,
    commitCurrentStep,
    setPhase,
    setError: setStoreError,
    setLoading,
  } = useWizardStore();

  /**
   * Start the wizard with a process name
   */
  const startWizard = useCallback(
    async (processName: string, profitCenter?: string) => {
      try {
        setIsLoading(true);
        setError(null);

        // Create process in database
        const { success, data: dbProcess, error: dbError } =
          await createProcessStep({
            processId: uuidv4(),
            orderNum: 0,
            action: 'initialize',
          });

        if (!dbError && processData.id) {
          // Initialize store
          initializeProcess(processData.id, processName, profitCenter);

          // Create conversation engine
          engineRef.current = new ConversationEngine(processData.id);

          // Set initial question
          setCurrentQuestion(ConversationEngine.getOpeningQuestion('unpacking'));
          setPhase('unpacking');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to start wizard';
        setError(msg);
        setStoreError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [processData.id, initializeProcess, setPhase, setStoreError]
  );

  /**
   * Send a message and process it
   */
  const sendMessage = useCallback(
    async (message: string) => {
      if (!engineRef.current || !processData.id) {
        setError('Wizard not initialized');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        setAcknowledgment('');

        // Process the message through conversation engine
        const result = await engineRef.current.processInput(
          message,
          currentQuestion
        );

        // Set acknowledgment
        setAcknowledgment(result.acknowledgment);

        // Add user turn to store
        const userTurn: ConversationTurn = {
          id: uuidv4(),
          process_id: processData.id,
          turn_number: result.turnNumber,
          role: 'user',
          message,
          parsed_data: result.parsedData,
          confidence: result.parsedData.confidence,
          created_at: new Date().toISOString(),
        };
        storeAddTurn(userTurn);

        // Save to database
        await addConversationTurn({
          processId: processData.id,
          turnNumber: result.turnNumber,
          role: 'user',
          message,
          parsedData: result.parsedData,
          confidence: result.parsedData.confidence,
        });

        // Add system turn to store
        const systemTurn: ConversationTurn = {
          id: uuidv4(),
          process_id: processData.id,
          turn_number: result.turnNumber + 1,
          role: 'system',
          message: result.nextQuestion,
          parsed_data: null,
          confidence: null,
          created_at: new Date().toISOString(),
        };
        storeAddTurn(systemTurn);

        // Save system turn to database
        await addConversationTurn({
          processId: processData.id,
          turnNumber: result.turnNumber + 1,
          role: 'system',
          message: result.nextQuestion,
        });

        // If we got a new step, save it
        if (result.newStep) {
          // Save to database
          const { data: savedStep } = await createProcessStep({
            processId: processData.id,
            orderNum: result.newStep.order_num,
            action: result.newStep.action,
            primaryOwner: result.newStep.primary_owner,
            department: result.newStep.department,
            estimatedDuration: result.newStep.estimated_duration,
          });

          if (savedStep) {
            // Add to store
            addStep(savedStep);
            updateCurrentStep({
              action: result.newStep.action,
              owner: result.newStep.primary_owner,
              department: result.newStep.department,
              duration: result.newStep.estimated_duration,
              branchChecked: true,
              isComplete: true,
            });
          }
        }

        // If we got a decision, save it
        if (result.newDecision) {
          const { data: savedDecision } = await createProcessDecision({
            processId: processData.id,
            afterStepId: result.newDecision.after_step_id,
            decisionQuestion: result.newDecision.decision_question,
            branches: result.newDecision.branches as any,
          });

          if (savedDecision) {
            addDecision(savedDecision);
          }
        }

        // Update question
        setCurrentQuestion(result.nextQuestion);

        // Update phase if needed
        if (engineRef.current.phase !== phase) {
          setPhase(engineRef.current.phase);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to process message';
        setError(msg);
        console.error('Error sending message:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [
      processData.id,
      currentQuestion,
      phase,
      storeAddTurn,
      addStep,
      addDecision,
      updateCurrentStep,
      setPhase,
    ]
  );

  /**
   * Complete the process
   */
  const completeProcess = useCallback(async () => {
    if (!engineRef.current || !processData.id) {
      setError('Wizard not initialized');
      return;
    }

    try {
      setIsLoading(true);
      const stats = engineRef.current.getSummary();
      setPhase('review');
      // Save completion to database later
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to complete';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [processData.id, setPhase]);

  /**
   * Reset wizard
   */
  const resetWizard = useCallback(() => {
    engineRef.current = null;
    setCurrentQuestion(ConversationEngine.getOpeningQuestion('setup'));
    setAcknowledgment('');
    setError(null);
  }, []);

  // Getters
  const getStepCount = useCallback(() => {
    return engineRef.current?.stepNumber ?? 0;
  }, []);

  const getTurnCount = useCallback(() => {
    return engineRef.current?.conversationHistory.length ?? 0;
  }, []);

  const getPhase = useCallback(() => {
    return engineRef.current?.phase ?? 'setup';
  }, []);

  return {
    isLoading,
    error,
    currentQuestion,
    acknowledgment,
    sendMessage,
    startWizard,
    completeProcess,
    resetWizard,
    getStepCount,
    getTurnCount,
    getPhase,
  };
}