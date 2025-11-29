'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  SwotAnalysis,
  SwotItem,
  SwotGridData,
  SwotCategory,
  QuarterInfo,
  YearType,
  getCurrentQuarter,
  getCategoryColor
} from '@/lib/swot/types';
import { SwotGrid } from '@/components/swot/SwotGrid';
import { QuarterSelector } from '@/components/swot/QuarterSelector';
import { createBrowserClient } from '@supabase/ssr';
import { CheckCircle, AlertCircle, Download, History, TrendingUp } from 'lucide-react';
import { useBusinessContext } from '@/hooks/useBusinessContext';

export default function SwotPage() {
  const router = useRouter();
  const { activeBusiness, viewerContext } = useBusinessContext();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // State management
  const [yearType, setYearType] = useState<YearType>('FY');
  const [yearTypeLoaded, setYearTypeLoaded] = useState(false);
  const [currentQuarter, setCurrentQuarter] = useState<QuarterInfo>(getCurrentQuarter('FY'));
  const [swotAnalysis, setSwotAnalysis] = useState<SwotAnalysis | null>(null);
  const [swotItems, setSwotItems] = useState<SwotGridData>({
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: []
  });
  const [historicalItems, setHistoricalItems] = useState<SwotItem[]>([]);
  const [recurringItems, setRecurringItems] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaveEnabled] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showTrends, setShowTrends] = useState(false);

  // Get or create SWOT analysis for the selected quarter
  const loadSwotAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('Please log in to access SWOT analysis');
        return;
      }

      // Use active business from context when viewing as coach
      // Otherwise use user.id (SWOT stores with user.id as business_id)
      const businessId = viewerContext.isViewingAsCoach && activeBusiness?.ownerId
        ? activeBusiness.ownerId
        : user.id;

      // Check if SWOT exists for this quarter
      const { data: existingSwot, error: fetchError } = await supabase
        .from('swot_analyses')
        .select(`
          *,
          swot_items (
            id,
            category,
            title,
            description,
            impact_level,
            likelihood,
            priority_order,
            status,
            tags,
            created_at,
            updated_at
          )
        `)
        .eq('business_id', businessId)
        .eq('quarter', currentQuarter.quarter)
        .eq('year', currentQuarter.year)
        .eq('type', 'quarterly')
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 means no rows returned, which is fine
        throw fetchError;
      }

      if (existingSwot) {
        setSwotAnalysis(existingSwot);
        organizeSwotItems(existingSwot.swot_items || []);
      } else {
        // Create new SWOT analysis
        const { data: newSwot, error: createError } = await supabase
          .rpc('create_quarterly_swot', {
            p_business_id: businessId,
            p_quarter: currentQuarter.quarter,
            p_year: currentQuarter.year,
            p_created_by: user.id
          });

        if (createError) throw createError;

        // Fetch the newly created SWOT with its items
        const { data: createdSwot, error: refetchError } = await supabase
          .from('swot_analyses')
          .select(`
            *,
            swot_items (
              id,
              category,
              title,
              description,
              impact_level,
              likelihood,
              priority_order,
              status,
              tags,
              created_at,
              updated_at
            )
          `)
          .eq('id', newSwot)
          .single();

        if (refetchError) throw refetchError;

        setSwotAnalysis(createdSwot);
        organizeSwotItems(createdSwot.swot_items || []);
      }
    } catch (err: any) {
      console.error('Error loading SWOT analysis:', err);
      setError(`Failed to load SWOT analysis: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [currentQuarter, supabase, activeBusiness?.ownerId, viewerContext.isViewingAsCoach]);

  // Organize items into grid categories
  const organizeSwotItems = (items: SwotItem[]) => {
    const organized: SwotGridData = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: []
    };

    items.forEach(item => {
      if (item.status === 'active' || item.status === 'carried-forward') {
        switch (item.category) {
          case 'strength':
            organized.strengths.push(item);
            break;
          case 'weakness':
            organized.weaknesses.push(item);
            break;
          case 'opportunity':
            organized.opportunities.push(item);
            break;
          case 'threat':
            organized.threats.push(item);
            break;
        }
      }
    });

    // Sort by priority order
    Object.keys(organized).forEach(key => {
      organized[key as keyof SwotGridData].sort((a, b) => a.priority_order - b.priority_order);
    });

    setSwotItems(organized);
  };

  // Load historical SWOT items from previous quarters
  const loadHistoricalData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use active business from context when viewing as coach
      const businessId = viewerContext.isViewingAsCoach && activeBusiness?.ownerId
        ? activeBusiness.ownerId
        : user.id;

      // Get previous 4 quarters' SWOT analyses
      const { data: historicalAnalyses, error } = await supabase
        .from('swot_analyses')
        .select(`
          id,
          quarter,
          year,
          swot_items (
            id,
            category,
            title,
            description,
            impact_level,
            likelihood,
            created_at
          )
        `)
        .eq('business_id', businessId)
        .eq('type', 'quarterly')
        .neq('quarter', currentQuarter.quarter)
        .or(`year.lt.${currentQuarter.year},and(year.eq.${currentQuarter.year},quarter.lt.${currentQuarter.quarter})`)
        .order('year', { ascending: false })
        .order('quarter', { ascending: false })
        .limit(4);

      if (error) {
        console.error('Error loading historical data:', error);
        return;
      }

      // Flatten all historical items
      const allHistoricalItems: SwotItem[] = [];
      historicalAnalyses?.forEach(analysis => {
        if (analysis.swot_items) {
          allHistoricalItems.push(...(analysis.swot_items as SwotItem[]));
        }
      });

      setHistoricalItems(allHistoricalItems);
      detectRecurringItems(swotItems, allHistoricalItems);
    } catch (err) {
      console.error('Error loading historical data:', err);
    }
  }, [currentQuarter, supabase, swotItems, activeBusiness?.ownerId, viewerContext.isViewingAsCoach]);

  // Detect recurring items by comparing titles (simple string matching for MVP)
  const detectRecurringItems = (currentItems: SwotGridData, historicalItems: SwotItem[]) => {
    const recurring = new Map<string, number>();

    // Helper function to normalize titles for comparison
    const normalizeTitle = (title: string) => title.toLowerCase().trim();

    // Check each current item against historical items
    const allCurrentItems = [
      ...currentItems.strengths,
      ...currentItems.weaknesses,
      ...currentItems.opportunities,
      ...currentItems.threats
    ];

    allCurrentItems.forEach(currentItem => {
      const normalizedCurrent = normalizeTitle(currentItem.title);
      let occurrences = 0;

      historicalItems.forEach(historicalItem => {
        const normalizedHistorical = normalizeTitle(historicalItem.title);

        // Check for exact match or high similarity (contains)
        if (normalizedCurrent === normalizedHistorical ||
            normalizedCurrent.includes(normalizedHistorical) ||
            normalizedHistorical.includes(normalizedCurrent)) {
          // Make sure it's the same category (recurring weakness, not moved to strength)
          if (currentItem.category === historicalItem.category) {
            occurrences++;
          }
        }
      });

      if (occurrences > 0) {
        recurring.set(currentItem.id, occurrences);
      }
    });

    setRecurringItems(recurring);
  };

  // Load year type preference from business_financial_goals
  useEffect(() => {
    const loadYearType = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: goals } = await supabase
          .from('business_financial_goals')
          .select('year_type')
          .eq('business_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (goals?.year_type) {
          const loadedYearType = goals.year_type as YearType;
          setYearType(loadedYearType);
          setCurrentQuarter(getCurrentQuarter(loadedYearType));
        }
      } catch (err) {
        // No goals found or error - default to FY
        console.log('Using default FY year type');
      } finally {
        setYearTypeLoaded(true);
      }
    };

    loadYearType();
  }, [supabase]);

  // Load data on component mount and quarter change (after yearType is loaded)
  useEffect(() => {
    if (yearTypeLoaded) {
      loadSwotAnalysis();
    }
  }, [loadSwotAnalysis, yearTypeLoaded]);

  // Load historical data for trend analysis
  useEffect(() => {
    if (swotAnalysis && swotItems.strengths.length + swotItems.weaknesses.length + swotItems.opportunities.length + swotItems.threats.length > 0) {
      loadHistoricalData();
    }
  }, [swotAnalysis, loadHistoricalData]);

  // Auto-save functionality
  useEffect(() => {
    if (!autoSaveEnabled || !swotAnalysis) return;

    const saveTimer = setTimeout(async () => {
      if (!saving) {
        await handleSave();
      }
    }, 5000); // Auto-save after 5 seconds of inactivity

    return () => clearTimeout(saveTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swotItems]);

  // Helper function to get correct plural form
  const getCategoryKey = (category: SwotCategory): keyof SwotGridData => {
    switch (category) {
      case 'strength':
        return 'strengths';
      case 'weakness':
        return 'weaknesses';
      case 'opportunity':
        return 'opportunities';
      case 'threat':
        return 'threats';
    }
  };

  // Handle adding new item
  const handleAddItem = async (category: SwotCategory, title: string, description?: string) => {
    console.log('handleAddItem called:', { category, title, description, swotAnalysis });

    if (!swotAnalysis) {
      console.error('No swotAnalysis found');
      setError('SWOT analysis not loaded. Please refresh the page.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No user found');
        setError('Please log in to add items.');
        return;
      }

      const categoryKey = getCategoryKey(category);
      console.log('Category key:', categoryKey, 'Current items:', swotItems[categoryKey]?.length);

      const { data: newItem, error } = await supabase
        .from('swot_items')
        .insert({
          swot_analysis_id: swotAnalysis.id,
          category,
          title,
          description,
          impact_level: 3,
          likelihood: category === 'opportunity' || category === 'threat' ? 3 : null,
          priority_order: swotItems[categoryKey].length,
          status: 'active',
          created_by: user.id
        })
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Item added successfully:', newItem);

      // Update local state - create completely new object to force re-render
      setSwotItems(prevItems => {
        const newItems = {
          strengths: [...prevItems.strengths],
          weaknesses: [...prevItems.weaknesses],
          opportunities: [...prevItems.opportunities],
          threats: [...prevItems.threats]
        };
        newItems[categoryKey] = [...newItems[categoryKey], newItem];
        console.log('Updated state:', newItems);
        return newItems;
      });

      // Show success message
      setLastSaved(new Date());
    } catch (err: any) {
      console.error('Error adding item:', err);
      setError(`Failed to add item: ${err?.message || 'Unknown error'}`);
    }
  };

  // Handle updating item
  const handleUpdateItem = async (itemId: string, updates: Partial<SwotItem>) => {
    try {
      const { error } = await supabase
        .from('swot_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      const updatedItems = { ...swotItems };
      Object.keys(updatedItems).forEach(key => {
        const categoryKey = key as keyof SwotGridData;
        updatedItems[categoryKey] = updatedItems[categoryKey].map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        );
      });
      setSwotItems(updatedItems);
      setLastSaved(new Date());
    } catch (err) {
      console.error('Error updating item:', err);
      setError('Failed to update item. Please try again.');
    }
  };

  // Handle deleting item
  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('swot_items')
        .update({ status: 'archived' })
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      const updatedItems = { ...swotItems };
      Object.keys(updatedItems).forEach(key => {
        const categoryKey = key as keyof SwotGridData;
        updatedItems[categoryKey] = updatedItems[categoryKey].filter(item => item.id !== itemId);
      });
      setSwotItems(updatedItems);
      setLastSaved(new Date());
    } catch (err) {
      console.error('Error deleting item:', err);
      setError('Failed to delete item. Please try again.');
    }
  };

  // Handle reordering items
  const handleReorderItems = async (category: SwotCategory, items: SwotItem[]) => {
    try {
      // Update priority order for all items in the category
      const updates = items.map((item, index) => ({
        id: item.id,
        priority_order: index
      }));

      // Batch update
      for (const update of updates) {
        await supabase
          .from('swot_items')
          .update({ priority_order: update.priority_order })
          .eq('id', update.id);
      }

      // Update local state
      const updatedItems = { ...swotItems };
      const categoryKey = getCategoryKey(category);
      updatedItems[categoryKey] = items;
      setSwotItems(updatedItems);
      setLastSaved(new Date());
    } catch (err) {
      console.error('Error reordering items:', err);
      setError('Failed to reorder items. Please try again.');
    }
  };

  // Handle saving SWOT
  const handleSave = async () => {
    if (!swotAnalysis) return;

    try {
      setSaving(true);

      // Update SWOT analysis timestamp
      const { error } = await supabase
        .from('swot_analyses')
        .update({
          status: 'in-progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', swotAnalysis.id);

      if (error) throw error;

      setLastSaved(new Date());
    } catch (err) {
      console.error('Error saving SWOT:', err);
      setError('Failed to save SWOT analysis. Please try again.');
    } finally {
      setSaving(false);
    }
  };


  // Handle exporting SWOT
  const handleExport = () => {
    // This would trigger the export component
    console.log('Exporting SWOT analysis...');
    // Implementation would use the SwotExport component
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading SWOT Analysis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">SWOT Analysis</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Strategic analysis for {currentQuarter.label}
                </p>
              </div>

              <div className="flex items-center space-x-4">
                {/* Auto-save indicator */}
                {lastSaved && (
                  <div className="flex items-center text-sm text-gray-500">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                    Saved {lastSaved.toLocaleTimeString()}
                  </div>
                )}

                {/* Quarter Selector */}
                <QuarterSelector
                  currentQuarter={currentQuarter}
                  onQuarterChange={setCurrentQuarter}
                  yearType={yearType}
                />

                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => router.push('/swot/history')}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <History className="h-4 w-4 mr-2" />
                    History
                  </button>

                  <button
                    onClick={() => router.push('/swot/compare')}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Compare
                  </button>

                  <button
                    onClick={handleExport}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </button>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Trends Section */}
      {recurringItems.size > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-amber-900">Recurring Items Detected</h3>
              </div>
              <button
                onClick={() => setShowTrends(!showTrends)}
                className="text-sm text-amber-700 hover:text-amber-900 font-medium"
              >
                {showTrends ? 'Hide Details' : 'Show Details'}
              </button>
            </div>

            <p className="text-sm text-amber-800 mt-2">
              {recurringItems.size} item{recurringItems.size > 1 ? 's' : ''} appeared in previous quarters.
              Recurring weaknesses and threats may indicate systemic issues requiring strategic action.
            </p>

            {showTrends && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from(recurringItems.entries()).map(([itemId, count]) => {
                  const item = [
                    ...swotItems.strengths,
                    ...swotItems.weaknesses,
                    ...swotItems.opportunities,
                    ...swotItems.threats
                  ].find(i => i.id === itemId);

                  if (!item) return null;

                  const categoryColors: Record<SwotCategory, string> = {
                    strength: 'bg-green-100 text-green-800 border-green-300',
                    weakness: 'bg-red-100 text-red-800 border-red-300',
                    opportunity: 'bg-teal-100 text-teal-800 border-teal-300',
                    threat: 'bg-orange-100 text-orange-800 border-orange-300'
                  };

                  return (
                    <div key={itemId} className={`p-3 rounded border ${categoryColors[item.category]}`}>
                      <p className="text-xs font-semibold uppercase mb-1">{item.category}</p>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs mt-1">Appeared in {count} previous quarter{count > 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main SWOT Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-12">
        <SwotGrid
          items={swotItems}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onReorderItems={handleReorderItems}
          recurringItems={recurringItems}
        />

        {/* Strategy Formation Section */}
        {(swotItems.strengths.length > 0 || swotItems.weaknesses.length > 0 ||
          swotItems.opportunities.length > 0 || swotItems.threats.length > 0) && (
          <div className="mt-8">
            <div className="bg-white rounded-lg shadow-sm p-6 border-2 border-teal-200">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Strategy Formation</h2>
                  <p className="text-base text-gray-600 mt-1">
                    Turn your SWOT analysis into actionable strategies
                  </p>
                </div>
              </div>

              <div className="mb-6 p-4 bg-teal-50 rounded-lg border border-teal-200">
                <p className="text-base font-medium text-gray-800 mb-2">💡 How to Form Strategies:</p>
                <p className="text-base text-gray-700 mb-3">
                  The power of SWOT comes from combining insights across quadrants. Use these frameworks to create strategies:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SO Strategy */}
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="text-lg font-semibold text-green-800 mb-2">
                    SO: Strength + Opportunity
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Use your <strong>strengths</strong> to capitalize on <strong>opportunities</strong>
                  </p>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Strength: "Experienced team" + Opportunity: "New market opening"
                      <br/>→ Strategy: "Leverage our expertise to be first mover in new market"
                    </p>
                  </div>
                </div>

                {/* WO Strategy */}
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                    WO: Weakness + Opportunity
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Overcome <strong>weaknesses</strong> to capture <strong>opportunities</strong>
                  </p>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Weakness: "No marketing expertise" + Opportunity: "Growing demand"
                      <br/>→ Strategy: "Hire marketing specialist to capture growing market"
                    </p>
                  </div>
                </div>

                {/* ST Strategy */}
                <div className="p-4 bg-teal-50 rounded-lg border border-teal-200">
                  <h3 className="text-lg font-semibold text-teal-800 mb-2">
                    ST: Strength + Threat
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Use your <strong>strengths</strong> to mitigate <strong>threats</strong>
                  </p>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Strength: "Long-term contracts" + Threat: "New competitor"
                      <br/>→ Strategy: "Strengthen relationships with contract customers"
                    </p>
                  </div>
                </div>

                {/* WT Strategy */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h3 className="text-lg font-semibold text-red-800 mb-2">
                    WT: Weakness + Threat
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Minimize <strong>weaknesses</strong> and avoid <strong>threats</strong>
                  </p>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Weakness: "Outdated technology" + Threat: "Customer expectations rising"
                      <br/>→ Strategy: "Priority investment in tech upgrade to prevent customer loss"
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-base font-medium text-gray-800 mb-2">🎯 Next Steps:</p>
                <ol className="text-base text-gray-700 list-decimal list-inside space-y-1">
                  <li>Review your SWOT items above</li>
                  <li>Identify 2-3 key strategy combinations that make sense for your business</li>
                  <li>Turn these into specific, measurable goals (use the Goals page)</li>
                  <li>Review quarterly and update as your situation changes</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}