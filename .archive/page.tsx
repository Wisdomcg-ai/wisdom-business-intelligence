'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWizardStore } from '@/lib/store/wizardStore';
import { StepUI, isExcluded, ConversationState, CurrentStepData } from '@/lib/types/processWizard';
import {
  createProcessDiagram,
  addProcessStep,
  createDecision,
  updateProcessStep,
  deleteProcessStep,
  loadUserProcesses,
  loadProcess,
} from '@/lib/supabase/wizardDb';
import { AdvancedDiagramVisualizer } from '@/components/AdvancedDiagramVisualizer';
import { Trash2, Send, RotateCcw, Loader2 } from 'lucide-react';

// ============================================
// ICON COMPONENTS AS SVG
// ============================================
const Icons = {
  document: (x: number, y: number, size: number = 12) => (
    <g key={`doc_${x}_${y}`}>
      <rect x={x} y={y} width={size} height={size + 2} fill="none" stroke="#6B7280" strokeWidth="1" />
      <line x1={x + 2} y1={y + 4} x2={x + size - 2} y2={y + 4} stroke="#6B7280" strokeWidth="0.5" />
      <line x1={x + 2} y1={y + 7} x2={x + size - 2} y2={y + 7} stroke="#6B7280" strokeWidth="0.5" />
    </g>
  ),

  time: (x: number, y: number, size: number = 12) => (
    <g key={`time_${x}_${y}`}>
      <circle cx={x + size / 2} cy={y + size / 2} r={size / 2} fill="none" stroke="#6B7280" strokeWidth="1" />
      <line x1={x + size / 2} y1={y + 2} x2={x + size / 2} y2={y + size / 2} stroke="#6B7280" strokeWidth="1" />
      <line x1={x + size / 2} y1={y + size / 2} x2={x + size - 2} y2={y + size / 2} stroke="#6B7280" strokeWidth="1" />
    </g>
  ),

  dollar: (x: number, y: number, size: number = 12) => (
    <g key={`dollar_${x}_${y}`}>
      <text x={x + size / 2} y={y + size} fontSize={size - 2} fontWeight="bold" fill="#6B7280" textAnchor="middle">
        $
      </text>
    </g>
  ),
};

