'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';

// Types for the wizard
export interface ProcessMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ProcessActivity {
  id: string;
  title: string;
  type: 'action' | 'decision';
  swimlane: string;
  order: number;
  description?: string;
  duration?: string;
  successCriteria?: string;
  documents?: string[];
  systems?: string[];
  decisionQuestion?: string;
  yesBranch?: string;
  noBranch?: string;
}

export interface ProcessData {
  id: string;
  name: string;
  trigger?: string;
  successOutcome?: string;
  activities: ProcessActivity[];
  swimlanes: string[];
  stage: 'welcome' | 'overview' | 'swimlanes' | 'activities' | 'connections' | 'review';
}

export function useProcessWizard() {
  // State management
  const [processId, setProcessId] = useState<string>('');
  const [processData, setProcessData] = useState<ProcessData>({
    id: '',
    name: '',
    activities: [],
    swimlanes: [],
    stage: 'welcome',
  });
  const [messages, setMessages] = useState<ProcessMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Add message to conversation
  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Initialize new process
  const startNewProcess = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const newId = uuidv4();
      setProcessId(newId);
      setProcessData({
        id: newId,
        name: '',
        activities: [],
        swimlanes: [],
        stage: 'welcome',
      });
      setMessages([]);

      // Add welcome message
      addMessage(
        'assistant',
        "Hi! I'm your Process Mapper. Let's document your business process together. What is the name of the process you want to map?"
      );

      return newId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start process';
      setError(message);
      console.error('Error starting process:', err);
    } finally {
      setLoading(false);
    }
  }, [addMessage]);

  // Send user message and get AI response
  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;

      try {
        setLoading(true);
        setError(null);

        // Add user message to conversation
        addMessage('user', userMessage);

        // Call AI route to get response
        const response = await fetch('/api/wizard/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userMessage,
            processData,
            conversationHistory: messages,
            stage: processData.stage,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get AI response');
        }

        const data = await response.json();

        // Add AI response to conversation
        addMessage('assistant', data.response);

        // Update process data if AI extracted information
        if (data.updatedProcessData) {
          setProcessData(data.updatedProcessData);
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        console.error('Error sending message:', err);
        addMessage('assistant', `Sorry, I encountered an error: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [processData, messages, addMessage]
  );

  // Save process to database
  const saveProcess = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be logged in to save processes');
      }

      // Save to process_diagrams
      const { data: process, error: processError } = await supabase
        .from('process_diagrams')
        .upsert(
          {
            id: processId,
            user_id: user.id,
            name: processData.name,
            status: 'draft',
            conversation_status: 'in_progress',
            process_data: processData,
            step_count: processData.activities.length,
            swimlane_count: processData.swimlanes.length,
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (processError) throw processError;

      // Save individual activities
      for (const activity of processData.activities) {
        const { error: stepError } = await supabase.from('process_steps').insert({
          process_id: processId,
          order_num: activity.order,
          title: activity.title,
          type: activity.type,
          swimlane: activity.swimlane,
          description: activity.description,
          duration: activity.duration,
          success_criteria: activity.successCriteria,
          documents: activity.documents,
          systems: activity.systems,
          decision_question: activity.decisionQuestion,
        });

        if (stepError) console.error('Error saving step:', stepError);
      }

      return process;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save process';
      setError(message);
      console.error('Error saving process:', err);
    } finally {
      setLoading(false);
    }
  }, [processId, processData, supabase]);

  // Update process data (manual edits)
  const updateProcessData = useCallback((updates: Partial<ProcessData>) => {
    setProcessData((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  return {
    // State
    processId,
    processData,
    messages,
    loading,
    error,

    // Actions
    startNewProcess,
    addMessage,
    sendMessage,
    saveProcess,
    updateProcessData,
  };
}