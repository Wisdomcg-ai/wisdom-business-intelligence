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
import { CheckCircle, AlertCircle, Download, History, TrendingUp, Target, HelpCircle, ChevronRight, ChevronLeft, ChevronDown } from 'lucide-react';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import PageHeader from '@/components/ui/PageHeader';
import type { SaveStatus } from '@/hooks/useAutoSave';

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
  const [showScoringKey, setShowScoringKey] = useState(() => {
    // Default to showing on first visit, remember preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('swot-scoring-key-visible');
      return saved === null ? true : saved === 'true';
    }
    return true;
  });
  const [showStrategyFormation, setShowStrategyFormation] = useState(() => {
    // Default to collapsed, remember preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('swot-strategy-formation-visible');
      return saved === 'true';
    }
    return false;
  });

  // Helper function to find the effective user ID for SWOT data
  // SWOT data is stored with user_id as business_id, not the businesses table ID
  // Uses multiple sources to find the correct user ID (same approach as coach client page)
  const findEffectiveUserId = async (businessIdFromContext: string): Promise<string | null> => {
    console.log('[SWOT] Finding effective user ID for business:', businessIdFromContext);
    const possibleUserIds: string[] = [];

    // Source 1: Check if owner_id is set on the business
    const { data: businessData } = await supabase
      .from('businesses')
      .select('owner_id, name, owner_email')
      .eq('id', businessIdFromContext)
      .single();

    if (businessData?.owner_id) {
      possibleUserIds.push(businessData.owner_id);
      console.log('[SWOT] Source 1 - Found owner_id from businesses table:', businessData.owner_id);
    }

    // Source 2: Check business_profiles table by business_id
    try {
      const { data: profileByBusinessId } = await supabase
        .from('business_profiles')
        .select('user_id')
        .eq('business_id', businessIdFromContext)
        .maybeSingle();

      if (profileByBusinessId?.user_id && !possibleUserIds.includes(profileByBusinessId.user_id)) {
        possibleUserIds.push(profileByBusinessId.user_id);
        console.log('[SWOT] Source 2 - Found user_id from business_profiles by business_id:', profileByBusinessId.user_id);
      }
    } catch (e) {
      console.log('[SWOT] Could not query business_profiles by business_id');
    }

    // Source 3: Check business_users table for linked users
    try {
      const { data: businessUsers } = await supabase
        .from('business_users')
        .select('user_id')
        .eq('business_id', businessIdFromContext);

      if (businessUsers && businessUsers.length > 0) {
        businessUsers.forEach((bu: any) => {
          if (bu.user_id && !possibleUserIds.includes(bu.user_id)) {
            possibleUserIds.push(bu.user_id);
            console.log('[SWOT] Source 3 - Found user_id from business_users:', bu.user_id);
          }
        });
      }
    } catch (e) {
      console.log('[SWOT] Could not query business_users');
    }

    // Source 4: Look up user by owner_email from the users table
    if (businessData?.owner_email) {
      try {
        const { data: userByEmail } = await supabase
          .from('users')
          .select('id')
          .eq('email', businessData.owner_email)
          .maybeSingle();

        if (userByEmail?.id && !possibleUserIds.includes(userByEmail.id)) {
          possibleUserIds.push(userByEmail.id);
          console.log('[SWOT] Source 4 - Found user_id by owner_email:', businessData.owner_email, '->', userByEmail.id);
        }
      } catch (e) {
        console.log('[SWOT] Could not query users by email');
      }
    }

    // Source 5: Look up user by business_name match in business_profiles
    if (businessData?.name) {
      try {
        const { data: profilesByName } = await supabase
          .from('business_profiles')
          .select('user_id')
          .ilike('business_name', businessData.name);

        if (profilesByName && profilesByName.length > 0) {
          profilesByName.forEach((p: any) => {
            if (p.user_id && !possibleUserIds.includes(p.user_id)) {
              possibleUserIds.push(p.user_id);
              console.log('[SWOT] Source 5 - Found user_id by business_name match:', businessData.name, '->', p.user_id);
            }
          });
        }
      } catch (e) {
        console.log('[SWOT] Could not query business_profiles by name');
      }
    }

    console.log('[SWOT] All possible user IDs found:', possibleUserIds);

    // Return the first user ID found, or check if SWOT data exists with business ID directly
    if (possibleUserIds.length > 0) {
      return possibleUserIds[0];
    }

    // Final fallback: Check if there's SWOT data directly with the business ID
    // (in case the data was stored with business ID instead of user ID)
    try {
      const { data: directSwotData } = await supabase
        .from('swot_analyses')
        .select('id, business_id')
        .eq('business_id', businessIdFromContext)
        .limit(1);

      if (directSwotData && directSwotData.length > 0) {
        console.log('[SWOT] Fallback - Found SWOT data directly with business ID:', businessIdFromContext);
        return businessIdFromContext;
      }
    } catch (e) {
      console.log('[SWOT] Could not query swot_analyses directly');
    }

    console.log('[SWOT] Could not find effective user ID, returning null');
    return null;
  };

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

      // Determine the correct businessId for SWOT queries
      // SWOT data is stored with user_id as business_id, so we need to find the right user ID
      let businessId = user.id;

      // Check if we're viewing someone else's business (coach, admin, or any viewer)
      const isViewingOtherBusiness = activeBusiness && activeBusiness.id &&
        (viewerContext.isViewingAsCoach || viewerContext.role === 'admin' || activeBusiness.ownerId !== user.id);

      if (isViewingOtherBusiness) {
        console.log('[SWOT] Viewing other business, attempting to find effective user ID...');

        // First try the ownerId if available
        if (activeBusiness.ownerId && activeBusiness.ownerId !== user.id) {
          businessId = activeBusiness.ownerId;
          console.log('[SWOT] Using activeBusiness.ownerId:', businessId);
        } else {
          // Need to look up the effective user ID from the business
          const effectiveUserId = await findEffectiveUserId(activeBusiness.id);
          if (effectiveUserId) {
            businessId = effectiveUserId;
            console.log('[SWOT] Using looked up effective user ID:', businessId);
          } else {
            // Final fallback: try the business ID directly
            businessId = activeBusiness.id;
            console.log('[SWOT] Fallback to activeBusiness.id:', businessId);
          }
        }
      }

      console.log('[SWOT] Loading analysis with:', {
        businessId,
        quarter: currentQuarter.quarter,
        year: currentQuarter.year,
        userId: user.id,
        isViewingAsCoach: viewerContext.isViewingAsCoach,
        viewerRole: viewerContext.role,
        activeBusinessId: activeBusiness?.id,
        activeBusinessOwnerId: activeBusiness?.ownerId,
        isViewingOtherBusiness
      });

      // First, let's check ALL SWOT analyses for this business to debug
      // Try both businessId and activeBusiness.id in case data was stored differently
      const { data: allSwots, error: debugError } = await supabase
        .from('swot_analyses')
        .select('id, business_id, quarter, year, type, created_at')
        .eq('business_id', businessId);

      console.log('[SWOT] All SWOT analyses for businessId:', businessId, 'Result:', allSwots, 'Error:', debugError);

      // If no results found and we have a different business ID, try that too
      let alternateSwots = null;
      if ((!allSwots || allSwots.length === 0) && activeBusiness?.id && activeBusiness.id !== businessId) {
        const { data: altData } = await supabase
          .from('swot_analyses')
          .select('id, business_id, quarter, year, type, created_at')
          .eq('business_id', activeBusiness.id);
        alternateSwots = altData;
        console.log('[SWOT] Trying alternate businessId:', activeBusiness.id, 'Result:', alternateSwots);

        // If we found data with the alternate ID, use that instead
        if (alternateSwots && alternateSwots.length > 0) {
          businessId = activeBusiness.id;
          console.log('[SWOT] Switching to alternate businessId:', businessId);
        }
      }

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

      console.log('[SWOT] Query result for current quarter:', {
        existingSwot: existingSwot ? { id: existingSwot.id, itemCount: existingSwot.swot_items?.length } : null,
        fetchError
      });

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 means no rows returned, which is fine
        throw fetchError;
      }

      if (existingSwot) {
        setSwotAnalysis(existingSwot);
        organizeSwotItems(existingSwot.swot_items || []);

        // If current quarter has no items but other quarters do, show a helpful message
        if ((!existingSwot.swot_items || existingSwot.swot_items.length === 0) && allSwots && allSwots.length > 1) {
          const quartersWithData = allSwots
            .filter((s: any) => s.id !== existingSwot.id)
            .map((s: any) => `Q${s.quarter} ${s.year}`);
          if (quartersWithData.length > 0) {
            console.log('[SWOT] Note: Current quarter is empty, but data exists in:', quartersWithData);
          }
        }
      } else {
        // No SWOT for current quarter - check if there's a recent one with data we should show instead
        if (allSwots && allSwots.length > 0) {
          // Try to find a SWOT analysis with items - get the most recent one
          const { data: recentSwotWithItems, error: recentError } = await supabase
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
            .eq('type', 'quarterly')
            .order('year', { ascending: false })
            .order('quarter', { ascending: false })
            .limit(1)
            .single();

          if (!recentError && recentSwotWithItems && recentSwotWithItems.swot_items?.length > 0) {
            console.log('[SWOT] Found recent SWOT with items from Q' + recentSwotWithItems.quarter + ' ' + recentSwotWithItems.year);
            // Update the quarter selector to show this quarter
            const boundaries = recentSwotWithItems.quarter === 1 ? { months: yearType === 'FY' ? 'Jul-Sep' : 'Jan-Mar' } :
                              recentSwotWithItems.quarter === 2 ? { months: yearType === 'FY' ? 'Oct-Dec' : 'Apr-Jun' } :
                              recentSwotWithItems.quarter === 3 ? { months: yearType === 'FY' ? 'Jan-Mar' : 'Jul-Sep' } :
                              { months: yearType === 'FY' ? 'Apr-Jun' : 'Oct-Dec' };

            setCurrentQuarter({
              quarter: recentSwotWithItems.quarter,
              year: recentSwotWithItems.year,
              label: `${yearType === 'FY' ? 'FY' : ''}Q${recentSwotWithItems.quarter} ${recentSwotWithItems.year}`,
              months: boundaries.months,
              startDate: new Date(),
              endDate: new Date(),
              isCurrent: false,
              isPast: true,
              isFuture: false,
              yearType
            });
            setSwotAnalysis(recentSwotWithItems);
            organizeSwotItems(recentSwotWithItems.swot_items || []);
            return;
          }
        }

        // Create new SWOT analysis since no existing data found
        console.log('[SWOT] No existing SWOT found, creating new one');
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
  }, [currentQuarter, supabase, activeBusiness?.ownerId, activeBusiness?.id, viewerContext.isViewingAsCoach, viewerContext.role]);

  // Organize items into grid categories
  const organizeSwotItems = (items: SwotItem[]) => {
    console.log('[SWOT] organizeSwotItems called with', items?.length || 0, 'items');
    console.log('[SWOT] Raw items:', items?.map(i => ({ id: i.id, title: i.title, status: i.status, category: i.category })));

    const organized: SwotGridData = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: []
    };

    items.forEach(item => {
      // Include items with null/undefined status (backward compatibility), 'active', or 'carried-forward'
      // Only exclude explicitly 'archived' items
      const shouldInclude = !item.status || item.status === 'active' || item.status === 'carried-forward';
      console.log('[SWOT] Item:', item.title, 'status:', item.status, 'include:', shouldInclude);

      if (shouldInclude) {
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

    console.log('[SWOT] Organized items:', {
      strengths: organized.strengths.length,
      weaknesses: organized.weaknesses.length,
      opportunities: organized.opportunities.length,
      threats: organized.threats.length
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

      // Use the same robust business ID lookup logic as loadSwotAnalysis
      let businessId = user.id;
      const isViewingOtherBusiness = activeBusiness && activeBusiness.id &&
        (viewerContext.isViewingAsCoach || viewerContext.role === 'admin' || activeBusiness.ownerId !== user.id);

      if (isViewingOtherBusiness) {
        if (activeBusiness.ownerId && activeBusiness.ownerId !== user.id) {
          businessId = activeBusiness.ownerId;
        } else {
          const effectiveUserId = await findEffectiveUserId(activeBusiness.id);
          if (effectiveUserId) {
            businessId = effectiveUserId;
          } else {
            businessId = activeBusiness.id;
          }
        }
      }

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
  }, [currentQuarter, supabase, swotItems, activeBusiness?.ownerId, activeBusiness?.id, viewerContext.isViewingAsCoach, viewerContext.role]);

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

        // Use the same robust business ID lookup logic
        let businessId = user.id;
        const isViewingOtherBusiness = activeBusiness && activeBusiness.id &&
          (viewerContext.isViewingAsCoach || viewerContext.role === 'admin' || activeBusiness.ownerId !== user.id);

        if (isViewingOtherBusiness) {
          if (activeBusiness.ownerId && activeBusiness.ownerId !== user.id) {
            businessId = activeBusiness.ownerId;
          } else {
            // Look up effective user ID
            const effectiveUserId = await findEffectiveUserId(activeBusiness.id);
            if (effectiveUserId) {
              businessId = effectiveUserId;
            } else {
              businessId = activeBusiness.id;
            }
          }
        }

        console.log('[SWOT] Loading year type for businessId:', businessId);

        const { data: goals } = await supabase
          .from('business_financial_goals')
          .select('year_type')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        console.log('[SWOT] Year type result:', goals?.year_type || 'none (defaulting to FY)');

        if (goals?.year_type) {
          const loadedYearType = goals.year_type as YearType;
          setYearType(loadedYearType);
          setCurrentQuarter(getCurrentQuarter(loadedYearType));
        }
      } catch (err) {
        // No goals found or error - default to FY
        console.log('[SWOT] Using default FY year type');
      } finally {
        setYearTypeLoaded(true);
      }
    };

    loadYearType();
  }, [supabase, viewerContext.isViewingAsCoach, viewerContext.role, activeBusiness?.ownerId, activeBusiness?.id]);

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
          likelihood: 3, // Now applies to ALL quadrants as "Actionability"
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

  // Toggle scoring key sidebar
  const toggleScoringKey = () => {
    const newValue = !showScoringKey;
    setShowScoringKey(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('swot-scoring-key-visible', String(newValue));
    }
  };

  // Toggle strategy formation section
  const toggleStrategyFormation = () => {
    const newValue = !showStrategyFormation;
    setShowStrategyFormation(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('swot-strategy-formation-visible', String(newValue));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading SWOT Analysis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="SWOT Analysis"
        subtitle={`Strategic analysis for ${currentQuarter.label}`}
        icon={Target}
        saveIndicator={{ status: (saving ? 'saving' : lastSaved ? 'saved' : 'idle') as SaveStatus, lastSaved }}
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Quarter Selector */}
            <QuarterSelector
              currentQuarter={currentQuarter}
              onQuarterChange={setCurrentQuarter}
              yearType={yearType}
            />

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/swot/history')}
                className="inline-flex items-center justify-center px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors flex-1 sm:flex-initial"
              >
                <History className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">History</span>
              </button>

              <button
                onClick={() => router.push('/swot/compare')}
                className="inline-flex items-center justify-center px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors flex-1 sm:flex-initial"
              >
                <TrendingUp className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Compare</span>
              </button>

              <button
                onClick={handleExport}
                className="inline-flex items-center justify-center px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors flex-1 sm:flex-initial"
              >
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
          }
        />

      {/* Page Container - Wider layout with optional sidebar */}
      <div className="max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex gap-6">
          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* Error Alert */}
            {error && (
              <div className="rounded-xl shadow-sm border border-red-200 bg-red-50 p-4 sm:p-5 mb-6">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

        {/* Trends Section */}
        {recurringItems.size > 0 && (
          <div className="rounded-xl shadow-sm border border-amber-200 bg-amber-50 p-4 sm:p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <h3 className="text-base sm:text-lg font-semibold text-amber-900">Recurring Items Detected</h3>
              </div>
              <button
                onClick={() => setShowTrends(!showTrends)}
                className="text-sm text-amber-700 hover:text-amber-900 font-medium text-left sm:text-right"
              >
                {showTrends ? 'Hide Details' : 'Show Details'}
              </button>
            </div>

            <p className="text-sm text-amber-800 mt-2">
              {recurringItems.size} item{recurringItems.size > 1 ? 's' : ''} appeared in previous quarters.
              Recurring weaknesses and threats may indicate systemic issues requiring strategic action.
            </p>

            {showTrends && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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
                    opportunity: 'bg-brand-orange-100 text-brand-orange-800 border-brand-orange-300',
                    threat: 'bg-brand-orange-100 text-brand-orange-800 border-orange-300'
                  };

                  return (
                    <div key={itemId} className={`p-3 rounded-lg border ${categoryColors[item.category]}`}>
                      <p className="text-xs font-semibold uppercase mb-1">{item.category}</p>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs mt-1">Appeared in {count} previous quarter{count > 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Main SWOT Grid */}
        <SwotGrid
          items={swotItems}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onReorderItems={handleReorderItems}
          recurringItems={recurringItems}
        />

        {/* Strategy Formation Section - Collapsible */}
        {(swotItems.strengths.length > 0 || swotItems.weaknesses.length > 0 ||
          swotItems.opportunities.length > 0 || swotItems.threats.length > 0) && (
          <div className="mt-8">
            <div className="rounded-xl shadow-sm border border-gray-200 bg-white overflow-hidden">
              {/* Collapsible Header */}
              <button
                onClick={toggleStrategyFormation}
                className="w-full p-4 sm:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="text-left">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Strategy Formation</h2>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">
                    Turn your SWOT analysis into actionable strategies
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 hidden sm:inline">
                    {showStrategyFormation ? 'Click to collapse' : 'Click to expand'}
                  </span>
                  <ChevronDown className={`h-6 w-6 text-gray-400 transition-transform duration-200 ${showStrategyFormation ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Collapsible Content */}
              {showStrategyFormation && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-gray-100">
              <div className="mt-6 mb-6 p-4 bg-brand-orange-50 rounded-xl border border-brand-orange-200">
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-2">How to Form Strategies:</p>
                <p className="text-sm sm:text-base text-gray-700 mb-3">
                  The power of SWOT comes from combining insights across quadrants. Use these frameworks to create strategies:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* SO Strategy */}
                <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                  <h3 className="text-base sm:text-lg font-semibold text-green-800 mb-2">
                    SO: Strength + Opportunity
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Use your <strong>strengths</strong> to capitalize on <strong>opportunities</strong>
                  </p>
                  <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Strength: "Experienced team" + Opportunity: "New market opening"
                      <br/>→ Strategy: "Leverage our expertise to be first mover in new market"
                    </p>
                  </div>
                </div>

                {/* WO Strategy */}
                <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                  <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-2">
                    WO: Weakness + Opportunity
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Overcome <strong>weaknesses</strong> to capture <strong>opportunities</strong>
                  </p>
                  <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Weakness: "No marketing expertise" + Opportunity: "Growing demand"
                      <br/>→ Strategy: "Hire marketing specialist to capture growing market"
                    </p>
                  </div>
                </div>

                {/* ST Strategy */}
                <div className="p-4 bg-brand-orange-50 rounded-xl border border-brand-orange-200">
                  <h3 className="text-base sm:text-lg font-semibold text-brand-orange-800 mb-2">
                    ST: Strength + Threat
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Use your <strong>strengths</strong> to mitigate <strong>threats</strong>
                  </p>
                  <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Strength: "Long-term contracts" + Threat: "New competitor"
                      <br/>→ Strategy: "Strengthen relationships with contract customers"
                    </p>
                  </div>
                </div>

                {/* WT Strategy */}
                <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                  <h3 className="text-base sm:text-lg font-semibold text-red-800 mb-2">
                    WT: Weakness + Threat
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Minimize <strong>weaknesses</strong> and avoid <strong>threats</strong>
                  </p>
                  <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Example:</p>
                    <p className="italic">
                      Weakness: "Outdated technology" + Threat: "Customer expectations rising"
                      <br/>→ Strategy: "Priority investment in tech upgrade to prevent customer loss"
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-xl shadow-sm border border-gray-200 bg-gray-50">
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-2">Next Steps:</p>
                <ol className="text-sm sm:text-base text-gray-700 list-decimal list-inside space-y-1">
                  <li>Review your SWOT items above</li>
                  <li>Identify 2-3 key strategy combinations that make sense for your business</li>
                  <li>Turn these into specific, measurable goals (use the Goals page)</li>
                  <li>Review quarterly and update as your situation changes</li>
                </ol>
              </div>
                </div>
              )}
            </div>
          </div>
        )}
          </div>

          {/* Scoring Key Sidebar */}
          <div className={`hidden lg:block transition-all duration-300 ${showScoringKey ? 'w-72' : 'w-10'}`}>
            <div className="sticky top-24">
              {/* Toggle Button */}
              <button
                onClick={toggleScoringKey}
                className="absolute -left-3 top-4 z-10 bg-white border border-gray-200 rounded-full p-1.5 shadow-sm hover:bg-gray-50 transition-colors"
                title={showScoringKey ? 'Hide scoring key' : 'Show scoring key'}
              >
                {showScoringKey ? (
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                )}
              </button>

              {/* Sidebar Content */}
              {showScoringKey && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                    <HelpCircle className="h-5 w-5 text-brand-orange" />
                    <h3 className="font-semibold text-gray-900">Scoring Key</h3>
                  </div>

                  {/* Impact Scale */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">How Big? (Impact)</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-gray-600">1</span><span>Tiny</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">2</span><span>Small</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">3</span><span>Medium</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">4</span><span>Large</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">5</span><span>Huge</span></div>
                    </div>
                  </div>

                  {/* Actionability Scale */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Can We Act? (Actionability)</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-gray-600">1</span><span>Very Hard</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">2</span><span>Hard</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">3</span><span>Moderate</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">4</span><span>Easy</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">5</span><span>Very Easy</span></div>
                    </div>
                  </div>

                  {/* Focus Score */}
                  <div className="pt-2 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Focus Score</h4>
                    <p className="text-xs text-gray-600 mb-2">Impact × Actionability</p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-brand-orange-100 text-brand-orange-800 border border-brand-orange-300">🔥 16+</span>
                        <span className="text-gray-600">Top Priority</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">⚡ 9-15</span>
                        <span className="text-gray-600">High Priority</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">📌 6-8</span>
                        <span className="text-gray-600">Medium</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-300">📋 1-5</span>
                        <span className="text-gray-600">Low Priority</span>
                      </div>
                    </div>
                  </div>

                  {/* Quadrant Colors */}
                  <div className="pt-2 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Quadrant Colors</h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-100 border border-green-300 rounded-sm"></div>
                        <span className="text-gray-600">Strengths</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-100 border border-red-300 rounded-sm"></div>
                        <span className="text-gray-600">Weaknesses</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded-sm"></div>
                        <span className="text-gray-600">Opportunities</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-amber-100 border border-amber-300 rounded-sm"></div>
                        <span className="text-gray-600">Threats</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsed state indicator */}
              {!showScoringKey && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 ml-2">
                  <HelpCircle className="h-5 w-5 text-brand-orange mx-auto" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}