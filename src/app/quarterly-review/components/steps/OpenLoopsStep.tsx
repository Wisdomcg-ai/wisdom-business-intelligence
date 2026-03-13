'use client';

import { useEffect, useState } from 'react';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, OpenLoopDecisionRecord, OpenLoopDecision } from '../../types';
import { OPEN_LOOP_DECISION_LABELS } from '../../types';
import {
  Circle, CheckCircle2, UserPlus, Trash2, Calendar, AlertCircle,
  Loader2, Plus, Users, Inbox, X
} from 'lucide-react';
import {
  getOpenLoops,
  createOpenLoop,
  type OpenLoop,
  type CreateOpenLoopInput
} from '@/lib/services/openLoopsService';

interface OpenLoopsStepProps {
  review: QuarterlyReview;
  onUpdate: (decisions: OpenLoopDecisionRecord[]) => void;
}

export function OpenLoopsStep({ review, onUpdate }: OpenLoopsStepProps) {
  const [openLoops, setOpenLoops] = useState<OpenLoop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { activeBusiness } = useBusinessContext();

  // Form state — matches CreateOpenLoopInput exactly
  const [formData, setFormData] = useState<CreateOpenLoopInput>({
    title: '',
    start_date: new Date().toISOString().split('T')[0],
    expected_completion_date: null,
    owner: 'Me',
    status: 'in-progress',
    blocker: null
  });

  const decisions = review.open_loops_decisions || [];

  useEffect(() => {
    fetchOpenLoops();
  }, []);

  const fetchOpenLoops = async () => {
    try {
      const businessId = activeBusiness?.id;
      const overrideUserId = activeBusiness?.ownerId;
      const data = await getOpenLoops(undefined, overrideUserId, businessId);
      setOpenLoops(data || []);
    } catch (error) {
      console.log('Open loops fetch error:', error);
      setOpenLoops([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLoop = async () => {
    if (!formData.title.trim()) return;
    setIsAdding(true);

    try {
      const businessId = activeBusiness?.id;
      const newLoop = await createOpenLoop(formData, undefined, businessId);
      setOpenLoops([newLoop, ...openLoops]);
      setFormData({
        title: '',
        start_date: new Date().toISOString().split('T')[0],
        expected_completion_date: null,
        owner: 'Me',
        status: 'in-progress',
        blocker: null
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding open loop:', error);
    } finally {
      setIsAdding(false);
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
          subtitle="Review commitments and promises made to others"
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
        subtitle="Audit commitments made to clients, team, and partners — close, delegate, or defer each one"
        estimatedTime={20}
        tip="Open loops drain mental energy. Close them or schedule them."
      />

      {/* Decision Stats */}
      {openLoops.length > 0 && (
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
      )}

      {/* Add New Open Loop */}
      <div className="mb-6">
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-brand-orange hover:text-brand-orange transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add a commitment or promise you need to close
          </button>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-orange" />
                <span className="text-sm font-medium text-gray-700">New Open Loop</span>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Title */}
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddLoop()}
              placeholder="What did you commit to? e.g. 'Send proposal to Client X'"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
              autoFocus
            />

            {/* Owner & Target Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Me"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Target Date (optional)</label>
                <input
                  type="date"
                  value={formData.expected_completion_date || ''}
                  onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm bg-white"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddLoop}
                disabled={!formData.title.trim() || isAdding}
                className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium text-sm hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Loop
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Open Loops List */}
      {openLoops.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center border border-gray-200">
          <Inbox className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 mb-2">No Open Loops Tracked</h3>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            Think about commitments you&apos;ve made this quarter — promises to clients, follow-ups with your team,
            things you said you&apos;d do but haven&apos;t closed yet. Add them above.
          </p>
          <div className="mt-4 text-left max-w-sm mx-auto">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Common examples:</p>
            <ul className="text-sm text-gray-600 space-y-1.5">
              <li className="flex items-center gap-2"><Circle className="w-2 h-2 text-gray-400 flex-shrink-0" /> Send revised proposal to a client</li>
              <li className="flex items-center gap-2"><Circle className="w-2 h-2 text-gray-400 flex-shrink-0" /> Follow up on partnership discussion</li>
              <li className="flex items-center gap-2"><Circle className="w-2 h-2 text-gray-400 flex-shrink-0" /> Deliver training materials to team</li>
              <li className="flex items-center gap-2"><Circle className="w-2 h-2 text-gray-400 flex-shrink-0" /> Reply to supplier about pricing</li>
            </ul>
          </div>
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
                    <div className="flex items-center gap-2 mt-2">
                      {loop.owner && (
                        <span className="inline-block text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {loop.owner}
                        </span>
                      )}
                      {loop.blocker && (
                        <span className="inline-block text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">
                          Blocker: {loop.blocker}
                        </span>
                      )}
                    </div>
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
          <Users className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Commitments & Promises</h4>
            <p className="text-sm text-gray-600 mt-1 mb-2">
              Open loops are things you&apos;ve committed to others — clients, team members, partners, suppliers.
              Unresolved commitments drain mental energy and erode trust.
            </p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li><strong>Complete:</strong> Schedule it in your calendar this week</li>
              <li><strong>Delegate:</strong> Assign clear ownership with a deadline</li>
              <li><strong>Delete:</strong> Let it go — it&apos;s no longer relevant</li>
              <li><strong>Defer:</strong> Move to a specific future quarter</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
