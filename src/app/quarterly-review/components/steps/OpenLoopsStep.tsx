'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, OpenLoopDecisionRecord, OpenLoopDecision } from '../../types';
import { OPEN_LOOP_DECISION_LABELS } from '../../types';
import { Circle, CheckCircle2, UserPlus, Trash2, Calendar, AlertCircle, Loader2 } from 'lucide-react';

interface OpenLoopsStepProps {
  review: QuarterlyReview;
  onUpdate: (decisions: OpenLoopDecisionRecord[]) => void;
}

interface OpenLoop {
  id: string;
  title: string;
  description?: string;
  category?: string;
  created_at: string;
}

export function OpenLoopsStep({ review, onUpdate }: OpenLoopsStepProps) {
  const [openLoops, setOpenLoops] = useState<OpenLoop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  const decisions = review.open_loops_decisions || [];

  useEffect(() => {
    fetchOpenLoops();
  }, []);

  const fetchOpenLoops = async () => {
    try {
      // Get current user for query
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Use activeBusiness owner ID if coach is viewing, otherwise use current user ID
      const targetUserId = activeBusiness?.ownerId || user.id;

      // Fetch open loops - uses user_id not business_id
      const { data, error } = await supabase
        .from('open_loops')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      // Handle different error types gracefully
      if (error) {
        console.log('Open loops query error:', error.message);
        setOpenLoops([]);
      } else {
        setOpenLoops(data || []);
      }
    } catch (error) {
      console.log('Open loops table not available');
      setOpenLoops([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getDecision = (loopId: string): OpenLoopDecisionRecord | undefined => {
    return decisions.find(d => d.loopId === loopId);
  };

  const updateDecision = (
    loopId: string,
    loopTitle: string,
    decision: OpenLoopDecision,
    additionalData?: Partial<OpenLoopDecisionRecord>
  ) => {
    const existing = decisions.find(d => d.loopId === loopId);
    const updated: OpenLoopDecisionRecord[] = existing
      ? decisions.map(d => d.loopId === loopId ? { ...d, decision, ...additionalData } : d)
      : [...decisions, { loopId, title: loopTitle, decision, notes: '', ...additionalData }];

    onUpdate(updated);
  };

  const updateNotes = (loopId: string, notes: string) => {
    const updated = decisions.map(d =>
      d.loopId === loopId ? { ...d, notes } : d
    );
    onUpdate(updated);
  };

  const updateDelegateTo = (loopId: string, delegateTo: string) => {
    const updated = decisions.map(d =>
      d.loopId === loopId ? { ...d, delegateTo } : d
    );
    onUpdate(updated);
  };

  const updateDeferTo = (loopId: string, deferToQuarter: string) => {
    const updated = decisions.map(d =>
      d.loopId === loopId ? { ...d, deferToQuarter } : d
    );
    onUpdate(updated);
  };

  const getDecisionStats = () => {
    const stats = { complete: 0, delegate: 0, delete: 0, defer: 0, undecided: 0 };
    openLoops.forEach(loop => {
      const decision = getDecision(loop.id);
      if (decision) {
        stats[decision.decision]++;
      } else {
        stats.undecided++;
      }
    });
    return stats;
  };

  const stats = getDecisionStats();

  const DecisionButton = ({
    loop,
    decision,
    icon: Icon,
    color
  }: {
    loop: OpenLoop;
    decision: OpenLoopDecision;
    icon: React.ElementType;
    color: string;
  }) => {
    const currentDecision = getDecision(loop.id);
    const isSelected = currentDecision?.decision === decision;

    return (
      <button
        onClick={() => updateDecision(loop.id, loop.title, decision)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isSelected
            ? `${color} shadow-sm scale-105`
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        {OPEN_LOOP_DECISION_LABELS[decision].split(' ')[0]}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="2.2"
          subtitle="Review and make decisions on your open loops"
          estimatedTime={20}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="2.2"
        subtitle="Make a decision on each open loop: Complete, Delegate, Delete, or Defer"
        estimatedTime={20}
        tip="The goal is to reduce mental load"
      />

      {/* Decision Stats */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{stats.complete}</div>
          <div className="text-xs text-gray-600">Complete</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{stats.delegate}</div>
          <div className="text-xs text-gray-600">Delegate</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{stats.delete}</div>
          <div className="text-xs text-gray-600">Delete</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{stats.defer}</div>
          <div className="text-xs text-gray-600">Defer</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{stats.undecided}</div>
          <div className="text-xs text-gray-600">Undecided</div>
        </div>
      </div>

      {/* Open Loops List */}
      {openLoops.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center border border-gray-200">
          <CheckCircle2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 mb-2">No Open Loops!</h3>
          <p className="text-gray-700">
            Great job! You have no unresolved open loops.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {openLoops.map(loop => {
            const decision = getDecision(loop.id);

            return (
              <div
                key={loop.id}
                className={`rounded-xl border p-4 transition-all ${
                  decision
                    ? 'bg-gray-50 border-slate-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{loop.title}</h4>
                    {loop.description && (
                      <p className="text-sm text-gray-600 mt-1">{loop.description}</p>
                    )}
                    {loop.category && (
                      <span className="inline-block mt-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                        {loop.category}
                      </span>
                    )}
                  </div>
                </div>

                {/* Decision Buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <DecisionButton
                    loop={loop}
                    decision="complete"
                    icon={CheckCircle2}
                    color="bg-brand-orange text-white"
                  />
                  <DecisionButton
                    loop={loop}
                    decision="delegate"
                    icon={UserPlus}
                    color="bg-brand-orange-500 text-white"
                  />
                  <DecisionButton
                    loop={loop}
                    decision="delete"
                    icon={Trash2}
                    color="bg-gray-500 text-white"
                  />
                  <DecisionButton
                    loop={loop}
                    decision="defer"
                    icon={Calendar}
                    color="bg-gray-400 text-white"
                  />
                </div>

                {/* Additional Fields Based on Decision */}
                {decision && (
                  <div className="pt-3 border-t border-gray-200 space-y-3">
                    {decision.decision === 'delegate' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Delegate to:
                        </label>
                        <input
                          type="text"
                          value={decision.delegateTo || ''}
                          onChange={(e) => updateDelegateTo(loop.id, e.target.value)}
                          placeholder="Name of person..."
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    )}

                    {decision.decision === 'defer' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Defer to:
                        </label>
                        <select
                          value={decision.deferToQuarter || ''}
                          onChange={(e) => updateDeferTo(loop.id, e.target.value)}
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
                        >
                          <option value="">Select quarter...</option>
                          <option value={`Q${review.quarter === 4 ? 1 : review.quarter + 1} ${review.quarter === 4 ? review.year + 1 : review.year}`}>
                            Next Quarter
                          </option>
                          <option value={`Q${((review.quarter + 1) % 4) + 1} ${review.quarter >= 3 ? review.year + 1 : review.year}`}>
                            Q+2
                          </option>
                          <option value="Next Year">Next Year</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Notes:
                      </label>
                      <input
                        type="text"
                        value={decision.notes || ''}
                        onChange={(e) => updateNotes(loop.id, e.target.value)}
                        placeholder="Any additional notes..."
                        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Guidance */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Decision Guide</h4>
            <ul className="mt-2 text-sm text-gray-700 space-y-1">
              <li>• <strong>Complete:</strong> Schedule it in your calendar this week</li>
              <li>• <strong>Delegate:</strong> Assign clear ownership with a deadline</li>
              <li>• <strong>Delete:</strong> Let it go - it's no longer a priority</li>
              <li>• <strong>Defer:</strong> Move to a specific future quarter</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
