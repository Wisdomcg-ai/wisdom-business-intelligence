// ============================================================================
// WIZARD PAGE - Process Builder
// Location: /src/app/wizard/page.tsx
// Purpose: Guide user through building their process step-by-step
// Shows: Live diagram updates as they add activities
// ============================================================================

'use client';

import React, { useState, useMemo } from 'react';
import { ProcessDiagramRenderer } from '@/components/ProcessDiagram/ProcessDiagramRenderer';
import { processLayoutEngine } from '@/lib/services/process-layout.service';

// ─── TYPE DEFINITIONS ──────────────────────────────────────────────────

interface WizardActivity {
  id: string;
  name: string;
  swimlane: string;
  type: 'action' | 'decision';
  orderNum: number;
}

interface WizardFlow {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  color?: 'green' | 'red' | 'orange';
}

interface WizardState {
  processName: string;
  activities: WizardActivity[];
  flows: WizardFlow[];
  currentStep: 'name' | 'building' | 'review';
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────

export default function WizardPage() {
  // STATE: The entire process being built
  const [wizard, setWizard] = useState<WizardState>({
    processName: '',
    activities: [],
    flows: [],
    currentStep: 'name',
  });

  // STATE: Current form inputs
  const [formInput, setFormInput] = useState({
    activityName: '',
    swimlane: 'Sales',
    activityType: 'action' as 'action' | 'decision',
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 1: Handle process name input
  // ────────────────────────────────────────────────────────────────────

  const handleProcessNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (wizard.processName.trim()) {
      setWizard(prev => ({
        ...prev,
        currentStep: 'building',
      }));
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // STEP 2: Handle adding new activity
  // ────────────────────────────────────────────────────────────────────

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formInput.activityName.trim()) {
      alert('Please enter an activity name');
      return;
    }

    // Create new activity
    const newActivity: WizardActivity = {
      id: `activity-${Date.now()}`,
      name: formInput.activityName,
      swimlane: formInput.swimlane,
      type: formInput.activityType,
      orderNum: wizard.activities.length + 1,
    };

    // Create flow FROM previous activity TO this one
    let newFlows = [...wizard.flows];
    if (wizard.activities.length > 0) {
      const lastActivity = wizard.activities[wizard.activities.length - 1];
      const newFlow: WizardFlow = {
        id: `flow-${Date.now()}`,
        fromId: lastActivity.id,
        toId: newActivity.id,
      };
      newFlows.push(newFlow);
    }

    // Update state
    setWizard(prev => ({
      ...prev,
      activities: [...prev.activities, newActivity],
      flows: newFlows,
    }));

    // Reset form
    setFormInput({
      activityName: '',
      swimlane: 'Sales',
      activityType: 'action',
    });

    console.log('✅ Activity added:', newActivity);
  };

  // ────────────────────────────────────────────────────────────────────
  // CONVERT WIZARD DATA TO DIAGRAM DATA
  // ────────────────────────────────────────────────────────────────────

  const { diagramLayout, stepsMap } = useMemo(() => {
    if (wizard.activities.length === 0) {
      return { diagramLayout: null, stepsMap: new Map() };
    }

    // Convert activities to ProcessStep format
    const steps = wizard.activities.map(activity => ({
      id: activity.id,
      process_id: 'wizard-preview',
      swimlane_name: activity.swimlane,
      department: activity.swimlane,
      order_num: activity.orderNum,
      activity_name: activity.name,
      action_name: activity.name,
      step_type: activity.type as 'action' | 'decision' | 'wait' | 'automation',
      description: '',
      business_purpose: '',
      success_criteria: '',
      estimated_duration: '',
      owner_role: '',
      systems_used: [],
      documents_needed: [],
      quality_checks: '',
      created_at: new Date().toISOString(),
    }));

    // Convert flows to ProcessFlow format
    const flows = wizard.flows.map(flow => ({
      id: flow.id,
      process_id: 'wizard-preview',
      from_step_id: flow.fromId,
      to_step_id: flow.toId,
      condition_label: flow.label,
      condition_color: flow.color,
      flow_type: 'sequential' as const,
      notes: '',
      created_at: new Date().toISOString(),
    }));

    // Calculate layout
    const layout = processLayoutEngine.calculate(steps, flows, []);

    // Create steps map for renderer
    const stepsMap = new Map(steps.map(s => [s.id, { ...s, action_name: s.activity_name }]));

    return { diagramLayout: layout, stepsMap };
  }, [wizard.activities, wizard.flows]);

  // ────────────────────────────────────────────────────────────────────
  // RENDER: STEP 1 - Get Process Name
  // ────────────────────────────────────────────────────────────────────

  if (wizard.currentStep === 'name') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-orange-50 to-brand-orange-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Let's Map Your Process
            </h1>
            <p className="text-gray-600 mb-8 text-lg">
              First, what's the name of the process you want to map?
            </p>

            <form onSubmit={handleProcessNameSubmit} className="space-y-6">
              <input
                type="text"
                placeholder="e.g., Bathroom Renovation, Sales Process, Customer Onboarding"
                value={wizard.processName}
                onChange={(e) =>
                  setWizard(prev => ({
                    ...prev,
                    processName: e.target.value,
                  }))
                }
                className="w-full px-6 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-brand-orange text-lg"
                autoFocus
              />

              <button
                type="submit"
                className="w-full px-6 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition font-semibold text-lg"
              >
                Start Mapping →
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // RENDER: STEP 2 - Build Process (Questions + Live Diagram)
  // ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="grid grid-cols-2 gap-8 p-8" style={{ minHeight: '100vh' }}>
        
        {/* LEFT SIDE: QUESTIONS & FORM */}
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-brand-orange">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {wizard.processName}
            </h1>
            <p className="text-gray-600">
              {wizard.activities.length} activities added
            </p>
          </div>

          {/* Add Activity Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              {wizard.activities.length === 0
                ? "What's the first activity?"
                : 'What happens next?'}
            </h2>

            <form onSubmit={handleAddActivity} className="space-y-4">
              {/* Activity Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activity Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Enquiry, Review Quote, Send Invoice"
                  value={formInput.activityName}
                  onChange={(e) =>
                    setFormInput(prev => ({
                      ...prev,
                      activityName: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-brand-orange"
                  autoFocus
                />
              </div>

              {/* Swimlane/Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Who does this? (Swimlane)
                </label>
                <select
                  value={formInput.swimlane}
                  onChange={(e) =>
                    setFormInput(prev => ({
                      ...prev,
                      swimlane: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-brand-orange"
                >
                  <option value="Sales">Sales</option>
                  <option value="Operations">Operations</option>
                  <option value="Finance">Finance</option>
                  <option value="Project Management">Project Management</option>
                  <option value="Director/Admin">Director/Admin</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Support">Support</option>
                </select>
              </div>

              {/* Activity Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="action"
                      checked={formInput.activityType === 'action'}
                      onChange={(e) =>
                        setFormInput(prev => ({
                          ...prev,
                          activityType: 'action' as 'action' | 'decision',
                        }))
                      }
                      className="mr-2"
                    />
                    <span className="text-gray-700">Action (Rectangle)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="decision"
                      checked={formInput.activityType === 'decision'}
                      onChange={(e) =>
                        setFormInput(prev => ({
                          ...prev,
                          activityType: 'decision' as 'action' | 'decision',
                        }))
                      }
                      className="mr-2"
                    />
                    <span className="text-gray-700">Decision (Diamond)</span>
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full px-4 py-2 bg-brand-orange text-white rounded hover:bg-brand-orange-600 transition font-semibold"
              >
                + Add Activity
              </button>
            </form>
          </div>

          {/* Activities List */}
          {wizard.activities.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Activities Added
              </h3>
              <div className="space-y-2">
                {wizard.activities.map((activity, idx) => (
                  <div key={activity.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                    <div className="flex-shrink-0 w-6 h-6 bg-brand-orange text-white rounded-full flex items-center justify-center text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{activity.name}</div>
                      <div className="text-sm text-gray-600">
                        {activity.swimlane} · {activity.type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDE: LIVE DIAGRAM */}
        <div className="sticky top-8 h-fit">
          {diagramLayout && stepsMap.size > 0 ? (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <ProcessDiagramRenderer
                layout={diagramLayout}
                steps={stepsMap}
                title={wizard.processName}
                interactive={true}
              />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center">
              <div className="text-gray-500">
                <p className="text-lg font-medium mb-2">📊 Diagram Preview</p>
                <p className="text-sm">Add your first activity to see the diagram appear here</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}