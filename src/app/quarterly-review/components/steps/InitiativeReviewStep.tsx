'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type {
  QuarterlyReview,
  InitiativeDecision,
  InitiativeAction,
} from '../../types';
import {
  Rocket,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Lightbulb,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';

interface InitiativeReviewStepProps {
  review: QuarterlyReview;
  onUpdate: (decisions: InitiativeDecision[]) => void;
}

interface SupabaseInitiative {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  progress_percentage: number;
}

interface SwotItem {
  id: string;
  type: string;
  description: string;
  tags?: string;
}

interface NewInitiativeForm {
  title: string;
  category: string;
  description: string;
  targetQuarter: string;
}

const DECISION_OPTIONS: { value: InitiativeAction; label: string; color: string }[] = [
  { value: 'keep', label: 'Keep', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'accelerate', label: 'Accelerate', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'defer', label: 'Defer', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'kill', label: 'Kill', color: 'bg-red-100 text-red-700 border-red-200' },
];

const CATEGORY_OPTIONS = [
  { value: 'growth', label: 'Growth' },
  { value: 'efficiency', label: 'Efficiency' },
  { value: 'innovation', label: 'Innovation' },
  { value: 'culture', label: 'Culture' },
  { value: 'financial', label: 'Financial' },
  { value: 'operations', label: 'Operations' },
];

export function InitiativeReviewStep({ review, onUpdate }: InitiativeReviewStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<SupabaseInitiative[]>([]);
  const [swotActionable, setSwotActionable] = useState<SwotItem[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [newInitiative, setNewInitiative] = useState<NewInitiativeForm>({
    title: '',
    category: 'growth',
    description: '',
    targetQuarter: `Q${review.quarter < 4 ? review.quarter + 1 : 1} ${review.quarter < 4 ? review.year : review.year + 1}`,
  });

  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  const decisions = review.initiative_decisions || [];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const targetUserId = activeBusiness?.ownerId || user.id;

      // Fetch active strategic initiatives
      const { data: initiativesData, error: initError } = await supabase
        .from('strategic_initiatives')
        .select('id, title, description, category, status, progress_percentage')
        .eq('user_id', targetUserId)
        .in('status', ['active', 'in_progress', 'not_started'])
        .order('created_at', { ascending: false });

      if (!initError && initiativesData) {
        setInitiatives(initiativesData);

        // Auto-populate decisions for initiatives that don't have one yet
        if (decisions.length === 0 && initiativesData.length > 0) {
          const initialDecisions: InitiativeDecision[] = initiativesData.map((i) => ({
            initiativeId: i.id,
            title: i.title,
            category: i.category || 'growth',
            currentStatus: i.status || 'active',
            progressPercentage: i.progress_percentage || 0,
            decision: 'keep' as InitiativeAction,
            notes: '',
          }));
          onUpdate(initialDecisions);
        }
      }

      // Fetch actionable SWOT items
      if (review.swot_analysis_id) {
        const { data: swotData } = await supabase
          .from('swot_items')
          .select('id, type, description, tags')
          .eq('swot_analysis_id', review.swot_analysis_id)
          .eq('description', 'actionable');

        // Note: The spec says description = 'actionable', but more likely it's a tag.
        // Also try fetching items with an actionable tag
        const { data: swotTagData } = await supabase
          .from('swot_items')
          .select('id, type, description, tags')
          .eq('swot_analysis_id', review.swot_analysis_id);

        const actionableItems = [
          ...(swotData || []),
          ...(swotTagData || []).filter(
            (item) =>
              item.tags?.toLowerCase().includes('actionable') &&
              !swotData?.some((s) => s.id === item.id)
          ),
        ];
        setSwotActionable(actionableItems);
      }
    } catch (error) {
      console.error('Error fetching initiative data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getDecisionForInitiative = (initiativeId: string): InitiativeDecision | undefined => {
    return decisions.find((d) => d.initiativeId === initiativeId);
  };

  const updateDecision = (initiativeId: string, field: keyof InitiativeDecision, value: string | number) => {
    const existing = decisions.find((d) => d.initiativeId === initiativeId);
    if (existing) {
      onUpdate(
        decisions.map((d) =>
          d.initiativeId === initiativeId ? { ...d, [field]: value } : d
        )
      );
    } else {
      const initiative = initiatives.find((i) => i.id === initiativeId);
      if (initiative) {
        onUpdate([
          ...decisions,
          {
            initiativeId,
            title: initiative.title,
            category: initiative.category || 'growth',
            currentStatus: initiative.status || 'active',
            progressPercentage: initiative.progress_percentage || 0,
            decision: field === 'decision' ? (value as InitiativeAction) : 'keep',
            notes: field === 'notes' ? (value as string) : '',
          },
        ]);
      }
    }
  };

  const addNewInitiativeAsDecision = () => {
    if (!newInitiative.title.trim()) return;

    const newDecision: InitiativeDecision = {
      initiativeId: `new-${Date.now()}`,
      title: newInitiative.title.trim(),
      category: newInitiative.category,
      currentStatus: 'not_started',
      progressPercentage: 0,
      decision: 'keep',
      notes: newInitiative.description
        ? `${newInitiative.description} (Target: ${newInitiative.targetQuarter})`
        : `Target: ${newInitiative.targetQuarter}`,
    };

    onUpdate([...decisions, newDecision]);
    setNewInitiative({
      title: '',
      category: 'growth',
      description: '',
      targetQuarter: `Q${review.quarter < 4 ? review.quarter + 1 : 1} ${review.quarter < 4 ? review.year : review.year + 1}`,
    });
    setShowNewForm(false);
  };

  const removeDecision = (initiativeId: string) => {
    onUpdate(decisions.filter((d) => d.initiativeId !== initiativeId));
  };

  const addSuggestionAsInitiative = (title: string, source: string) => {
    const newDecision: InitiativeDecision = {
      initiativeId: `suggestion-${Date.now()}`,
      title,
      category: 'growth',
      currentStatus: 'not_started',
      progressPercentage: 0,
      decision: 'keep',
      notes: `Source: ${source}`,
    };
    onUpdate([...decisions, newDecision]);
  };

  // Gather suggestions from various review sections
  const feedbackStartItems = (() => {
    const items: string[] = [];
    if (review.feedback_loop) {
      const areas = ['marketing', 'sales', 'operations', 'finances', 'people', 'owner'] as const;
      for (const area of areas) {
        const areaData = review.feedback_loop[area];
        if (areaData?.start) {
          items.push(...areaData.start);
        }
      }
    }
    return items;
  })();

  const issueItems = (review.issues_resolved || []).map(
    (issue) => `${issue.issue} -> ${issue.solution}`
  );

  const hiringNeeds = (review.people_review?.hiringNeeds || []).map(
    (need) => `Hire: ${need.role} (${need.priority})`
  );

  const hasSuggestions =
    swotActionable.length > 0 ||
    feedbackStartItems.length > 0 ||
    issueItems.length > 0 ||
    hiringNeeds.length > 0;

  // Decision summary stats
  const stats = {
    keep: decisions.filter((d) => d.decision === 'keep').length,
    accelerate: decisions.filter((d) => d.decision === 'accelerate').length,
    defer: decisions.filter((d) => d.decision === 'defer').length,
    kill: decisions.filter((d) => d.decision === 'kill').length,
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="4.2"
          subtitle="Review and decide on strategic initiatives"
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
        step="4.2"
        subtitle="Review each initiative and decide: keep, accelerate, defer, or kill"
        estimatedTime={20}
        tip="Be ruthless - every initiative should earn its place"
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
          <div className="text-xl font-bold text-green-700">{stats.keep}</div>
          <div className="text-xs text-green-600">Keep</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
          <div className="text-xl font-bold text-blue-700">{stats.accelerate}</div>
          <div className="text-xs text-blue-600">Accelerate</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
          <div className="text-xl font-bold text-amber-700">{stats.defer}</div>
          <div className="text-xs text-amber-600">Defer</div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
          <div className="text-xl font-bold text-red-700">{stats.kill}</div>
          <div className="text-xs text-red-600">Kill</div>
        </div>
      </div>

      {/* Current Initiatives */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-brand-orange" />
          Active Strategic Initiatives
        </h3>

        {initiatives.length === 0 && decisions.filter((d) => !d.initiativeId.startsWith('new-') && !d.initiativeId.startsWith('suggestion-')).length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-200">
            <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">No active strategic initiatives found.</p>
            <p className="text-sm text-gray-500 mt-1">
              Add new ones below or check the suggestions section.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {initiatives.map((initiative) => {
              const decision = getDecisionForInitiative(initiative.id);
              return (
                <div
                  key={initiative.id}
                  className="bg-white rounded-xl border-2 border-gray-200 p-5 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{initiative.title}</h4>
                      {initiative.description && (
                        <p className="text-sm text-gray-600 mt-1">{initiative.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {initiative.category}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          {initiative.status?.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progress</span>
                      <span>{initiative.progress_percentage || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-brand-orange h-2 rounded-full transition-all"
                        style={{ width: `${initiative.progress_percentage || 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Decision Dropdown */}
                  <div className="flex flex-wrap gap-3 mb-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Decision</label>
                      <div className="flex gap-1">
                        {DECISION_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updateDecision(initiative.id, 'decision', opt.value)}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                              decision?.decision === opt.value
                                ? opt.color
                                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <textarea
                    value={decision?.notes || ''}
                    onChange={(e) => updateDecision(initiative.id, 'notes', e.target.value)}
                    placeholder="Notes on this decision..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                  />
                </div>
              );
            })}

            {/* Show any new/suggestion decisions that aren't from the DB */}
            {decisions
              .filter((d) => d.initiativeId.startsWith('new-') || d.initiativeId.startsWith('suggestion-'))
              .map((decision) => (
                <div
                  key={decision.initiativeId}
                  className="bg-brand-orange-50 rounded-xl border-2 border-brand-orange-200 p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{decision.title}</h4>
                        <span className="text-xs px-2 py-0.5 rounded bg-brand-orange-100 text-brand-orange-700">
                          New
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {decision.category}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeDecision(decision.initiativeId)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex gap-1 mb-3">
                    {DECISION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          onUpdate(
                            decisions.map((d) =>
                              d.initiativeId === decision.initiativeId
                                ? { ...d, decision: opt.value }
                                : d
                            )
                          );
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                          decision.decision === opt.value
                            ? opt.color
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={decision.notes}
                    onChange={(e) => {
                      onUpdate(
                        decisions.map((d) =>
                          d.initiativeId === decision.initiativeId
                            ? { ...d, notes: e.target.value }
                            : d
                        )
                      );
                    }}
                    placeholder="Notes..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                  />
                </div>
              ))}
          </div>
        )}
      </div>

      {/* New Initiative Candidates / Suggestions */}
      {hasSuggestions && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-6">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              New Initiative Candidates
            </h3>
            {showSuggestions ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            These suggestions come from your earlier workshop steps. Click to add as an initiative.
          </p>

          {showSuggestions && (
            <div className="space-y-4">
              {/* SWOT Actionable Items */}
              {swotActionable.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" />
                    SWOT Actionable Items
                  </h4>
                  <div className="space-y-1">
                    {swotActionable.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200"
                      >
                        <div>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 mr-2">
                            {item.type}
                          </span>
                          <span className="text-sm text-gray-700">{item.description}</span>
                        </div>
                        <button
                          onClick={() => addSuggestionAsInitiative(item.description, `SWOT ${item.type}`)}
                          className="text-brand-orange hover:text-brand-orange-600 text-sm font-medium whitespace-nowrap ml-2"
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback Loop "Start" Items */}
              {feedbackStartItems.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Feedback Loop - Start Items
                  </h4>
                  <div className="space-y-1">
                    {feedbackStartItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200"
                      >
                        <span className="text-sm text-gray-700">{item}</span>
                        <button
                          onClick={() => addSuggestionAsInitiative(item, 'Feedback Loop - Start')}
                          className="text-brand-orange hover:text-brand-orange-600 text-sm font-medium whitespace-nowrap ml-2"
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues Resolved */}
              {issueItems.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Issues / Solutions
                  </h4>
                  <div className="space-y-1">
                    {issueItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200"
                      >
                        <span className="text-sm text-gray-700">{item}</span>
                        <button
                          onClick={() => addSuggestionAsInitiative(item.split(' -> ')[0], 'Issues List')}
                          className="text-brand-orange hover:text-brand-orange-600 text-sm font-medium whitespace-nowrap ml-2"
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hiring Needs */}
              {hiringNeeds.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    People Review - Hiring Needs
                  </h4>
                  <div className="space-y-1">
                    {hiringNeeds.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200"
                      >
                        <span className="text-sm text-gray-700">{item}</span>
                        <button
                          onClick={() => addSuggestionAsInitiative(item, 'People Review')}
                          className="text-brand-orange hover:text-brand-orange-600 text-sm font-medium whitespace-nowrap ml-2"
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add New Initiative Form */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-brand-orange" />
            Add New Initiative
          </h3>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
          >
            {showNewForm ? 'Cancel' : 'New Initiative'}
          </button>
        </div>

        {showNewForm && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="space-y-3">
              <input
                type="text"
                value={newInitiative.title}
                onChange={(e) => setNewInitiative({ ...newInitiative, title: e.target.value })}
                placeholder="Initiative title..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newInitiative.category}
                  onChange={(e) => setNewInitiative({ ...newInitiative, category: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newInitiative.targetQuarter}
                  onChange={(e) => setNewInitiative({ ...newInitiative, targetQuarter: e.target.value })}
                  placeholder="Target quarter (e.g. Q2 2026)"
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                />
              </div>
              <textarea
                value={newInitiative.description}
                onChange={(e) => setNewInitiative({ ...newInitiative, description: e.target.value })}
                placeholder="Description (optional)..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
              />
              <button
                onClick={addNewInitiativeAsDecision}
                disabled={!newInitiative.title.trim()}
                className="w-full py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Add Initiative
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
