'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview } from '../../types';
import {
  Shield, AlertTriangle, Target, Lightbulb,
  Loader2, Plus, CheckCircle, Eye, ArrowRight, GitCompare, RefreshCw
} from 'lucide-react';

interface SwotUpdateStepProps {
  review: QuarterlyReview;
  onUpdate: (swotId: string | null) => void;
}

interface SwotItem {
  id: string;
  category: 'strength' | 'weakness' | 'opportunity' | 'threat';
  title: string;
  description?: string;
  status?: string;
}

interface SwotAnalysis {
  id: string;
  quarter: number;
  year: number;
  created_at: string;
  updated_at: string;
  swot_items?: SwotItem[];
}

interface LocalSwotItems {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

interface OrganizedSwot {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

// Match exact styling from SwotGrid
const CATEGORY_CONFIG = {
  strength: {
    key: 'strengths' as const,
    title: 'Strengths',
    description: 'Internal positive factors that give you an advantage',
    icon: Shield,
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    placeholder: 'e.g., Strong brand reputation, skilled team...'
  },
  weakness: {
    key: 'weaknesses' as const,
    title: 'Weaknesses',
    description: 'Internal negative factors that need improvement',
    icon: AlertTriangle,
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    placeholder: 'e.g., Limited cash flow, outdated systems...'
  },
  opportunity: {
    key: 'opportunities' as const,
    title: 'Opportunities',
    description: 'External positive factors you can capitalize on',
    icon: Target,
    color: 'text-brand-orange-700',
    bgColor: 'bg-brand-orange-50',
    borderColor: 'border-brand-orange-200',
    placeholder: 'e.g., New market segment, partnership...'
  },
  threat: {
    key: 'threats' as const,
    title: 'Threats',
    description: 'External negative factors that could cause problems',
    icon: Lightbulb,
    color: 'text-brand-orange-700',
    bgColor: 'bg-brand-orange-50',
    borderColor: 'border-brand-orange-200',
    placeholder: 'e.g., New competitor, economic downturn...'
  }
};

type CategoryKey = keyof typeof CATEGORY_CONFIG;
const CATEGORIES: CategoryKey[] = ['strength', 'weakness', 'opportunity', 'threat'];

function getPreviousQuarter(quarter: number, year: number): { quarter: number; year: number } {
  if (quarter === 1) {
    return { quarter: 4, year: year - 1 };
  }
  return { quarter: quarter - 1, year };
}

export function SwotUpdateStep({ review, onUpdate }: SwotUpdateStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentSwot, setCurrentSwot] = useState<SwotAnalysis | null>(null);
  const [previousSwot, setPreviousSwot] = useState<SwotAnalysis | null>(null);
  const [previousItems, setPreviousItems] = useState<OrganizedSwot>({
    strengths: [], weaknesses: [], opportunities: [], threats: []
  });

  // Local state for building fresh SWOT
  const [localItems, setLocalItems] = useState<LocalSwotItems>({
    strengths: [], weaknesses: [], opportunities: [], threats: []
  });
  const [showAddForm, setShowAddForm] = useState<CategoryKey | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');

  // View states
  const [showComparison, setShowComparison] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);

  const supabase = createClient();
  const prevQuarter = getPreviousQuarter(review.quarter, review.year);

  useEffect(() => {
    fetchSwotData();
  }, [review.quarter, review.year]);

  const organizeSwotItems = (items: SwotItem[]): OrganizedSwot => {
    const organized: OrganizedSwot = {
      strengths: [], weaknesses: [], opportunities: [], threats: []
    };

    items.filter(item => !item.status || item.status === 'active' || item.status === 'carried-forward')
      .forEach(item => {
        const config = CATEGORY_CONFIG[item.category];
        if (config) {
          organized[config.key].push(item);
        }
      });

    return organized;
  };

  const fetchSwotData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Fetch current quarter's SWOT (if exists)
      const { data: currentData } = await supabase
        .from('swot_analyses')
        .select(`*, swot_items (id, category, title, description, status)`)
        .eq('business_id', user.id)
        .eq('quarter', review.quarter)
        .eq('year', review.year)
        .eq('type', 'quarterly')
        .maybeSingle();

      // Fetch previous quarter's SWOT (for comparison)
      const { data: previousData } = await supabase
        .from('swot_analyses')
        .select(`*, swot_items (id, category, title, description, status)`)
        .eq('business_id', user.id)
        .eq('quarter', prevQuarter.quarter)
        .eq('year', prevQuarter.year)
        .eq('type', 'quarterly')
        .maybeSingle();

