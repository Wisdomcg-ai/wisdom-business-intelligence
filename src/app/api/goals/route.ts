/**
 * Goals API Route
 * Fetches business goals for the forecast wizard
 *
 * IMPORTANT: business_financial_goals table stores data using business_profiles.id,
 * but callers may pass businesses.id. We need to map between them.
 *
 * ID Architecture:
 * - businesses.id: Used by BusinessContext, forecast page, coach relationships
 * - business_profiles.id: Used by Goals wizard to store financial goals
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const fiscalYear = searchParams.get('fiscal_year');

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    console.log('[Goals API] Fetching goals for business_id:', businessId);

    // Strategy: Try multiple approaches to find the goals
    // 1. Direct lookup (if caller passed business_profiles.id)
    // 2. Via businesses table owner_id -> business_profiles.user_id
    // 3. Via business_users table -> user_id -> business_profiles.user_id

    let financialGoals = null;

    // Approach 1: Direct lookup with the provided ID
    const { data: directLookup, error: directError } = await supabase
      .from('business_financial_goals')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    // Only use direct lookup if it has actual values (not just an empty record)
    if (directLookup && !directError && (directLookup.revenue_year1 || directLookup.net_profit_year1)) {
      console.log('[Goals API] Found goals with values via direct lookup');
      financialGoals = directLookup;
    } else if (directLookup) {
      console.log('[Goals API] Found empty record via direct lookup, trying other approaches...');
    }

    // Approach 2: If not found, try looking up via businesses.owner_id -> business_profiles
    if (!financialGoals) {
      const { data: business } = await supabase
        .from('businesses')
        .select('owner_id')
        .eq('id', businessId)
        .maybeSingle();

      if (business?.owner_id) {
        // Find business_profiles.id for this owner
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', business.owner_id)
          .maybeSingle();

        if (profile?.id) {
          console.log('[Goals API] Found profile via owner_id:', profile.id);
          const { data: goalsViaProfile } = await supabase
            .from('business_financial_goals')
            .select('*')
            .eq('business_id', profile.id)
            .maybeSingle();

          if (goalsViaProfile) {
            console.log('[Goals API] Found goals via business_profiles lookup');
            financialGoals = goalsViaProfile;
          }
        }
      }
    }

    // Approach 3: Try with user's own ID (for cases where user.id was used as business_id)
    if (!financialGoals) {
      const { data: goalsViaUser } = await supabase
        .from('business_financial_goals')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (goalsViaUser) {
        console.log('[Goals API] Found goals via user_id lookup');
        financialGoals = goalsViaUser;
      }
    }

    // If no goals found, return empty object with defaults
    if (!financialGoals) {
      console.log('[Goals API] No goals found for business');
      return NextResponse.json({
        goals: {
          business_id: businessId,
          fiscal_year: fiscalYear ? parseInt(fiscalYear) : new Date().getFullYear() + 1,
          revenue_target: null,
          gross_profit_target: null,
          profit_target: null,
          gross_margin_percent: null,
          net_profit_percent: null,
          headcount_target: null,
          key_objectives: [],
        }
      });
    }

    // Map the actual column names to what the wizard expects
    // business_financial_goals uses: revenue_year1, gross_profit_year1, net_profit_year1
    // Wizard expects: revenue_target, gross_profit_target, profit_target
    const goals = {
      id: financialGoals.id,
      business_id: financialGoals.business_id,
      fiscal_year: fiscalYear ? parseInt(fiscalYear) : new Date().getFullYear() + 1,

      // Year type: 'FY' (Financial Year Jul-Jun) or 'CY' (Calendar Year Jan-Dec)
      year_type: financialGoals.year_type || 'FY',

      // Map Year 1 targets to the wizard format
      revenue_target: financialGoals.revenue_year1 || null,
      gross_profit_target: financialGoals.gross_profit_year1 || null,
      profit_target: financialGoals.net_profit_year1 || null,

      // Calculate percentages if we have the data
      gross_margin_percent: financialGoals.revenue_year1 && financialGoals.gross_profit_year1
        ? Math.round((financialGoals.gross_profit_year1 / financialGoals.revenue_year1) * 100)
        : (financialGoals.gross_margin_year1 || null),
      net_profit_percent: financialGoals.revenue_year1 && financialGoals.net_profit_year1
        ? Math.round((financialGoals.net_profit_year1 / financialGoals.revenue_year1) * 100)
        : (financialGoals.net_margin_year1 || null),

      // Include multi-year data if available
      revenue_year2: financialGoals.revenue_year2 || null,
      revenue_year3: financialGoals.revenue_year3 || null,
      gross_profit_year2: financialGoals.gross_profit_year2 || null,
      gross_profit_year3: financialGoals.gross_profit_year3 || null,
      net_profit_year2: financialGoals.net_profit_year2 || null,
      net_profit_year3: financialGoals.net_profit_year3 || null,

      // Metadata
      created_at: financialGoals.created_at,
      updated_at: financialGoals.updated_at,
    };

    console.log('[Goals API] Returning goals:', {
      year_type: goals.year_type,
      revenue_target: goals.revenue_target,
      gross_profit_target: goals.gross_profit_target,
      profit_target: goals.profit_target
    });

    return NextResponse.json({ goals });
  } catch (error) {
    console.error('[Goals API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
