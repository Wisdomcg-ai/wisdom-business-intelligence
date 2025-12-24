/**
 * ForecastWizardV3 - Complete 3-panel AI-powered forecast wizard
 *
 * Layout: Data Panel (left) | Chat Panel (center) | Forecast Summary (right)
 *
 * Features:
 * - Powered by Claude AI (Sonnet for speed, Opus for review)
 * - Continuous chat that never clears between steps
 * - AI proposes, user approves pattern
 * - Live updating forecast as decisions are made
 * - Responsive design for tablet/mobile
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Menu, ChevronLeft, ChevronRight, Check, Loader2, ArrowRight, SkipForward } from 'lucide-react';
import { DataPanel } from './DataPanel';
import { ChatPanel } from './ChatPanel';
import { ForecastSummary } from './ForecastSummary';
import {
  WizardStep,
  WizardContext,
  CFOMessage,
  ForecastDecision,
  WizardSession,
  StrategicInitiative,
  XeroEmployee,
  BusinessGoals,
  HistoricalPLSummary,
} from '@/app/finances/forecast/types';
import { getStepGreeting } from '@/lib/services/claude-cfo-agent';

interface ForecastWizardV3Props {
  businessId: string;
  businessName?: string;
  fiscalYear: number;
  onComplete?: (forecastId: string) => void;
  onClose?: () => void;
}

const STEP_ORDER: WizardStep[] = ['setup', 'team', 'costs', 'investments', 'projections', 'review'];

// Helper to parse years selection from user message
function parseYearsFromMessage(message: string): number[] | null {
  const lower = message.toLowerCase();

  // Check for explicit year mentions
  if (lower.includes('3 year') || lower.includes('3-year') || lower.includes('three year')) {
    return [1, 2, 3];
  }
  if (lower.includes('2 year') || lower.includes('2-year') || lower.includes('two year')) {
    return [1, 2];
  }
  if (lower.includes('1 year') || lower.includes('1-year') || lower.includes('one year') ||
      lower.includes('year 1') || lower.includes('proceed with 1') || lower.includes('yes')) {
    return [1];
  }

  return null;
}

// Helper to get next step, considering whether to skip projections
function getNextStep(currentStep: WizardStep, yearsSelected: number[]): WizardStep | null {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  // If at last step, no next
  if (currentIndex >= STEP_ORDER.length - 1) {
    return null;
  }

  let nextStep = STEP_ORDER[currentIndex + 1];

  // Skip projections if only 1 year selected
  if (nextStep === 'projections' && yearsSelected.length === 1 && yearsSelected[0] === 1) {
    nextStep = 'review';
  }

  return nextStep;
}

// Helper to parse decisions from AI response and user message
function parseDecisions(userMessage: string, aiResponse: string, step: WizardStep): ForecastDecision[] {
  const newDecisions: ForecastDecision[] = [];
  const lower = userMessage.toLowerCase();
  const aiLower = aiResponse.toLowerCase();

  // Parse based on step
  switch (step) {
    case 'team':
      // Check for planned hires
      if (lower.includes('hire') || lower.includes('recruit') || lower.includes('new') || lower.includes('add')) {
        // Try to extract role and salary
        const salaryMatch = userMessage.match(/\$?([\d,]+)k?/i);
        const salary = salaryMatch ? parseFloat(salaryMatch[1].replace(/,/g, '')) * (salaryMatch[0].toLowerCase().includes('k') ? 1000 : 1) : 0;

        // Extract month if mentioned
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const monthMatch = months.find(m => lower.includes(m));

        newDecisions.push({
          id: `decision-${Date.now()}`,
          decision_type: 'new_hire',
          decision_data: {
            role: 'New Hire', // Will be refined by AI
            annual_salary: salary || 80000, // Default
            start_month: monthMatch || 'january',
            classification: 'opex',
          },
          user_reasoning: userMessage,
          created_at: new Date().toISOString(),
        });
      }
      // Check for "no hires"
      if (lower.includes('no hire') || lower.includes('no planned') || lower === 'no') {
        newDecisions.push({
          id: `decision-${Date.now()}`,
          decision_type: 'team_confirmed',
          decision_data: { no_changes: true },
          created_at: new Date().toISOString(),
        });
      }
      break;

    case 'costs':
      // Parse cost adjustments
      const percentMatch = userMessage.match(/(\+?\-?\d+)\s*%/);
      if (percentMatch) {
        newDecisions.push({
          id: `decision-${Date.now()}`,
          decision_type: 'cost_changed',
          decision_data: {
            adjustment_percent: parseFloat(percentMatch[1]),
            reason: userMessage,
          },
          created_at: new Date().toISOString(),
        });
      }
      // Check for baseline confirmation
      if (lower.includes('prior year') || lower.includes('baseline') || lower.includes('use') || lower.includes('yes')) {
        newDecisions.push({
          id: `decision-${Date.now()}`,
          decision_type: 'costs_confirmed',
          decision_data: { use_prior_year: true },
          created_at: new Date().toISOString(),
        });
      }
      break;

    case 'investments':
      // Parse investment mentions
      const amountMatch = userMessage.match(/\$?([\d,]+)k?/gi);
      if (amountMatch && amountMatch.length > 0) {
        amountMatch.forEach((match, index) => {
          const amount = parseFloat(match.replace(/[$,]/g, '')) * (match.toLowerCase().includes('k') ? 1000 : 1);
          if (amount > 1000) { // Only count significant amounts
            newDecisions.push({
              id: `decision-${Date.now()}-${index}`,
              decision_type: 'investment',
              decision_data: {
                amount,
                description: userMessage,
                type: lower.includes('capex') || lower.includes('equipment') || lower.includes('vehicle') ? 'capex' : 'opex',
              },
              created_at: new Date().toISOString(),
            });
          }
        });
      }
      // No investments
      if (lower.includes('no investment') || lower.includes('none') || lower === 'no') {
        newDecisions.push({
          id: `decision-${Date.now()}`,
          decision_type: 'investments_confirmed',
          decision_data: { no_investments: true },
          created_at: new Date().toISOString(),
        });
      }
      break;
  }

  return newDecisions;
}

// Initial suggestions shown when entering a step
const INITIAL_SUGGESTIONS: Record<WizardStep, string[]> = {
  setup: ['Yes, 1 year is good', 'Include Year 2-3 as well', 'Just Year 1 for now'],
  team: ['Yes, I have planned hires', 'No new hires planned', 'Let me think about it'],
  costs: ['Yes, use prior year', 'Add 5% for inflation', 'I want to adjust some categories'],
  investments: ['Yes, let me specify investments', 'No major investments this year'],
  projections: ['Yes, use my existing goals', 'I want to set different targets'],
  review: ['Looks good, finalize it', 'I need to make some changes'],
};

// Follow-up suggestions after user has responded (iterative flow)
const FOLLOWUP_SUGGESTIONS: Record<WizardStep, string[]> = {
  setup: ["That's all correct", 'I want to change something'],
  team: ['Add another hire', "That's all the hires", 'Actually, one more'],
  costs: ['Make another adjustment', "That's all, looks good"],
  investments: ['Add another investment', "That's everything"],
  projections: ['Yes, confirmed', 'I want to adjust'],
  review: ['Finalize and save', 'Go back and adjust something'],
};

export function ForecastWizardV3({
  businessId,
  businessName,
  fiscalYear,
  onComplete,
  onClose,
}: ForecastWizardV3Props) {
  // Core state
  const [currentStep, setCurrentStep] = useState<WizardStep>('setup');
  const [messages, setMessages] = useState<CFOMessage[]>([]);
  const [decisions, setDecisions] = useState<ForecastDecision[]>([]);
  const [stepsCompleted, setStepsCompleted] = useState<WizardStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic suggestions from AI (contextual to what was just asked)
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);

  // Track selected years (1, 2, or 3)
  const [yearsSelected, setYearsSelected] = useState<number[]>([1]);

  // Context state
  const [context, setContext] = useState<WizardContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  // Mobile/tablet responsive state
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile/tablet
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load initial context
  useEffect(() => {
    async function loadContext() {
      setIsLoadingContext(true);
      try {
        // Fetch goals
        const goalsRes = await fetch(`/api/goals?business_id=${businessId}&fiscal_year=${fiscalYear}`);
        const goalsData = await goalsRes.json();
        const goals: BusinessGoals = goalsData.goals || {};

        // Fetch team from Xero
        const teamRes = await fetch(`/api/Xero/employees?business_id=${businessId}`);
        const teamData = await teamRes.json();
        const team: XeroEmployee[] = teamData.employees || [];

        // Fetch strategic initiatives
        const initRes = await fetch(`/api/strategic-initiatives?business_id=${businessId}&annual_plan_only=true`);
        const initData = await initRes.json();
        const initiatives: StrategicInitiative[] = initData.initiatives || [];

        // Fetch Xero status and historical data
        const xeroRes = await fetch(`/api/Xero/status?business_id=${businessId}`);
        const xeroData = await xeroRes.json();
        const xeroConnected = xeroData.connected || false;

        // Fetch historical P&L if Xero connected
        let historicalPL: HistoricalPLSummary | undefined;
        if (xeroConnected) {
          const plRes = await fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`);
          const plData = await plRes.json();
          if (plData.summary) {
            historicalPL = plData.summary;
          }
        }

        // Build session
        const session: WizardSession = {
          id: `session-${Date.now()}`,
          user_id: 'current-user',
          business_id: businessId,
          started_at: new Date().toISOString(),
          mode: 'guided',
          current_step: 'setup',
          steps_completed: {
            setup: { completed: false, time_spent_seconds: 0 },
            team: { completed: false, time_spent_seconds: 0 },
            costs: { completed: false, time_spent_seconds: 0 },
            investments: { completed: false, time_spent_seconds: 0 },
            projections: { completed: false, time_spent_seconds: 0 },
            review: { completed: false, time_spent_seconds: 0 },
          },
          years_selected: [1],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const newContext: WizardContext = {
          business_id: businessId,
          business_name: businessName,
          fiscal_year: fiscalYear,
          goals,
          current_team: team,
          strategic_initiatives: initiatives,
          session,
          decisions_made: [],
          xero_connected: xeroConnected,
          historical_pl: historicalPL,
        };

        setContext(newContext);

        // Get initial greeting with suggestions
        const greeting = getStepGreeting('setup', newContext);
        setMessages([greeting]);
        if (greeting.suggestions) {
          setDynamicSuggestions(greeting.suggestions);
        }
      } catch (err) {
        console.error('Failed to load context:', err);
        setError('Failed to load business data. Please try again.');
      } finally {
        setIsLoadingContext(false);
      }
    }

    loadContext();
  }, [businessId, businessName, fiscalYear]);

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!context || isLoading) return;

      // Add user message
      const userMessage: CFOMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        step: currentStep,
      };
      setMessages(prev => [...prev, userMessage]);
      setIsLoading(true);

      // Parse years selection if in setup step
      if (currentStep === 'setup') {
        const parsedYears = parseYearsFromMessage(message);
        if (parsedYears) {
          setYearsSelected(parsedYears);
          // Update context session with new years
          setContext(prev => prev ? {
            ...prev,
            session: {
              ...prev.session,
              years_selected: parsedYears,
            },
          } : null);
        }
      }

      // Parse any decisions from the user message
      const newDecisions = parseDecisions(message, '', currentStep);
      if (newDecisions.length > 0) {
        setDecisions(prev => [...prev, ...newDecisions]);
        // Update context with decisions
        setContext(prev => prev ? {
          ...prev,
          decisions_made: [...(prev.decisions_made || []), ...newDecisions],
        } : null);
      }

      try {
        // Build updated context with current decisions
        const updatedContext = {
          ...context,
          session: {
            ...context.session,
            years_selected: yearsSelected,
          },
          decisions_made: [...(context.decisions_made || []), ...decisions, ...newDecisions],
        };

        // Call Claude CFO API
        const response = await fetch('/api/forecast/claude-cfo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'message',
            step: currentStep,
            message,
            context: updatedContext,
            conversationHistory: messages,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to get AI response');
        }

        const data = await response.json();

        // Store dynamic suggestions from AI response
        if (data.suggestions && Array.isArray(data.suggestions)) {
          setDynamicSuggestions(data.suggestions);
        } else {
          setDynamicSuggestions([]);
        }

        // Add CFO response
        const cfoMessage: CFOMessage = {
          id: data.message.id || `cfo-${Date.now()}`,
          role: 'cfo',
          content: data.message.message || data.message.content || data.message,
          timestamp: new Date().toISOString(),
          step: currentStep,
        };
        setMessages(prev => [...prev, cfoMessage]);

        // Parse any decisions from the AI response
        const aiDecisions = parseDecisions(message, cfoMessage.content, currentStep);
        if (aiDecisions.length > 0) {
          setDecisions(prev => [...prev, ...aiDecisions]);
        }

        // Handle step completion
        if (data.stepComplete) {
          // Mark current step as completed
          setStepsCompleted(prev => [...prev, currentStep]);

          // Update session in context
          setContext(prev => prev ? {
            ...prev,
            session: {
              ...prev.session,
              current_step: currentStep,
              steps_completed: {
                ...prev.session.steps_completed,
                [currentStep]: { completed: true, time_spent_seconds: 0 },
              },
            },
          } : null);

          // Move to next step (using helper that skips projections if needed)
          const nextStep = getNextStep(currentStep, yearsSelected);

          if (nextStep) {
            setCurrentStep(nextStep);

            // Get greeting for next step with updated context
            const nextContext = {
              ...updatedContext,
              session: {
                ...updatedContext.session,
                current_step: nextStep,
              },
            };
            const greeting = getStepGreeting(nextStep, nextContext);
            setTimeout(() => {
              setMessages(prev => [...prev, greeting]);
              if (greeting.suggestions) {
                setDynamicSuggestions(greeting.suggestions);
              }
            }, 500);
          } else {
            // Wizard complete - generate and save the forecast
            try {
              const generateResponse = await fetch('/api/forecast-wizard/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  businessId,
                  fiscalYear,
                  context: updatedContext,
                  decisions: [...decisions, ...newDecisions],
                  yearsSelected,
                }),
              });

              if (generateResponse.ok) {
                const result = await generateResponse.json();
                if (onComplete) {
                  onComplete(result.forecastId);
                }
              } else {
                console.error('Failed to generate forecast');
                setError('Failed to save forecast. Please try again.');
                if (onComplete) {
                  onComplete('');
                }
              }
            } catch (genError) {
              console.error('Error generating forecast:', genError);
              setError('Failed to save forecast. Please try again.');
              if (onComplete) {
                onComplete('');
              }
            }
          }
        }
      } catch (err) {
        console.error('Error sending message:', err);
        setError('Failed to send message. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [context, currentStep, isLoading, messages, onComplete, yearsSelected, decisions]
  );

  // Get suggestions - prefer dynamic AI suggestions, fallback to static
  const userMessagesInStep = messages.filter(m => m.role === 'user' && m.step === currentStep).length;
  const staticSuggestions = userMessagesInStep > 0
    ? FOLLOWUP_SUGGESTIONS[currentStep] || []
    : INITIAL_SUGGESTIONS[currentStep] || [];

  // Use dynamic suggestions from AI if available, otherwise use static
  const currentSuggestions = dynamicSuggestions.length > 0
    ? dynamicSuggestions
    : staticSuggestions;

  // Manual step advancement function
  const handleNextStep = useCallback(() => {
    const nextStep = getNextStep(currentStep, yearsSelected);
    if (nextStep) {
      // Mark current step as completed
      setStepsCompleted(prev => [...prev, currentStep]);

      // Update context
      setContext(prev => prev ? {
        ...prev,
        session: {
          ...prev.session,
          current_step: nextStep,
          steps_completed: {
            ...prev.session.steps_completed,
            [currentStep]: { completed: true, time_spent_seconds: 0 },
          },
        },
      } : null);

      // Move to next step
      setCurrentStep(nextStep);

      // Add transition message with suggestions
      if (context) {
        const greeting = getStepGreeting(nextStep, {
          ...context,
          session: { ...context.session, current_step: nextStep },
        });
        setTimeout(() => {
          setMessages(prev => [...prev, greeting]);
          if (greeting.suggestions) {
            setDynamicSuggestions(greeting.suggestions);
          }
        }, 300);
      }
    }
  }, [currentStep, yearsSelected, context]);

  // Manual finalize function for review step
  const handleFinalize = useCallback(async () => {
    if (!context || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const generateResponse = await fetch('/api/forecast-wizard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          fiscalYear,
          context: {
            ...context,
            session: {
              ...context.session,
              years_selected: yearsSelected,
            },
            decisions_made: decisions,
          },
          decisions,
          yearsSelected,
        }),
      });

      if (generateResponse.ok) {
        const result = await generateResponse.json();
        if (onComplete) {
          onComplete(result.forecastId);
        }
      } else {
        const errorData = await generateResponse.json();
        console.error('Failed to generate forecast:', errorData);
        setError('Failed to save forecast. Please try again.');
      }
    } catch (err) {
      console.error('Error finalizing forecast:', err);
      setError('Failed to save forecast. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [context, isLoading, businessId, fiscalYear, yearsSelected, decisions, onComplete]);

  if (isLoadingContext) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <div className="text-gray-600">Loading your business data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          {isMobile && (
            <button
              onClick={() => setShowLeftPanel(!showLeftPanel)}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="font-semibold text-gray-900">Forecast Wizard</h1>
            <p className="text-xs text-gray-500">
              {businessName || 'Your Business'} - FY{fiscalYear}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Step navigation buttons */}
          {currentStep !== 'review' && (
            <button
              onClick={handleNextStep}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              title="Skip to next step"
            >
              <span>Next Step</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {/* Finalize button - shown on review step */}
          {currentStep === 'review' && (
            <button
              onClick={handleFinalize}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Finalize Forecast</span>
                </>
              )}
            </button>
          )}

          {isMobile && (
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              {showRightPanel ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main content - 3 panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Data */}
        <div
          className={`
            ${isMobile ? 'absolute inset-y-14 left-0 z-40 w-80 shadow-lg' : 'w-80 border-r border-gray-200'}
            ${isMobile && !showLeftPanel ? '-translate-x-full' : 'translate-x-0'}
            transition-transform duration-300 bg-white flex-shrink-0
          `}
        >
          <DataPanel context={context} isLoading={isLoadingContext} />
        </div>

        {/* Mobile overlay */}
        {isMobile && showLeftPanel && (
          <div
            className="absolute inset-0 bg-black/20 z-30"
            onClick={() => setShowLeftPanel(false)}
          />
        )}

        {/* Center Panel - Chat */}
        <div className="flex-1 min-w-0">
          <ChatPanel
            messages={messages}
            currentStep={currentStep}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            suggestions={currentSuggestions}
          />
        </div>

        {/* Right Panel - Forecast Summary */}
        <div
          className={`
            ${isMobile ? 'absolute inset-y-14 right-0 z-40 w-80 shadow-lg' : 'w-80 border-l border-gray-200'}
            ${isMobile && !showRightPanel ? 'translate-x-full' : 'translate-x-0'}
            transition-transform duration-300 bg-white flex-shrink-0
          `}
        >
          <ForecastSummary
            context={context}
            currentStep={currentStep}
            decisions={decisions}
            stepsCompleted={stepsCompleted}
          />
        </div>

        {/* Mobile overlay for right panel */}
        {isMobile && showRightPanel && (
          <div
            className="absolute inset-0 bg-black/20 z-30"
            onClick={() => setShowRightPanel(false)}
          />
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-white/80 hover:text-white"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