      if (currentData) {
        setCurrentSwot(currentData);
        onUpdate(currentData.id);
      }

      if (previousData) {
        setPreviousSwot(previousData);
        setPreviousItems(organizeSwotItems(previousData.swot_items || []));
      }
    } catch (error) {
      console.log('Error fetching SWOT data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddItem = (category: CategoryKey) => {
    if (!newItemTitle.trim()) return;
    const config = CATEGORY_CONFIG[category];

    setLocalItems(prev => ({
      ...prev,
      [config.key]: [...prev[config.key], newItemTitle.trim()]
    }));
    setNewItemTitle('');
    setShowAddForm(null);
  };

  const handleRemoveItem = (category: CategoryKey, index: number) => {
    const config = CATEGORY_CONFIG[category];
    setLocalItems(prev => ({
      ...prev,
      [config.key]: prev[config.key].filter((_, i) => i !== index)
    }));
  };

  const getTotalItems = () => {
    return localItems.strengths.length + localItems.weaknesses.length +
           localItems.opportunities.length + localItems.threats.length;
  };

  const handleStartFresh = async () => {
    // If there's an existing SWOT, archive it first
    if (currentSwot) {
      try {
        await supabase
          .from('swot_analyses')
          .update({ status: 'archived' })
          .eq('id', currentSwot.id);
      } catch (error) {
        console.error('Error archiving old SWOT:', error);
      }
    }

    // Reset state for fresh start
    setCurrentSwot(null);
    setLocalItems({ strengths: [], weaknesses: [], opportunities: [], threats: [] });
    setIsRedoing(true);
    setShowComparison(false);
  };

  const handleSaveSwot = async () => {
    if (getTotalItems() === 0) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create new SWOT analysis using RPC
      const { data: swotId, error: createError } = await supabase
        .rpc('create_quarterly_swot', {
          p_user_id: user.id,
          p_quarter: review.quarter,
          p_year: review.year,
        });

      if (createError) throw createError;

      // Insert all items
      const allItems: Array<{
        swot_analysis_id: string;
        category: string;
        title: string;
        impact_level: number;
        priority_order: number;
        status: string;
        created_by: string;
      }> = [];

      CATEGORIES.forEach(category => {
        const config = CATEGORY_CONFIG[category];
        localItems[config.key].forEach((title, index) => {
          allItems.push({
            swot_analysis_id: swotId,
            category,
            title,
            impact_level: 3,
            priority_order: index,
            status: 'active',
            created_by: user.id
          });
        });
      });

      if (allItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('swot_items')
          .insert(allItems);

        if (itemsError) throw itemsError;
      }

      // Fetch the created SWOT
      const { data: newSwot } = await supabase
        .from('swot_analyses')
        .select(`*, swot_items (id, category, title, description, status)`)
        .eq('id', swotId)
        .single();

      if (newSwot) {
        setCurrentSwot(newSwot);
        onUpdate(newSwot.id);
      }
    } catch (error) {
      console.error('Error saving SWOT:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentItems = (): OrganizedSwot => {
    if (currentSwot?.swot_items) {
      return organizeSwotItems(currentSwot.swot_items);
    }
    return {
      strengths: localItems.strengths.map((title, i) => ({ id: `local-s-${i}`, category: 'strength' as const, title })),
      weaknesses: localItems.weaknesses.map((title, i) => ({ id: `local-w-${i}`, category: 'weakness' as const, title })),
      opportunities: localItems.opportunities.map((title, i) => ({ id: `local-o-${i}`, category: 'opportunity' as const, title })),
      threats: localItems.threats.map((title, i) => ({ id: `local-t-${i}`, category: 'threat' as const, title }))
    };
  };

  const getInsights = () => {
    const current = getCurrentItems();
    const insights: string[] = [];

    // Items in previous but not in current (potential blind spots)
    const previousConcerns = [
      ...previousItems.weaknesses.map(i => i.title.toLowerCase()),
      ...previousItems.threats.map(i => i.title.toLowerCase())
    ];
    const currentConcerns = [
      ...current.weaknesses.map(i => i.title.toLowerCase()),
      ...current.threats.map(i => i.title.toLowerCase())
    ];

    const missingConcerns = previousConcerns.filter(t =>
      !currentConcerns.some(c => c.includes(t) || t.includes(c))
    );
    if (missingConcerns.length > 0) {
      insights.push(`You didn't mention ${missingConcerns.length} weakness/threat(s) from last quarter. Have these been resolved, or dropped off your radar?`);
    }

    // New strengths
    const newStrengths = current.strengths.filter(s =>
      !previousItems.strengths.some(p =>
        p.title.toLowerCase().includes(s.title.toLowerCase()) ||
        s.title.toLowerCase().includes(p.title.toLowerCase())
      )
    );
    if (newStrengths.length > 0) {
      insights.push(`You identified ${newStrengths.length} new strength(s) this quarter - great progress!`);
    }

    // New weaknesses
    const newWeaknesses = current.weaknesses.filter(w =>
      !previousItems.weaknesses.some(p =>
        p.title.toLowerCase().includes(w.title.toLowerCase()) ||
        w.title.toLowerCase().includes(p.title.toLowerCase())
      )
    );
    if (newWeaknesses.length > 0) {
      insights.push(`${newWeaknesses.length} new weakness(es) emerged - awareness is the first step to addressing them.`);
    }

    // Overall trend
    const strengthDiff = current.strengths.length - previousItems.strengths.length;
    const weaknessDiff = current.weaknesses.length - previousItems.weaknesses.length;

    if (strengthDiff > 0 && weaknessDiff < 0) {
      insights.push("Strong quarter! More strengths, fewer weaknesses - you're building momentum.");
    } else if (strengthDiff < 0 && weaknessDiff > 0) {
      insights.push("Challenging quarter ahead. Focus on converting weaknesses to strengths.");
    }

    return insights;
  };

  // Render a category card (matching SwotGrid style)
  const renderCategoryCard = (category: CategoryKey, items: SwotItem[], isEditable: boolean = false) => {
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    const isAddingItem = showAddForm === category;
    const localCategoryItems = localItems[config.key];

    return (
      <div
        className={`bg-white rounded-lg shadow-sm border-2 ${config.borderColor} p-6`}
      >
        {/* Header - matches SwotGrid exactly */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className={`text-2xl font-semibold ${config.color}`}>
                {config.title}
              </h3>
              <p className="text-base text-gray-600 mt-0.5">
                {config.description}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`text-sm font-medium ${config.color}`}>
              {isEditable ? localCategoryItems.length : items.length} items
            </span>
            {isEditable && (
              <button
                onClick={() => setShowAddForm(isAddingItem ? null : category)}
                className={`p-1.5 rounded-md transition-colors ${
                  isAddingItem
                    ? 'bg-gray-200 text-gray-600'
                    : `${config.bgColor} ${config.color} hover:opacity-80`
                }`}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Add Item Form - matches SwotGrid */}
        {isEditable && isAddingItem && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <input
              type="text"
              placeholder={config.placeholder}
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem(category)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange mb-2"
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowAddForm(null);
                  setNewItemTitle('');
                }}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddItem(category)}
                disabled={!newItemTitle.trim()}
                className={`px-3 py-1 text-sm text-white rounded-md ${
                  newItemTitle.trim()
                    ? 'bg-brand-orange hover:bg-brand-orange-600'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                Add Item
              </button>
            </div>
          </div>
        )}

        {/* Items List - matches SwotGrid */}
        <div className="space-y-2 min-h-[100px]">
          {isEditable ? (
            localCategoryItems.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-base">No {config.title.toLowerCase()} identified</p>
                <p className="text-sm mt-1">Click + to add your first item</p>
              </div>
            ) : (
              localCategoryItems.map((title, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${config.borderColor} ${config.bgColor} group`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-gray-800 font-medium">{title}</span>
                    <button
                      onClick={() => handleRemoveItem(category, index)}
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )
          ) : (
            items.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-base">No {config.title.toLowerCase()} identified</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border ${config.borderColor} ${config.bgColor}`}
                >
                  <span className="text-sm text-gray-800 font-medium">{item.title}</span>
                </div>
              ))
            )
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="3.2"
          subtitle="Create your SWOT analysis"
          estimatedTime={20}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  // VIEW 3: Comparison View
  if (showComparison && currentSwot && previousSwot) {
    const currentItems = getCurrentItems();
    const insights = getInsights();

    return (
      <div>
        <StepHeader
          step="3.2"
          subtitle="SWOT comparison"
          estimatedTime={15}
        />

        {/* Insights */}
        {insights.length > 0 && (
          <div className="bg-amber-50 rounded-lg p-5 mb-6 border-2 border-amber-200">
            <div className="flex items-start gap-3">
              <Eye className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 mb-2">Key Insights</h3>
                <ul className="space-y-2">
                  {insights.map((insight, i) => (
                    <li key={i} className="text-sm text-amber-800">• {insight}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Side by Side Comparison */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Current Quarter */}
          <div>
            <div className="text-sm font-semibold text-brand-orange-700 mb-3 bg-brand-orange-50 px-4 py-2 rounded-lg border border-brand-orange-200">
              Q{review.quarter} {review.year} — Just Completed
            </div>
            <div className="space-y-4">
              {CATEGORIES.map(category => {
                const config = CATEGORY_CONFIG[category];
                const Icon = config.icon;
                const items = currentItems[config.key];
                return (
                  <div key={category} className={`rounded-lg border-2 ${config.borderColor} ${config.bgColor} p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded ${config.bgColor}`}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <span className={`font-semibold ${config.color}`}>{config.title}</span>
                      <span className="ml-auto text-sm text-gray-500">{items.length}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map(item => (
                        <div key={item.id} className="text-sm text-gray-700 bg-white/60 rounded px-2 py-1">
                          {item.title}
                        </div>
                      ))}
                      {items.length === 0 && (
                        <p className="text-sm text-gray-400 italic">No items</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Previous Quarter */}
          <div>
            <div className="text-sm font-semibold text-gray-500 mb-3 bg-gray-100 px-4 py-2 rounded-lg border border-gray-200">
              Q{prevQuarter.quarter} {prevQuarter.year} — Previous Quarter
            </div>
            <div className="space-y-4 opacity-75">
              {CATEGORIES.map(category => {
                const config = CATEGORY_CONFIG[category];
                const Icon = config.icon;
                const items = previousItems[config.key];
                return (
                  <div key={category} className="rounded-lg border-2 border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded bg-gray-100">
                        <Icon className="h-4 w-4 text-gray-400" />
                      </div>
                      <span className="font-semibold text-gray-500">{config.title}</span>
                      <span className="ml-auto text-sm text-gray-400">{items.length}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map(item => (
                        <div key={item.id} className="text-sm text-gray-600 bg-white/60 rounded px-2 py-1">
                          {item.title}
                        </div>
                      ))}
                      {items.length === 0 && (
                        <p className="text-sm text-gray-400 italic">No items</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // VIEW 2: Completed SWOT (with Compare button)
  if (currentSwot) {
    const currentItems = getCurrentItems();
    const totalItems = currentItems.strengths.length + currentItems.weaknesses.length +
                       currentItems.opportunities.length + currentItems.threats.length;

    return (
      <div>
        <StepHeader
          step="3.2"
          subtitle="Your SWOT analysis is complete"
          estimatedTime={15}
        />

        {/* Success Header */}
        <div className="bg-green-50 rounded-lg p-4 mb-6 border-2 border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Q{review.quarter} {review.year} SWOT Complete</p>
                <p className="text-sm text-green-700">{totalItems} items captured</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleStartFresh}
                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg font-medium hover:bg-white/50 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Start Fresh
              </button>
              {previousSwot && (
                <button
                  onClick={() => setShowComparison(true)}
                  className="inline-flex items-center gap-2 bg-brand-orange text-white px-5 py-2.5 rounded-lg font-medium hover:bg-brand-orange-600 transition-colors"
                >
                  <GitCompare className="w-5 h-5" />
                  Compare with Last Quarter
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Current SWOT Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {CATEGORIES.map(category =>
            renderCategoryCard(category, currentItems[CATEGORY_CONFIG[category].key], false)
          )}
        </div>
      </div>
    );
  }

  // VIEW 1: Fresh SWOT Builder
  return (
    <div>
      <StepHeader
        step="3.2"
        subtitle="Create a fresh SWOT analysis for this quarter"
        estimatedTime={20}
        tip="Start with a blank slate - be honest about where you are today"
      />

      {/* Instructions */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-slate-200">
        <p className="text-gray-700">
          <strong>Think fresh.</strong> Don't try to remember last quarter's SWOT.
          What are your strengths, weaknesses, opportunities, and threats <em>right now</em>?
        </p>
      </div>

      {/* SWOT Builder Grid - matches SwotGrid layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
        {CATEGORIES.map(category =>
          renderCategoryCard(category, [], true)
        )}
      </div>

      {/* Progress & Submit */}
      <div className="flex items-center justify-between bg-white rounded-lg p-4 border-2 border-gray-200">
        <div>
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{getTotalItems()}</span> items added
          </p>
          <p className="text-xs text-gray-500">
            Aim for at least 2-3 items per quadrant
          </p>
        </div>
        <button
          onClick={handleSaveSwot}
          disabled={getTotalItems() === 0 || isSaving}
          className="inline-flex items-center gap-2 bg-brand-orange text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Complete SWOT
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
