// ============================================================================
// WIZARD BUILDER HOOK
// Purpose: Manage wizard state - activities, flows, process building
// Location: src/lib/hooks/useWizardBuilder.ts
// ============================================================================

'use client';

import { useState, useCallback } from 'react';
import { WizardProcess, WizardActivity, WizardFlow } from '@/lib/types/wizard';

/**
 * useWizardBuilder Hook
 * Manages the entire wizard process building state
 * 
 * Usage:
 * const wizard = useWizardBuilder();
 * wizard.addActivity({ name: 'Enquiry', swimlane: 'Sales', type: 'action' })
 */
export function useWizardBuilder() {
  // Initialize empty process
  const initialProcess: WizardProcess = {
    id: generateId(),
    name: '',
    description: '',
    activities: [],
    flows: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const [process, setProcess] = useState<WizardProcess>(initialProcess);
  const [lastActivityId, setLastActivityId] = useState<string | null>(null);

  // ────────────────────────────────────────────────────────────────
  // SET PROCESS NAME
  // ────────────────────────────────────────────────────────────────

  const setProcessName = useCallback((name: string) => {
    setProcess(prev => ({
      ...prev,
      name,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // ────────────────────────────────────────────────────────────────
  // ADD ACTIVITY
  // ────────────────────────────────────────────────────────────────

  const addActivity = useCallback(
    (params: {
      name: string;
      swimlane: string;
      type: 'action' | 'decision';
      description?: string;
      outcomes?: string[];
    }) => {
      const newActivity: WizardActivity = {
        id: generateId(),
        name: params.name,
        swimlane: params.swimlane,
        type: params.type,
        order: process.activities.length + 1,
        description: params.description,
        outcomes: params.outcomes,
      };

      setProcess(prev => ({
        ...prev,
        activities: [...prev.activities, newActivity],
        updatedAt: new Date().toISOString(),
      }));

      // Store this as the last activity so we can link the next one to it
      setLastActivityId(newActivity.id);

      console.log('✅ Activity added:', newActivity.name);
      return newActivity;
    },
    [process.activities.length]
  );

  // ────────────────────────────────────────────────────────────────
  // CREATE FLOW (CONNECTION BETWEEN ACTIVITIES)
  // ────────────────────────────────────────────────────────────────

  const createFlow = useCallback(
    (params: {
      fromActivityId: string;
      toActivityId: string;
      label?: string;
    }) => {
      const newFlow: WizardFlow = {
        id: generateId(),
        fromActivityId: params.fromActivityId,
        toActivityId: params.toActivityId,
        label: params.label,
      };

      setProcess(prev => ({
        ...prev,
        flows: [...prev.flows, newFlow],
        updatedAt: new Date().toISOString(),
      }));

      console.log(
        `✅ Flow created: ${params.fromActivityId} → ${params.toActivityId}`
      );
      return newFlow;
    },
    []
  );

  // ────────────────────────────────────────────────────────────────
  // AUTO-LINK: Add new activity AND connect to previous
  // ────────────────────────────────────────────────────────────────

  const addActivityAndLink = useCallback(
    (params: {
      name: string;
      swimlane: string;
      type: 'action' | 'decision';
      label?: string;
      description?: string;
      outcomes?: string[];
    }) => {
      // Step 1: Add the new activity
      const newActivity: WizardActivity = {
        id: generateId(),
        name: params.name,
        swimlane: params.swimlane,
        type: params.type,
        order: process.activities.length + 1,
        description: params.description,
        outcomes: params.outcomes,
      };

      // Step 2: Create flow from last activity to new activity
      const newFlow: WizardFlow | null = lastActivityId
        ? {
            id: generateId(),
            fromActivityId: lastActivityId,
            toActivityId: newActivity.id,
            label: params.label,
          }
        : null;

      // Step 3: Update state with both
      setProcess(prev => ({
        ...prev,
        activities: [...prev.activities, newActivity],
        flows: newFlow ? [...prev.flows, newFlow] : prev.flows,
        updatedAt: new Date().toISOString(),
      }));

      // Step 4: Update last activity for next iteration
      setLastActivityId(newActivity.id);

      console.log('✅ Activity added and linked:', newActivity.name);
      return { activity: newActivity, flow: newFlow };
    },
    [lastActivityId, process.activities.length]
  );

  // ────────────────────────────────────────────────────────────────
  // DELETE ACTIVITY
  // ────────────────────────────────────────────────────────────────

  const deleteActivity = useCallback((activityId: string) => {
    setProcess(prev => {
      // Remove the activity
      const updatedActivities = prev.activities.filter(a => a.id !== activityId);

      // Remove any flows connected to this activity
      const updatedFlows = prev.flows.filter(
        f => f.fromActivityId !== activityId && f.toActivityId !== activityId
      );

      // Recalculate order numbers
      const reorderedActivities = updatedActivities.map((a, i) => ({
        ...a,
        order: i + 1,
      }));

      return {
        ...prev,
        activities: reorderedActivities,
        flows: updatedFlows,
        updatedAt: new Date().toISOString(),
      };
    });

    console.log('✅ Activity deleted:', activityId);
  }, []);

  // ────────────────────────────────────────────────────────────────
  // UNDO (REMOVE LAST ACTIVITY)
  // ────────────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (process.activities.length === 0) return;

    const lastActivityId = process.activities[process.activities.length - 1].id;
    deleteActivity(lastActivityId);
  }, [process.activities, deleteActivity]);

  // ────────────────────────────────────────────────────────────────
  // RESET (START OVER)
  // ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setProcess(initialProcess);
    setLastActivityId(null);
    console.log('✅ Wizard reset');
  }, []);

  // ────────────────────────────────────────────────────────────────
  // GET ACTIVITY BY ID
  // ────────────────────────────────────────────────────────────────

  const getActivityById = useCallback(
    (id: string): WizardActivity | undefined => {
      return process.activities.find(a => a.id === id);
    },
    [process.activities]
  );

  // ────────────────────────────────────────────────────────────────
  // SAVE TO LOCALSTORAGE
  // ────────────────────────────────────────────────────────────────

  const saveToLocalStorage = useCallback(() => {
    try {
      localStorage.setItem('wizardProcess', JSON.stringify(process));
      console.log('✅ Process saved to localStorage');
      return true;
    } catch (error) {
      console.error('❌ Error saving to localStorage:', error);
      return false;
    }
  }, [process]);

  // ────────────────────────────────────────────────────────────────
  // LOAD FROM LOCALSTORAGE
  // ────────────────────────────────────────────────────────────────

  const loadFromLocalStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem('wizardProcess');
      if (saved) {
        const loaded = JSON.parse(saved) as WizardProcess;
        setProcess(loaded);
        console.log('✅ Process loaded from localStorage');
        return true;
      }
    } catch (error) {
      console.error('❌ Error loading from localStorage:', error);
    }
    return false;
  }, []);

  // ────────────────────────────────────────────────────────────────
  // RETURN PUBLIC API
  // ────────────────────────────────────────────────────────────────

  return {
    // State
    process,
    lastActivityId,

    // Process-level operations
    setProcessName,
    reset,
    saveToLocalStorage,
    loadFromLocalStorage,

    // Activity operations
    addActivity,
    addActivityAndLink,
    deleteActivity,
    getActivityById,
    undo,

    // Flow operations
    createFlow,

    // Convenience
    activityCount: process.activities.length,
    flowCount: process.flows.length,
  };
}

// ────────────────────────────────────────────────────────────────
// HELPER: Generate unique IDs
// ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}