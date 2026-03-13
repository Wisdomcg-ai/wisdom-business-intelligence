'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, RockReviewItem, RockReviewDecision, Rock } from '../../types';
import {
  Mountain, ChevronDown, ChevronUp, CheckCircle2, ArrowRightCircle,
  Trash2, PenLine, Loader2, AlertCircle, Target, User
} from 'lucide-react';

interface RocksReviewStepProps {
  review: QuarterlyReview;
  onUpdate: (rocks: RockReviewItem[]) => void;
}

const DECISION_OPTIONS: { value: RockReviewDecision; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-green-600' },
  { value: 'carry_forward', label: 'Carry Forward', icon: ArrowRightCircle, color: 'text-blue-600' },
  { value: 'drop', label: 'Drop', icon: Trash2, color: 'text-red-500' },
  { value: 'modify', label: 'Modify & Continue', icon: PenLine, color: 'text-amber-500' },
];

export function RocksReviewStep({ review, onUpdate }: RocksReviewStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRock, setExpandedRock] = useState<string | null>(null);
  const [previousRocks, setPreviousRocks] = useState<Rock[]>([]);

  const rocksReview = review.rocks_review || [];

  // Fetch rocks: prioritize live Goals Wizard data, fall back to previous review
  useEffect(() => {
    fetchRocks();
  }, []);

  const fetchRocks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const targetUserId = activeBusiness?.ownerId || user.id;

      // Look up business_profiles.id (Goals Wizard uses this, not businesses.id)
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const profileId = profile?.id;
      console.log('[RocksReview] business_profiles.id:', profileId, 'for user:', targetUserId);

      if (profileId) {
        // Rocks Review is backward-looking: reviewing what was planned for the PREVIOUS quarter.
        // For a Q1 review, the previous planning quarter is Q4.
        const prevQuarterNum = review.quarter === 1 ? 4 : review.quarter - 1;
        const prevQuarterKey = `q${prevQuarterNum}`;
        const currentQuarterKey = `q${review.quarter}`;

        // Source 1 (Primary): Quarterly initiatives from the Goals Wizard
        // Check previous quarter first (backward-looking), then current quarter as fallback
        for (const quarterKey of [prevQuarterKey, currentQuarterKey]) {
          const { data: quarterInitiatives } = await supabase
            .from('strategic_initiatives')
            .select('*')
            .eq('business_id', profileId)
            .eq('step_type', quarterKey)
            .order('created_at', { ascending: true });

          console.log('[RocksReview] Quarterly initiatives (step_type:', quarterKey, '):', quarterInitiatives?.length || 0);

          if (quarterInitiatives && quarterInitiatives.length > 0) {
            const rocks: Rock[] = quarterInitiatives.map((init, idx) => ({
              id: init.id,
              title: init.title || 'Untitled Initiative',
              owner: init.assigned_to || '',
              successCriteria: init.outcome || '',
              doneDefinition: init.outcome || '',
              progressPercentage: 0,
              status: 'on_track' as const,
              description: init.description || '',
              priority: idx + 1
            }));
            console.log('[RocksReview] Loaded quarterly initiatives as rocks:', rocks.map(r => r.title));
            setPreviousRocks(rocks);
            initializeFromRocks(rocks);
            return;
          }
        }

        // Source 2 (Fallback): If no quarterly initiatives found, check ALL quarterly initiatives
        const { data: allInitiatives } = await supabase
          .from('strategic_initiatives')
          .select('*')
          .eq('business_id', profileId)
          .in('step_type', ['q1', 'q2', 'q3', 'q4'])
          .order('created_at', { ascending: false });

        console.log('[RocksReview] All quarterly initiatives:', allInitiatives?.length || 0);

        if (allInitiatives && allInitiatives.length > 0) {
          // Group by step_type, pick the most recent quarter that has data
          const byQuarter = new Map<string, typeof allInitiatives>();
          for (const init of allInitiatives) {
            const key = init.step_type;
            if (!byQuarter.has(key)) byQuarter.set(key, []);
            byQuarter.get(key)!.push(init);
          }
          // Prefer quarters in order: previous, current, then most recent
          const preferredOrder = [prevQuarterKey, currentQuarterKey, 'q4', 'q3', 'q2', 'q1'];
          for (const qKey of preferredOrder) {
            const items = byQuarter.get(qKey);
            if (items && items.length > 0) {
              const rocks: Rock[] = items.map((init, idx) => ({
                id: init.id,
                title: init.title || 'Untitled Initiative',
                owner: init.assigned_to || '',
                successCriteria: init.outcome || '',
                doneDefinition: init.outcome || '',
                progressPercentage: 0,
                status: 'on_track' as const,
                description: init.description || '',
                priority: idx + 1
              }));
              console.log('[RocksReview] Loaded from all initiatives (quarter:', qKey, '):', rocks.map(r => r.title));
              setPreviousRocks(rocks);
              initializeFromRocks(rocks);
              return;
            }
          }
        }
      }

      // Source 3: Previous quarterly review's rocks (last resort fallback)
      const prevQuarter = review.quarter === 1 ? 4 : review.quarter - 1;
      const prevYear = review.quarter === 1 ? review.year - 1 : review.year;

      const { data: prevReview } = await supabase
        .from('quarterly_reviews')
        .select('quarterly_rocks')
        .eq('business_id', review.business_id)
        .eq('quarter', prevQuarter)
        .eq('year', prevYear)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevReview?.quarterly_rocks && (prevReview.quarterly_rocks as Rock[]).length > 0) {
        const rocks = prevReview.quarterly_rocks as Rock[];
        console.log('[RocksReview] Loaded from previous quarterly review:', rocks.length, 'rocks');
        setPreviousRocks(rocks);
        initializeFromRocks(rocks);
        return;
      }

      console.log('[RocksReview] No rocks found from any source');
    } catch (err) {
      console.error('[RocksReview] Error fetching rocks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeFromRocks = (rocks: Rock[]) => {
    if (rocks.length === 0) return;

    // Check if existing review data matches loaded rocks (by IDs)
    const existingIds = new Set(rocksReview.map(r => r.rockId));
    const loadedIds = new Set(rocks.map(r => r.id));
    const idsMatch = existingIds.size === loadedIds.size &&
      [...existingIds].every(id => loadedIds.has(id));

    if (rocksReview.length === 0 || !idsMatch) {
      // Initialize fresh or re-sync if source data changed
      const initialReviewItems: RockReviewItem[] = rocks.map(rock => {
        // Preserve any existing review data for this rock
        const existing = rocksReview.find(r => r.rockId === rock.id);
        return existing || {
          rockId: rock.id,
          title: rock.title,
          owner: rock.owner,
          successCriteria: rock.successCriteria || rock.doneDefinition || '',
          progressPercentage: rock.progressPercentage || 0,
          decision: rock.status === 'completed' ? 'completed' : 'carry_forward',
          outcomeNarrative: '',
          lessonsLearned: ''
        };
      });
      console.log('[RocksReview] Initializing review items:', initialReviewItems.length, '(existing had:', rocksReview.length, ')');
      onUpdate(initialReviewItems);
    }
  };

  const updateRockReview = (rockId: string, field: keyof RockReviewItem, value: any) => {
    const updated = rocksReview.map(item =>
      item.rockId === rockId ? { ...item, [field]: value } : item
    );
    onUpdate(updated);
  };

  const toggleExpand = (rockId: string) => {
    setExpandedRock(expandedRock === rockId ? null : rockId);
  };

  // Summary counts
  const completedCount = rocksReview.filter(r => r.decision === 'completed').length;
  const carryForwardCount = rocksReview.filter(r => r.decision === 'carry_forward').length;
  const droppedCount = rocksReview.filter(r => r.decision === 'drop').length;
  const modifiedCount = rocksReview.filter(r => r.decision === 'modify').length;
  const totalCount = rocksReview.length;

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'bg-green-500';
    if (pct >= 75) return 'bg-blue-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-red-400';
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="1.3"
          subtitle="Review your rocks from last quarter"
          estimatedTime={15}
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
        step="1.3"
        subtitle="Account for each rock from last quarter - what happened and what did you learn?"
        estimatedTime={15}
        tip="Honest accountability drives real growth"
      />

      {/* Summary Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Rock Accountability Summary</h3>
          <span className="text-sm text-gray-500">
            {completedCount} of {totalCount} completed
          </span>
        </div>

        {totalCount > 0 && (
          <>
            {/* Progress bar */}
            <div className="w-full h-3 bg-gray-100 rounded-full mb-4 overflow-hidden flex">
              {completedCount > 0 && (
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              )}
              {carryForwardCount > 0 && (
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(carryForwardCount / totalCount) * 100}%` }}
                />
              )}
              {modifiedCount > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${(modifiedCount / totalCount) * 100}%` }}
                />
              )}
              {droppedCount > 0 && (
                <div
                  className="h-full bg-red-400 transition-all"
                  style={{ width: `${(droppedCount / totalCount) * 100}%` }}
                />
              )}
            </div>

            {/* Status Counts */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-green-50 rounded-lg p-2">
                <div className="text-lg font-bold text-green-600">{completedCount}</div>
                <div className="text-xs text-gray-600">Completed</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <div className="text-lg font-bold text-blue-600">{carryForwardCount}</div>
                <div className="text-xs text-gray-600">Carry Forward</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <div className="text-lg font-bold text-amber-500">{modifiedCount}</div>
                <div className="text-xs text-gray-600">Modified</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <div className="text-lg font-bold text-red-500">{droppedCount}</div>
                <div className="text-xs text-gray-600">Dropped</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* No Rocks State */}
      {rocksReview.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center border border-dashed border-gray-300">
          <Mountain className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 mb-2">No Previous Rocks Found</h3>
          <p className="text-gray-500 text-sm">
            No rocks were found from the previous quarter&apos;s review. This may be your first quarterly review.
          </p>
        </div>
      )}

      {/* Rock Cards */}
      <div className="space-y-4">
        {rocksReview.map((item, index) => {
          const isExpanded = expandedRock === item.rockId;
          const decisionOption = DECISION_OPTIONS.find(d => d.value === item.decision);

          return (
            <div
              key={item.rockId}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-all"
            >
              {/* Card Header - Always Visible */}
              <button
                onClick={() => toggleExpand(item.rockId)}
                className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
              >
                {/* Priority Number */}
                <div className="w-8 h-8 rounded-full bg-brand-orange flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {index + 1}
                </div>

                {/* Title & Owner */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 truncate">
                    {item.title || 'Untitled Rock'}
                  </h4>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    {item.owner && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {item.owner}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-20">
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getProgressColor(item.progressPercentage)}`}
                        style={{ width: `${Math.min(item.progressPercentage, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{item.progressPercentage}%</span>
                  </div>

                  {/* Decision Badge */}
                  {decisionOption && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      item.decision === 'completed' ? 'bg-green-100 text-green-700' :
                      item.decision === 'carry_forward' ? 'bg-blue-100 text-blue-700' :
                      item.decision === 'drop' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {decisionOption.label}
                    </span>
                  )}

                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-gray-100">
                  {/* Success Criteria */}
                  {item.successCriteria && (
                    <div className="mt-4 mb-4 bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                        <Target className="w-3.5 h-3.5" />
                        Success Criteria
                      </div>
                      <p className="text-sm text-gray-700">{item.successCriteria}</p>
                    </div>
                  )}

                  {/* Progress Slider */}
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Progress: {item.progressPercentage}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={item.progressPercentage}
                      onChange={(e) => updateRockReview(item.rockId, 'progressPercentage', parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0%</span>
                      <span>25%</span>
                      <span>50%</span>
                      <span>75%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Decision */}
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Decision for this Rock
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {DECISION_OPTIONS.map(option => {
                        const Icon = option.icon;
                        const isSelected = item.decision === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => updateRockReview(item.rockId, 'decision', option.value)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                              isSelected
                                ? 'border-brand-orange bg-brand-orange-50 text-brand-orange-700 ring-2 ring-brand-orange ring-opacity-30'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-brand-orange' : option.color}`} />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Outcome Narrative */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Outcome Narrative
                    </label>
                    <textarea
                      value={item.outcomeNarrative}
                      onChange={(e) => updateRockReview(item.rockId, 'outcomeNarrative', e.target.value)}
                      placeholder="What actually happened with this rock? Describe the outcome..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Lessons Learned */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lessons Learned
                    </label>
                    <textarea
                      value={item.lessonsLearned}
                      onChange={(e) => updateRockReview(item.rockId, 'lessonsLearned', e.target.value)}
                      placeholder="What did you learn? What would you do differently?"
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Carry-Forward List */}
      {carryForwardCount > 0 && (
        <div className="mt-6 bg-blue-50 rounded-xl border border-blue-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-gray-900">Carrying Forward to Next Quarter</h4>
          </div>
          <ul className="space-y-2">
            {rocksReview
              .filter(r => r.decision === 'carry_forward' || r.decision === 'modify')
              .map(item => (
                <li key={item.rockId} className="flex items-center gap-2 text-sm text-gray-700">
                  <ArrowRightCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="font-medium">{item.title}</span>
                  {item.decision === 'modify' && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Modified</span>
                  )}
                  {item.owner && (
                    <span className="text-gray-400 ml-auto">({item.owner})</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