// ============================================
// PROFESSIONAL SVG DIAGRAM VISUALIZER (Legacy - kept for reference)
// ============================================
function ProfessionalDiagramVisualizer({ steps, title }: { steps: StepUI[]; title?: string }) {
  if (steps.length === 0) {
    return (
      <div className="w-full h-80 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center">
        <p className="text-slate-500 text-sm">Diagram will appear here as you add steps...</p>
      </div>
    );
  }

  const config = {
    stepWidth: 160,
    stepHeight: 80,
    diamondSize: 100,
    horizontalSpacing: 100,
    verticalSpacing: 160,
    leftMargin: 60,
    topMargin: 50,
    annotationHeight: 60,
  };

  const roles = Array.from(new Set(steps.map(s => s.role).filter(r => r)));

  const roleColors: Record<string, string> = {
    'Sales': '#FEF08A',
    'Sales Admin': '#FEF08A',
    'Sales Manager': '#BFDBFE',
    'Admin': '#FCA5A5',
    'Operations': '#A7F3D0',
    'Finance': '#D8B4FE',
    'Marketing': '#F9A8D4',
    'Support': '#FECACA',
    'Director': '#E879F9',
    'Project Management': '#60A5FA',
  };

  roles.forEach((role, i) => {
    if (!roleColors[role]) {
      const colors = ['#FEF08A', '#BFDBFE', '#FCA5A5', '#A7F3D0', '#F9A8D4', '#D8B4FE'];
      roleColors[role] = colors[i % colors.length];
    }
  });

  const svgWidth = Math.max(steps.length * (config.stepWidth + config.horizontalSpacing) + config.leftMargin + 200, 1400);
  const svgHeight = Math.max(
    roles.length * config.verticalSpacing + config.topMargin + config.annotationHeight + 100,
    600
  );

  return (
    <div className="w-full border border-slate-300 rounded-lg bg-white overflow-hidden">
      {title && (
        <div className="px-6 py-3 bg-slate-100 border-b border-slate-300">
          <p className="font-semibold text-slate-900">{title}</p>
        </div>
      )}

      <div className="overflow-x-auto p-4">
        <svg width={svgWidth} height={svgHeight} className="min-w-full bg-white">
          <defs>
            <linearGradient id="actionGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#3B82F6', stopOpacity: 0.1 }} />
              <stop offset="100%" style={{ stopColor: '#1E40AF', stopOpacity: 0.05 }} />
            </linearGradient>

            <marker id="arrowMain" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#475569" />
            </marker>
            <marker id="arrowYes" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#16A34A" />
            </marker>
            <marker id="arrowNo" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#DC2626" />
            </marker>

            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.1" />
            </filter>
          </defs>

          {/* SWIMLANES */}
          {roles.map((role, roleIndex) => (
            <g key={`swimlane_${role}`}>
              <rect
                x="0"
                y={config.topMargin + roleIndex * config.verticalSpacing}
                width={svgWidth}
                height={config.verticalSpacing}
                fill={roleColors[role]}
                opacity="0.08"
                stroke={roleColors[role]}
                strokeWidth="1.5"
              />

              <rect
                x="8"
                y={config.topMargin + roleIndex * config.verticalSpacing + 8}
                width="140"
                height="45"
                fill={roleColors[role]}
                opacity="0.85"
                stroke={roleColors[role]}
                strokeWidth="2"
                rx="6"
                filter="url(#shadow)"
              />

              <text
                x="78"
                y={config.topMargin + roleIndex * config.verticalSpacing + 38}
                fontSize="13"
                fontWeight="bold"
                fill="#1E293B"
                textAnchor="middle"
              >
                {role}
              </text>
            </g>
          ))}

          {/* STEPS AND CONNECTORS */}
          {steps.map((step, idx) => {
            const roleIndex = roles.indexOf(step.role);
            const x = config.leftMargin + idx * (config.stepWidth + config.horizontalSpacing);
            const y = config.topMargin + 70 + roleIndex * config.verticalSpacing;
            const isDecision = step.type === 'decision';

            return (
              <g key={`step_group_${step.id}`}>
                {/* CONNECTOR FROM PREVIOUS STEP */}
                {idx > 0 && (
                  <g key={`connector_${idx}`}>
                    {(() => {
                      const prevStep = steps[idx - 1];
                      const prevRoleIndex = roles.indexOf(prevStep.role);
                      const prevX = config.leftMargin + (idx - 1) * (config.stepWidth + config.horizontalSpacing);
                      const prevY = config.topMargin + 70 + prevRoleIndex * config.verticalSpacing;
                      const prevIsDecision = prevStep.type === 'decision';

                      const x1 = prevX + (prevIsDecision ? config.diamondSize / 2 : config.stepWidth / 2);
                      const y1 = prevY + (prevIsDecision ? config.diamondSize / 2 : config.stepHeight / 2);
                      const x2 = x + (isDecision ? config.diamondSize / 2 : config.stepWidth / 2);
                      const y2 = y + (isDecision ? config.diamondSize / 2 : config.stepHeight / 2);

                      // Simple straight or minimal curve connector
                      if (roleIndex === prevRoleIndex) {
                        // Same role - straight line
                        return (
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#64748B"
                            strokeWidth="2"
                            markerEnd="url(#arrowMain)"
                          />
                        );
                      } else {
                        // Different role - simple curve
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        return (
                          <path
                            d={`M ${x1} ${y1} L ${midX} ${midY} L ${x2} ${y2}`}
                            stroke="#64748B"
                            strokeWidth="2"
                            fill="none"
                            markerEnd="url(#arrowMain)"
                          />
                        );
                      }
                    })()}
                  </g>
                )}

                {/* DECISION DIAMOND */}
                {isDecision ? (
                  <g key={`decision_${step.id}`} filter="url(#shadow)">
                    <polygon
                      points={`${x + config.diamondSize / 2},${y} ${x + config.diamondSize},${y + config.diamondSize / 2} ${x + config.diamondSize / 2},${y + config.diamondSize} ${x},${y + config.diamondSize / 2}`}
                      fill={roleColors[step.role]}
                      stroke="#334155"
                      strokeWidth="2.5"
                      opacity="0.95"
                    />

                    <circle cx={x + 18} cy={y + 18} r="10" fill="#334155" />
                    <text x={x + 18} y={y + 22} fontSize="9" fontWeight="bold" fill="white" textAnchor="middle">
                      {step.order}
                    </text>

                    <text
                      x={x + config.diamondSize / 2}
                      y={y + config.diamondSize / 2 - 8}
                      fontSize="11"
                      fontWeight="600"
                      fill="#1E293B"
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {step.title.substring(0, 12)}
                    </text>
                    <text
                      x={x + config.diamondSize / 2}
                      y={y + config.diamondSize / 2 + 8}
                      fontSize="14"
                      fontWeight="bold"
                      fill="#334155"
                      textAnchor="middle"
                    >
                      ?
                    </text>

                    {/* YES label - Green - RIGHT side */}
                    <text x={x + config.diamondSize + 15} y={y + config.diamondSize / 2 + 5} fontSize="9" fontWeight="bold" fill="#16A34A">
                      YES
                    </text>

                    {/* NO label - Red - LEFT side */}
                    <text x={x - 25} y={y + config.diamondSize / 2 + 5} fontSize="9" fontWeight="bold" fill="#DC2626">
                      NO
                    </text>
                  </g>
                ) : (
                  /* ACTION RECTANGLE */
                  <g key={`action_${step.id}`} filter="url(#shadow)">
                    <rect
                      x={x}
                      y={y}
                      width={config.stepWidth}
                      height={config.stepHeight}
                      fill={roleColors[step.role]}
                      stroke="#334155"
                      strokeWidth="2.5"
                      rx="8"
                      opacity="0.95"
                    />

                    <circle cx={x + 18} cy={y + 18} r="10" fill="#334155" />
                    <text x={x + 18} y={y + 22} fontSize="9" fontWeight="bold" fill="white" textAnchor="middle">
                      {step.order}
                    </text>

                    <text
                      x={x + config.stepWidth / 2}
                      y={y + config.stepHeight / 2 - 5}
                      fontSize="12"
                      fontWeight="600"
                      fill="#1E293B"
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {step.title.substring(0, 18)}
                    </text>

                    <g>
                      {step.documents && step.documents !== 'N/A' && Icons.document(x + 10, y + config.stepHeight - 14, 10)}
                      {step.systems && step.systems !== 'N/A' && Icons.time(x + 30, y + config.stepHeight - 14, 10)}
                      {step.amount && step.amount !== 'N/A' && Icons.dollar(x + 50, y + config.stepHeight - 14, 10)}
                    </g>
                  </g>
                )}

                {/* ANNOTATIONS BELOW STEP */}
                <g key={`annotations_${step.id}`}>
                  {step.timing && step.timing !== 'N/A' && (
                    <g>
                      {Icons.time(x, y + config.stepHeight + 25, 11)}
                      <text x={x + 18} y={y + config.stepHeight + 33} fontSize="9" fill="#6B7280">
                        {step.timing}
                      </text>
                    </g>
                  )}

                  {step.amount && step.amount !== 'N/A' && (
                    <g>
                      {Icons.dollar(x + config.stepWidth / 2, y + config.stepHeight + 25, 11)}
                      <text x={x + config.stepWidth / 2 + 18} y={y + config.stepHeight + 33} fontSize="9" fill="#6B7280">
                        {step.amount}
                      </text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}

          {/* LEGEND */}
          <g>
            <rect x={20} y={svgHeight - 45} width="280" height="40" fill="white" stroke="#D1D5DB" strokeWidth="1" rx="6" />

            <rect x={35} y={svgHeight - 35} width="16" height="12" fill="#93C5FD" stroke="#334155" strokeWidth="1" rx="2" />
            <text x={58} y={svgHeight - 24} fontSize="10" fill="#1E293B">
              Action
            </text>

            <polygon
              points={`${88},${svgHeight - 35} ${96},${svgHeight - 29} ${88},${svgHeight - 23} ${80},${svgHeight - 29}`}
              fill="#FCD34D"
              stroke="#334155"
              strokeWidth="1"
            />
            <text x={108} y={svgHeight - 24} fontSize="10" fill="#1E293B">
              Decision
            </text>

            {Icons.document(175, svgHeight - 35, 10)}
            <text x={192} y={svgHeight - 24} fontSize="9" fill="#6B7280">
              Doc
            </text>

            {Icons.time(225, svgHeight - 35, 10)}
            <text x={242} y={svgHeight - 24} fontSize="9" fill="#6B7280">
              Time
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}

// ============================================
// EDITABLE TABLE WITH TYPE BADGES
// ============================================
function StepsTable({
  steps,
  onUpdateStep,
  onDeleteStep
}: {
  steps: StepUI[];
  onUpdateStep: (id: string, field: keyof StepUI, value: string) => Promise<void>;
  onDeleteStep: (id: string) => Promise<void>;
}) {
  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">#</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">Type</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">Step Name</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">Role</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">Documents</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">Systems</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">Amount</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-xs font-bold">Timing</th>
            <th className="border border-slate-300 px-3 py-2 text-center text-xs font-bold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.id} className="hover:bg-slate-50">
              <td className="border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600">
                {step.order}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-center">
                {step.type === 'action' ? (
                  <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                    🔵 Action
                  </span>
                ) : (
                  <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-orange-100 text-orange-800">
                    🔶 Decision
                  </span>
                )}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => onUpdateStep(step.id, 'title', e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                />
                {step.type === 'decision' && step.decisionQuestion && (
                  <p className="text-xs text-slate-500 mt-1 italic">Q: {step.decisionQuestion}</p>
                )}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="text"
                  value={step.role}
                  onChange={(e) => onUpdateStep(step.id, 'role', e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  placeholder="e.g., Sales, Operations"
                />
              </td>
              <td className="border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="text"
                  value={step.documents}
                  onChange={(e) => onUpdateStep(step.id, 'documents', e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  placeholder="Quote, Invoice (or N/A)"
                />
              </td>
              <td className="border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="text"
                  value={step.systems}
                  onChange={(e) => onUpdateStep(step.id, 'systems', e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  placeholder="CRM, Email (or N/A)"
                />
              </td>
              <td className="border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="text"
                  value={step.amount}
                  onChange={(e) => onUpdateStep(step.id, 'amount', e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  placeholder="$500, 50% (or N/A)"
                />
              </td>
              <td className="border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="text"
                  value={step.timing}
                  onChange={(e) => onUpdateStep(step.id, 'timing', e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  placeholder="Day 1, Immediately (or N/A)"
                />
              </td>
              <td className="border border-slate-300 px-3 py-2 text-center">
                <button
                  onClick={() => onDeleteStep(step.id)}
                  className="text-red-500 hover:text-red-700 transition"
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// MAIN WIZARD PAGE WITH STATE MACHINE
// ============================================
export default function WizardPage() {
  const router = useRouter();
  const { currentInput, conversationHistory, setCurrentInput, addMessage, clearConversation } = useWizardStore();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<'setup' | 'building' | 'review'>('setup');
  const [loading, setLoading] = useState(false);
  const [processId, setProcessId] = useState<string | null>(null);
  const [processName, setProcessName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [steps, setSteps] = useState<StepUI[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState>('AWAITING_STEP_NAME');
  const [currentStepData, setCurrentStepData] = useState<CurrentStepData>({});
  const [showTable, setShowTable] = useState(false);
  const [existingProcesses, setExistingProcesses] = useState<any[]>([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory]);

  // Load existing processes for setup phase
  useEffect(() => {
    if (phase !== 'setup') return;
    
    const loadProcesses = async () => {
      setLoadingProcesses(true);
      try {
        const processes = await loadUserProcesses();
        setExistingProcesses(processes);
      } catch (error) {
        console.error('Error loading processes:', error);
      }
      setLoadingProcesses(false);
    };
    loadProcesses();
  }, [phase]);

  if (!mounted) return null;

  // ============================================
  // SETUP PHASE - WITH QUICK LOAD FEATURE
  // ============================================
  if (phase === 'setup') {
    const handleStartBuilding = async () => {
      if (!processName.trim() || !trigger.trim()) return;
      setLoading(true);
      try {
        const diagram = await createProcessDiagram(processName, trigger);
        setProcessId(diagram.id);
        addMessage({
          type: 'system',
          content: `Great! Now let's map out the "${processName}" process. I'll ask you about each step.`,
        });
        addMessage({
          type: 'assistant',
          content: `${trigger} - what happens next?`,
        });
        setConversationState('AWAITING_STEP_NAME');
        setPhase('building');
      } catch (error: any) {
        alert('Error creating process: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    const handleLoadProcess = async (selectedProcess: any) => {
      if (!selectedProcess) return;
      setLoading(true);
      try {
        // Load the full process with all steps
        const { diagram, steps: dbSteps } = await loadProcess(selectedProcess.id);
        
        // Convert steps to StepUI format
        const uiSteps = dbSteps.map((step: any, idx: number) => ({
          id: step.id,
          order: step.order_num,
          title: step.action,
          role: step.department || step.primary_owner || '',
          type: step.description?.includes('decision') ? 'decision' : 'action',
          documents: step.outputs?.length ? step.outputs.join(', ') : 'N/A',
          systems: step.systems?.length ? step.systems.join(', ') : 'N/A',
          amount: step.payments?.length ? (step.payments[0]?.amount || 'N/A') : 'N/A',
          timing: step.estimated_duration || 'N/A',
          decisionQuestion: step.description?.includes('Q:') 
            ? step.description.split('Q:')[1]?.trim() 
            : undefined,
          // Phase 1 enrichment fields
          successCriteria: step.successCriteria || undefined,
          automation: step.automation || undefined,
          dependencies: step.dependencies || undefined,
          criticalNote: step.criticalNote || undefined,
          isKeyStep: step.isKeyStep || false,
        }));

        // Set state
        setProcessId(diagram.id);
        setProcessName(diagram.name);
        setTrigger(diagram.description || 'Process trigger');
        setSteps(uiSteps);

        // Add message to conversation
        addMessage({
          type: 'system',
          content: `✓ Loaded: "${diagram.name}" with ${uiSteps.length} steps. Ready to continue editing!`,
        });

        // Jump to building phase
        setPhase('building');
      } catch (error: any) {
        alert('Error loading process: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    const lastProcess = existingProcesses[0]; // Most recent process

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Process Mapper</h1>
            <p className="text-slate-600 mb-8">Let's map out your business process step by step</p>

            {/* Quick Load Button */}
            {lastProcess && !loadingProcesses && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <button
                  onClick={() => handleLoadProcess(lastProcess)}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-300 font-medium transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="animate-spin" size={16} />}
                  ⚡ Quick Load: "{lastProcess.name}" ({lastProcess.step_count || 0} steps)
                </button>
                <p className="text-xs text-blue-600 mt-2 text-center">
                  Fastest way to continue testing • Loads your most recent process
                </p>
              </div>
            )}

            {/* Create New Process */}
            <div className="mb-8 pb-8 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Create New Process</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    What's the name of this process?
                  </label>
                  <input
                    type="text"
                    value={processName}
                    onChange={(e) => setProcessName(e.target.value)}
                    placeholder="e.g., Sales Process, Bathroom Renovation, Customer Onboarding"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && handleStartBuilding()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    How does this process start? What's the trigger?
                  </label>
                  <textarea
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value)}
                    placeholder="e.g., Customer enquiry comes in via phone or email"
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-4">
                  <button
                    onClick={handleStartBuilding}
                    disabled={!processName.trim() || !trigger.trim() || loading}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium transition flex items-center gap-2"
                  >
                    {loading && <Loader2 className="animate-spin" size={16} />}
                    Start Building →
                  </button>
                </div>
              </div>
            </div>

            {/* Load Existing Process */}
            {existingProcesses.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Or Load Existing Process</h2>
                <div className="space-y-2">
                  {existingProcesses.map((proc) => (
                    <button
                      key={proc.id}
                      onClick={() => handleLoadProcess(proc)}
                      disabled={loading || loadingProcesses}
                      className="w-full p-4 text-left border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{proc.name}</p>
                          <p className="text-xs text-slate-600 mt-1">
                            {proc.step_count} steps • {proc.decision_count} decisions • Updated {new Date(proc.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-slate-400">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingProcesses && (
              <div className="flex items-center justify-center gap-2 text-slate-600">
                <Loader2 className="animate-spin" size={16} />
                <p>Loading existing processes...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // BUILDING PHASE WITH STATE MACHINE
  // ============================================
  if (phase === 'building') {
    const handleSendMessage = async () => {
      if (!currentInput.trim() || !processId) return;
      const userInput = currentInput.trim();
      setLoading(true);
      try {
        addMessage({ type: 'user', content: userInput });

        switch (conversationState) {
          case 'AWAITING_STEP_NAME':
            setCurrentStepData({ title: userInput });
            addMessage({ type: 'assistant', content: `Who does "${userInput}"?` });
            setConversationState('AWAITING_ROLE');
            break;

          case 'AWAITING_ROLE':
            setCurrentStepData(prev => ({ ...prev, role: userInput }));
            addMessage({ type: 'assistant', content: `Is this an action (A) or decision (D)?` });
            setConversationState('AWAITING_TYPE');
            break;

          case 'AWAITING_TYPE':
            const typeInput = userInput.toUpperCase();
            if (typeInput === 'A' || typeInput === 'ACTION') {
              const dbStep = await addProcessStep(
                processId,
                steps.length + 1,
                currentStepData.title!,
                currentStepData.role!,
                'action'
              );
              const newStep: StepUI = {
                id: dbStep.id,
                order: steps.length + 1,
                title: currentStepData.title!,
                role: currentStepData.role!,
                type: 'action',
                documents: 'N/A',
                systems: 'N/A',
                amount: 'N/A',
                timing: 'N/A',
                // Phase 1 enrichment fields
                successCriteria: undefined,
                automation: undefined,
                dependencies: undefined,
                criticalNote: undefined,
                isKeyStep: false,
              };
              setSteps([...steps, newStep]);
              addMessage({
                type: 'assistant',
                content: `✓ Added Action: ${currentStepData.title} (${currentStepData.role})\n\nWhat happens next?`
              });
              setCurrentStepData({});
              setConversationState('AWAITING_STEP_NAME');
            } else if (typeInput === 'D' || typeInput === 'DECISION') {
              setCurrentStepData(prev => ({ ...prev, type: 'decision' }));
              addMessage({ type: 'assistant', content: `What's the decision question?` });
              setConversationState('AWAITING_DECISION_QUESTION');
            } else {
              addMessage({ type: 'assistant', content: `Please enter 'A' for action or 'D' for decision.` });
            }
            break;

          case 'AWAITING_DECISION_QUESTION':
            setCurrentStepData(prev => ({ ...prev, decisionQuestion: userInput }));
            addMessage({ type: 'assistant', content: `If YES - what happens next?` });
            setConversationState('AWAITING_YES_BRANCH');
            break;

          case 'AWAITING_YES_BRANCH':
            setCurrentStepData(prev => ({ ...prev, yesBranch: userInput }));
            addMessage({ type: 'assistant', content: `If NO - what happens next?` });
            setConversationState('AWAITING_NO_BRANCH');
            break;

          case 'AWAITING_NO_BRANCH':
            const noBranch = userInput;
            const dbStep = await addProcessStep(
              processId,
              steps.length + 1,
              currentStepData.title!,
              currentStepData.role!,
              'decision'
            );
            await createDecision(
              processId,
              dbStep.id,
              currentStepData.decisionQuestion!,
              currentStepData.yesBranch!,
              noBranch
            );
            const newStep: StepUI = {
              id: dbStep.id,
              order: steps.length + 1,
              title: currentStepData.title!,
              role: currentStepData.role!,
              type: 'decision',
              decisionQuestion: currentStepData.decisionQuestion,
              documents: 'N/A',
              systems: 'N/A',
              amount: 'N/A',
              timing: 'N/A',
              // Phase 1 enrichment fields
              successCriteria: undefined,
              automation: undefined,
              dependencies: undefined,
              criticalNote: undefined,
              isKeyStep: false,
            };
            setSteps([...steps, newStep]);
            addMessage({
              type: 'assistant',
              content: `✓ Decision mapped: "${currentStepData.decisionQuestion}"\n → YES: ${currentStepData.yesBranch}\n → NO: ${noBranch}\n\nWhat happens next in the main flow?`
            });
            setCurrentStepData({});
            setConversationState('AWAITING_STEP_NAME');
            break;
        }
        setCurrentInput('');
      } catch (error: any) {
        alert('Error processing step: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    const handleUpdateStep = async (id: string, field: keyof StepUI, value: string) => {
      try {
        const updates: any = {};
        if (field === 'title') updates.action = value;
        if (field === 'role') {
          updates.primary_owner = value;
          updates.department = value;
        }
        if (field === 'documents') updates.outputs = value !== 'N/A' ? [value] : [];
        if (field === 'systems') updates.systems = value !== 'N/A' ? [value] : [];
        if (field === 'amount') updates.payments = value !== 'N/A' ? [{ amount: value }] : [];
        if (field === 'timing') updates.estimated_duration = value !== 'N/A' ? value : null;
        // Phase 1 enrichment fields
        if (field === 'successCriteria') updates.successCriteria = value || null;
        if (field === 'automation') updates.automation = value || null;
        if (field === 'dependencies') updates.dependencies = value || null;
        if (field === 'criticalNote') updates.criticalNote = value || null;
        if (field === 'isKeyStep') updates.isKeyStep = value === 'true';
        
        await updateProcessStep(id, updates);
        setSteps(steps.map(step => step.id === id ? { ...step, [field]: value } : step));
      } catch (error: any) {
        alert('Error updating step: ' + error.message);
      }
    };

    const handleDeleteStep = async (id: string) => {
      try {
        await deleteProcessStep(id);
        setSteps(steps.filter(s => s.id !== id).map((step, idx) => ({
          ...step,
          order: idx + 1
        })));
      } catch (error: any) {
        alert('Error deleting step: ' + error.message);
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
        {/* HEADER - Fixed Top */}
        <div className="bg-white border-b border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between max-w-full mx-auto">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{processName}</h1>
              <p className="text-slate-600 mt-1">Building the process flow</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPhase('review')}
                disabled={steps.length < 2}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium transition"
              >
                Continue to Review
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure? This will start over.')) {
                    clearConversation();
                    setSteps([]);
                    setProcessId(null);
                    setProcessName('');
                    setTrigger('');
                    setCurrentStepData({});
                    setConversationState('AWAITING_STEP_NAME');
                    setPhase('setup');
                  }
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium transition"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT: LEFT (Chat) + RIGHT (Diagram + Table) */}
        <div className="flex flex-1 gap-6 p-6 overflow-hidden">
          {/* LEFT: Chat Box */}
          <div className="w-80 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {conversationHistory.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Start describing your process...</p>
              ) : (
                conversationHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`text-sm p-2.5 rounded-lg ${
                      msg.type === 'user'
                        ? 'bg-blue-100 text-blue-900 ml-3 text-right'
                        : msg.type === 'assistant'
                        ? 'bg-slate-100 text-slate-900 mr-3'
                        : 'bg-green-100 text-green-900 mr-3 text-xs'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex gap-2 p-3 border-t border-slate-200">
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
                placeholder="Type..."
                disabled={loading}
                className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              />
              <button
                onClick={handleSendMessage}
                disabled={!currentInput.trim() || loading}
                className="px-2 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-slate-300 transition"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </div>
          </div>

          {/* RIGHT: Diagram + Collapsible Table */}
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            {/* Diagram - UPDATED WITH ADVANCED VISUALIZER */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex-1 overflow-hidden flex flex-col">
              <h2 className="text-lg font-bold text-slate-900 mb-3">Professional Process Diagram</h2>
              <div className="flex-1 overflow-auto">
                <AdvancedDiagramVisualizer steps={steps} title={`${processName} - Process Map`} />
              </div>
            </div>

            {/* Collapsible Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={() => setShowTable(!showTable)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition border-b border-slate-200"
              >
                <h2 className="text-lg font-bold text-slate-900">Process Details</h2>
                <div className={`transform transition-transform ${showTable ? 'rotate-180' : ''}`}>
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </button>

              {/* Table Content (Collapsible) */}
              {showTable && (
                <div className="p-4 max-h-64 overflow-auto">
                  <p className="text-sm text-slate-600 mb-3">
                    Fill in documents, systems, payments and timing. Use "N/A" to exclude items.
                  </p>
                  <StepsTable
                    steps={steps}
                    onUpdateStep={handleUpdateStep}
                    onDeleteStep={handleDeleteStep}
                  />
                </div>
              )}
            </div>

            {/* ENRICHMENT PANEL - Phase 1 Enhancement */}
            {steps.length >= 2 && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-6">
                {/* Header with emoji and description */}
                <div className="flex items-center gap-3 mb-6">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-purple-600 text-white rounded-full font-bold">
                    ✨
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Enrich Your Process</h3>
                    <p className="text-sm text-slate-600">
                      Add success criteria, automation rules, dependencies, and critical notes
                    </p>
                  </div>
                </div>

                {/* Collapsible steps for enrichment */}
                <div className="space-y-3">
                  {steps.map((step) => (
                    <details
                      key={step.id}
                      className="bg-white rounded-lg border border-slate-200 hover:border-purple-300 transition-colors"
                    >
                      {/* Summary - always visible */}
                      <summary className="px-4 py-3 cursor-pointer font-semibold text-slate-900 hover:bg-slate-50 transition-colors select-none">
                        <span className="flex items-center gap-2">
                          <span className="text-purple-600">Step {step.order}:</span>
                          <span>{step.title}</span>
                          {step.isKeyStep && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded">
                              ⚠️ Key Step
                            </span>
                          )}
                        </span>
                      </summary>

                      {/* Details - only visible when expanded */}
                      <div className="px-4 py-4 space-y-4 border-t border-slate-200 bg-slate-50">
                        {/* Success Criteria Input */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 mb-2 block">
                            ✓ Success Criteria <span className="text-slate-400">(optional)</span>
                          </label>
                          <input
                            type="text"
                            value={step.successCriteria || ''}
                            onChange={(e) => {
                              setSteps(
                                steps.map((s) =>
                                  s.id === step.id
                                    ? { ...s, successCriteria: e.target.value }
                                    : s
                                )
                              );
                            }}
                            placeholder="e.g., Response within 24 hours, 100% accuracy"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            How do you know this step was successful?
                          </p>
                        </div>

                        {/* Automation / Reminders Input */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 mb-2 block">
                            ⚡ Automation / Reminders <span className="text-slate-400">(optional)</span>
                          </label>
                          <input
                            type="text"
                            value={step.automation || ''}
                            onChange={(e) => {
                              setSteps(
                                steps.map((s) =>
                                  s.id === step.id
                                    ? { ...s, automation: e.target.value }
                                    : s
                                )
                              );
                            }}
                            placeholder="e.g., Auto-send email reminder after 2 days, Notify on Monday morning"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            What can we automate or remind you about?
                          </p>
                        </div>

                        {/* Dependencies Input */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 mb-2 block">
                            🔗 Dependencies <span className="text-slate-400">(optional)</span>
                          </label>
                          <input
                            type="text"
                            value={step.dependencies || ''}
                            onChange={(e) => {
                              setSteps(
                                steps.map((s) =>
                                  s.id === step.id
                                    ? { ...s, dependencies: e.target.value }
                                    : s
                                )
                              );
                            }}
                            placeholder="e.g., Requires approval from Finance, Depends on data from Step 2"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            What needs to happen before this step can proceed?
                          </p>
                        </div>

                        {/* Critical Notes / Issues Input */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 mb-2 block">
                            ⚠️ Critical Notes <span className="text-slate-400">(optional)</span>
                          </label>
                          <textarea
                            value={step.criticalNote || ''}
                            onChange={(e) => {
                              setSteps(
                                steps.map((s) =>
                                  s.id === step.id
                                    ? { ...s, criticalNote: e.target.value }
                                    : s
                                )
                              );
                            }}
                            placeholder="e.g., This is a bottleneck, single point of failure, takes too long, needs better tools"
                            rows={2}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Any problems, risks, or concerns with this step?
                          </p>
                        </div>

                        {/* Mark as Key Step Checkbox */}
                        <div className="pt-2 border-t border-slate-200">
                          <label className="flex items-center gap-3 cursor-pointer hover:bg-white px-2 py-2 rounded transition">
                            <input
                              type="checkbox"
                              checked={step.isKeyStep || false}
                              onChange={(e) => {
                                setSteps(
                                  steps.map((s) =>
                                    s.id === step.id
                                      ? { ...s, isKeyStep: e.target.checked }
                                      : s
                                  )
                                );
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                            />
                            <div>
                              <p className="text-sm font-semibold text-slate-700">
                                Mark as Key Step
                              </p>
                              <p className="text-xs text-slate-500">
                                Critical to overall process success
                              </p>
                            </div>
                          </label>
                        </div>

                        {/* Completion indicator */}
                        <div className="pt-2 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-3 border border-purple-100">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="inline-flex items-center justify-center w-4 h-4 bg-purple-600 text-white rounded-full font-bold text-[10px]">
                              {[
                                step.successCriteria,
                                step.automation,
                                step.dependencies,
                                step.criticalNote,
                              ].filter(Boolean).length}
                            </span>
                            <span className="text-slate-600 font-medium">
                              of 4 enrichment fields filled
                            </span>
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>

                {/* Bottom tip */}
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-slate-600">
                  💡 <strong>Tip:</strong> You don't need to fill all fields. Start with what's
                  most important, then come back to enrich the process more later.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // REVIEW PHASE
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-full mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{processName} - Review</h1>
              <p className="text-slate-600 mt-1">Process complete ✓</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPhase('building')}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium transition"
              >
                ← Back to Editing
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Diagram */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Full Process Diagram</h2>
          <AdvancedDiagramVisualizer steps={steps} title={`${processName} - Complete Process Map`} />
        </div>

        {/* Summary and Table */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 col-span-1">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Process Summary</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-600 font-medium">Process</p>
                <p className="text-sm font-semibold text-slate-900">{processName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Trigger</p>
                <p className="text-sm text-slate-700">{trigger}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Total Steps</p>
                <p className="text-sm font-semibold text-slate-900">
                  {steps.length} ({steps.filter(s => s.type === 'action').length} actions, {steps.filter(s => s.type === 'decision').length} decisions)
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Saved to Supabase</p>
                <p className="text-sm font-semibold text-green-600">✓ Process ID: {processId?.substring(0, 8)}...</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="col-span-2 grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-600 font-medium">Total Steps</p>
              <p className="text-2xl font-bold text-slate-900">{steps.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-600 font-medium">Actions</p>
              <p className="text-2xl font-bold text-blue-600">{steps.filter(s => s.type === 'action').length}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-600 font-medium">Decisions</p>
              <p className="text-2xl font-bold text-orange-600">{steps.filter(s => s.type === 'decision').length}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-600 font-medium">Unique Roles</p>
              <p className="text-2xl font-bold text-slate-900">{Array.from(new Set(steps.map(s => s.role))).length}</p>
            </div>
          </div>
        </div>

        {/* Full Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Complete Process Details</h2>
          <StepsTable
            steps={steps}
            onUpdateStep={async () => {}}
            onDeleteStep={async () => {}}
          />
        </div>
      </div>
    </div>
  );
}