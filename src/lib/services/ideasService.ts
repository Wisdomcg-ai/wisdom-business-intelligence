import { createClient } from '@/lib/supabase/client';

// Helper to get the effective user ID for queries
// When overrideUserId is provided (coach viewing client), use that instead
const getEffectiveUserId = async (overrideUserId?: string): Promise<string | null> => {
  if (overrideUserId) return overrideUserId;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

// Get current authenticated user ID (for permission checks)
const getCurrentUserId = async (): Promise<string | null> => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

// ============================================================================
// IDEAS (Ideas Journal)
// ============================================================================

export type IdeaStatus = 'captured' | 'under_review' | 'approved' | 'rejected' | 'parked';
export type IdeaCategory = 'product' | 'marketing' | 'operations' | 'people' | 'finance' | 'technology' | 'other';
export type IdeaImpact = 'low' | 'medium' | 'high';

export type IdeaShareMode = 'private' | 'team' | 'specific';

export interface Idea {
  id: string;
  user_id: string;
  business_id: string | null;  // Added for shared board
  title: string;
  description: string | null;
  source: string | null;
  status: IdeaStatus;
  archived: boolean;
  category: IdeaCategory | null;
  estimated_impact: IdeaImpact | null;
  created_at: string;
  updated_at: string;
  // Phase 61 sharing fields
  shared_with_all?: boolean;
  shared_with?: string[];
  // Derived by the service (not stored)
  is_owner?: boolean;
  owner_display_name?: string;
}

export interface CreateIdeaInput {
  title: string;
  description?: string | null;
  source?: string | null;
  category?: IdeaCategory | null;
  estimated_impact?: IdeaImpact | null;
}

export interface UpdateIdeaInput {
  title?: string;
  description?: string | null;
  source?: string | null;
  status?: IdeaStatus;
  category?: IdeaCategory | null;
  estimated_impact?: IdeaImpact | null;
  archived?: boolean;
}

// ----------------------------------------------------------------------------
// Phase 61-03 — owner-display-name resolution
//
// `public.users` carries first_name / last_name / email keyed by id. RLS on
// `users` already allows authenticated reads of name/email for accessible
// teammates, so PostgREST will inline the joined row when the FK is followed.
// ----------------------------------------------------------------------------
const IDEA_OWNER_SELECT = '*, owner:users!user_id(first_name, last_name, email)';

interface OwnerJoinRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

function resolveOwnerDisplayName(owner: OwnerJoinRow | null | undefined): string {
  if (owner) {
    const first = owner.first_name?.trim();
    const last = owner.last_name?.trim();
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    if (last) return last;
    if (owner.email && owner.email.trim()) return owner.email;
  }
  return 'Team member';
}

function decorateIdea(
  row: Record<string, unknown> & { owner?: OwnerJoinRow | OwnerJoinRow[] | null },
  viewerId: string | null
): Idea {
  const ownerRow = Array.isArray(row.owner) ? row.owner[0] ?? null : row.owner ?? null;
  const { owner: _owner, ...rest } = row;
  void _owner;
  const userId = (rest as { user_id?: string }).user_id;
  return {
    ...(rest as unknown as Idea),
    is_owner: viewerId != null && userId === viewerId,
    owner_display_name: resolveOwnerDisplayName(ownerRow),
  };
}

// Get all active ideas (not archived)
// SHARED BOARD: Supports querying by business_id (UNCHANGED — already broad)
// LEGACY MODE: Phase 61-03 broadens visibility — RLS now gates whether shared
// rows surface, so the .eq('user_id') filter is removed.
export async function getActiveIdeas(overrideUserId?: string, businessId?: string) {
  try {
    const supabase = createClient();

    // Shared board: query by business_id if provided — UNCHANGED.
    if (businessId) {
      console.log('[IdeasService] getActiveIdeas (SHARED BOARD) - businessId:', businessId);
      const { data, error } = await supabase
        .from('ideas')
        .select(IDEA_OWNER_SELECT)
        .eq('business_id', businessId)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching active ideas:', error);
        return [];
      }
      // Decorate with is_owner (relative to the override or current user) +
      // owner_display_name. viewerId may be null when called from server
      // contexts; is_owner then resolves to false uniformly.
      const viewerId = await getEffectiveUserId(overrideUserId);
      return ((data || []) as any[]).map((row) => decorateIdea(row, viewerId));
    }

    // Legacy: query by user_id — but phase 61-03 drops the .eq filter.
    // RLS (broadened in 61-02) handles visibility; the service derives is_owner
    // against the requesting user.
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('ideas')
      .select(IDEA_OWNER_SELECT)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching active ideas:', error);
      return [];
    }
    return ((data || []) as any[]).map((row) => decorateIdea(row, userId));
  } catch (error) {
    console.error('Error fetching active ideas:', error);
    return [];
  }
}

// Get ideas by status — phase 61-03: drops .eq('user_id'), maps is_owner.
export async function getIdeasByStatus(status: IdeaStatus, overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('ideas')
      .select(IDEA_OWNER_SELECT)
      .eq('status', status)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching ideas by status:', error);
      return [];
    }
    return ((data || []) as any[]).map((row) => decorateIdea(row, userId));
  } catch (error) {
    console.error('Error fetching ideas by status:', error);
    return [];
  }
}

// Get a single idea by ID.
// Phase 61-03 — closes RESEARCH.md §3 ownership-gap #3:
//   - Accepts an optional `viewerId` so callers can tag the row with is_owner.
//   - Does NOT add .eq('user_id') — recipients must be able to read shared rows.
//   - RLS still enforces visibility (broadened in 61-02).
export async function getIdeaById(id: string, viewerId?: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ideas')
      .select(IDEA_OWNER_SELECT)
      .eq('id', id)
      .single();

    if (error || !data) {
      if (error) console.error('Error fetching idea:', error);
      return null;
    }
    return decorateIdea(data as any, viewerId ?? null);
  } catch (error) {
    console.error('Error fetching idea:', error);
    return null;
  }
}

// Create a new idea
// SHARED BOARD: Requires businessId to associate with the business
export async function createIdea(input: CreateIdeaInput, overrideUserId?: string, businessId?: string) {
  try {
    const supabase = createClient();
    // Use current user as creator (not overrideUserId) so we track who actually created it
    const creatorId = await getCurrentUserId();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('ideas')
      .insert([
        {
          user_id: creatorId || userId,  // Track actual creator
          business_id: businessId || null,  // Associate with business for shared board
          title: input.title,
          description: input.description || null,
          source: input.source || null,
          category: input.category || null,
          estimated_impact: input.estimated_impact || null,
          status: 'captured',
          archived: false
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data as Idea;
  } catch (error) {
    console.error('Error creating idea:', error);
    throw error;
  }
}

// Update an idea
// Phase 61-03 — closes RESEARCH.md §3 ownership-gap #1: ADD .eq('user_id', userId)
// for defense-in-depth alongside the owner-only RLS UPDATE policy from 61-02.
export async function updateIdea(id: string, updates: UpdateIdeaInput, overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('ideas')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)  // Phase 61-03: ownership-gap fix
      .select()
      .single();

    if (error) throw error;
    return data as Idea;
  } catch (error) {
    console.error('Error updating idea:', error);
    throw error;
  }
}

// Archive an idea
// Phase 61-03 — closes RESEARCH.md §3 ownership-gap #2: ADD .eq('user_id', userId).
export async function archiveIdea(id: string, overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('ideas')
      .update({
        archived: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)  // Phase 61-03: ownership-gap fix
      .select()
      .single();

    if (error) throw error;
    return data as Idea;
  } catch (error) {
    console.error('Error archiving idea:', error);
    throw error;
  }
}

// Delete an idea
// Permission-aware: owner/admin can delete any, members can only delete their own
export async function deleteIdea(
  id: string,
  options?: {
    canDeleteAll?: boolean;  // true for owner/admin roles
  }
) {
  try {
    const supabase = createClient();
    const currentUserId = await getCurrentUserId();

    if (!currentUserId) {
      throw new Error('Not authenticated');
    }

    // If user has canDeleteAll permission (owner/admin), delete without restriction
    if (options?.canDeleteAll) {
      const { error } = await supabase
        .from('ideas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    }

    // Otherwise, only allow deleting own items (member role)
    const { data, error } = await supabase
      .from('ideas')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUserId)  // Safety: only delete if user owns it
      .select()
      .single();

    if (error) {
      // If no rows affected, user doesn't own this item
      if (error.code === 'PGRST116') {
        throw new Error('You can only delete ideas you created');
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting idea:', error);
    throw error;
  }
}

// Get ideas stats
// SHARED BOARD: Now supports querying by business_id
export async function getIdeasStats(overrideUserId?: string, businessId?: string) {
  try {
    const ideas = await getActiveIdeas(overrideUserId, businessId);

    return {
      total: ideas.length,
      captured: ideas.filter(i => i.status === 'captured').length,
      underReview: ideas.filter(i => i.status === 'under_review').length,
      approved: ideas.filter(i => i.status === 'approved').length,
      rejected: ideas.filter(i => i.status === 'rejected').length,
      parked: ideas.filter(i => i.status === 'parked').length
    };
  } catch (error) {
    console.error('Error getting ideas stats:', error);
    return { total: 0, captured: 0, underReview: 0, approved: 0, rejected: 0, parked: 0 };
  }
}

// Phase 61-03 — Share an idea.
// Owner-only; defensive .eq('user_id', userId) complements the RLS owner-only
// UPDATE policy. Validation matches shareTask exactly.
export async function shareIdea(
  id: string,
  mode: IdeaShareMode,
  userIds?: string[],
  overrideUserId?: string
): Promise<Idea | null> {
  const supabase = createClient();
  const userId = await getEffectiveUserId(overrideUserId);
  if (!userId) return null;

  if (mode === 'specific' && (!userIds || userIds.length === 0)) {
    // "specific" share mode requires at least one user_id. Treat empty as a
    // validation failure. (No new console.error per phase 61-03 constraint.)
    return null;
  }

  let patch: { shared_with_all: boolean; shared_with: string[] };
  if (mode === 'private') {
    patch = { shared_with_all: false, shared_with: [] };
  } else if (mode === 'team') {
    patch = { shared_with_all: true, shared_with: [] };
  } else {
    patch = { shared_with_all: false, shared_with: userIds as string[] };
  }

  const { data, error } = await supabase
    .from('ideas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select(IDEA_OWNER_SELECT)
    .single();

  if (error || !data) {
    // Silent failure — RLS denial, validation failure, or row-not-found all
    // collapse to null. (No new console.error per phase 61-03 constraint.)
    return null;
  }

  // Caller IS the owner here (defensive filter just succeeded).
  return decorateIdea(data as any, userId);
}

// Phase 61-03 — Recipient-safe status flip via SECURITY DEFINER RPC from 61-02.
// Visibility (owner OR shared) is the gate; the RPC narrows the actual UPDATE
// to the status column. Never bypasses with a direct UPDATE.
export async function markIdeaStatus(
  id: string,
  status: IdeaStatus,
  overrideUserId?: string
): Promise<Idea | null> {
  const supabase = createClient();
  const userId = await getEffectiveUserId(overrideUserId);

  const { data, error } = await supabase.rpc('mark_idea_status', {
    p_idea_id: id,
    p_status: status,
  });

  if (error || !data) {
    // Silent failure (RPC access denied, idea not found, invalid status).
    // (No new console.error per phase 61-03 constraint.)
    return null;
  }

  // RPC returns the bare row (no joined owner). Decorate with is_owner only.
  return decorateIdea(data as any, userId);
}

// ============================================================================
// IDEAS FILTER (Evaluation) — Phase 61: UNCHANGED (stays per-user per CONTEXT)
// ============================================================================

export type FilterDecision = 'proceed' | 'reject' | 'park' | 'needs_more_info';

export interface TimeInvestmentItem {
  name: string;
  role: string;
  hours: number;
  hourlyRate: number;
  total: number;
}

export interface IdeasFilter {
  id: string;
  idea_id: string;
  user_id: string;

  // Problem & Solution
  problem_solving: string | null;
  pros: string[];
  cons: string[];
  mvp_description: string | null;
  mvp_timeline: string | null;

  // Financial Projections
  revenue_forecast: { month3?: number; year1?: number; year2?: number };
  profit_forecast: { month3?: number; year1?: number; year2?: number };
  cash_required: number;
  time_investment: TimeInvestmentItem[];
  total_time_investment: number;

  // Strategic Alignment
  bhag_alignment_score: number | null;
  bhag_alignment_notes: string | null;

  // Marketing
  unique_selling_proposition: string | null;
  how_to_sell: string | null;
  who_will_sell: string | null;

  // Timing & Opportunity Cost
  why_now: string | null;
  what_will_suffer: string | null;

  // Competition
  competition_analysis: string | null;
  competitive_advantage: string | null;

  // Risk Analysis
  upside_risks: string[];
  downside_risks: string[];

  // Decision
  decision: FilterDecision | null;
  decision_notes: string | null;
  decision_date: string | null;
  evaluation_score: number | null;
  evaluated_at: string | null;
  evaluated_by: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateIdeasFilterInput {
  idea_id: string;
  problem_solving?: string | null;
  pros?: string[];
  cons?: string[];
  mvp_description?: string | null;
  mvp_timeline?: string | null;
  revenue_forecast?: { month3?: number; year1?: number; year2?: number };
  profit_forecast?: { month3?: number; year1?: number; year2?: number };
  cash_required?: number;
  time_investment?: TimeInvestmentItem[];
  bhag_alignment_score?: number | null;
  bhag_alignment_notes?: string | null;
  unique_selling_proposition?: string | null;
  how_to_sell?: string | null;
  who_will_sell?: string | null;
  why_now?: string | null;
  what_will_suffer?: string | null;
  competition_analysis?: string | null;
  competitive_advantage?: string | null;
  upside_risks?: string[];
  downside_risks?: string[];
  decision?: FilterDecision | null;
  decision_notes?: string | null;
  evaluation_score?: number | null;
}

export type UpdateIdeasFilterInput = Partial<CreateIdeasFilterInput>;

// Get filter for an idea
export async function getIdeasFilterByIdeaId(ideaId: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ideas_filter')
      .select('*')
      .eq('idea_id', ideaId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching ideas filter:', error);
      return null;
    }
    return data as IdeasFilter | null;
  } catch (error) {
    console.error('Error fetching ideas filter:', error);
    return null;
  }
}

// Create or update ideas filter
export async function upsertIdeasFilter(input: CreateIdeasFilterInput, overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    // Calculate total time investment
    const totalTimeInvestment = (input.time_investment || []).reduce((sum, item) => sum + (item.total || 0), 0);

    const filterData = {
      idea_id: input.idea_id,
      user_id: userId,
      problem_solving: input.problem_solving || null,
      pros: input.pros || [],
      cons: input.cons || [],
      mvp_description: input.mvp_description || null,
      mvp_timeline: input.mvp_timeline || null,
      revenue_forecast: input.revenue_forecast || {},
      profit_forecast: input.profit_forecast || {},
      cash_required: input.cash_required || 0,
      time_investment: input.time_investment || [],
      total_time_investment: totalTimeInvestment,
      bhag_alignment_score: input.bhag_alignment_score || null,
      bhag_alignment_notes: input.bhag_alignment_notes || null,
      unique_selling_proposition: input.unique_selling_proposition || null,
      how_to_sell: input.how_to_sell || null,
      who_will_sell: input.who_will_sell || null,
      why_now: input.why_now || null,
      what_will_suffer: input.what_will_suffer || null,
      competition_analysis: input.competition_analysis || null,
      competitive_advantage: input.competitive_advantage || null,
      upside_risks: input.upside_risks || [],
      downside_risks: input.downside_risks || [],
      decision: input.decision || null,
      decision_notes: input.decision_notes || null,
      evaluation_score: input.evaluation_score || null,
      evaluated_at: input.decision ? new Date().toISOString() : null,
      evaluated_by: input.decision ? userId : null,
      decision_date: input.decision ? new Date().toISOString() : null
    };

    const { data, error } = await supabase
      .from('ideas_filter')
      .upsert(filterData, { onConflict: 'idea_id' })
      .select()
      .single();

    if (error) throw error;
    return data as IdeasFilter;
  } catch (error) {
    console.error('Error upserting ideas filter:', error);
    throw error;
  }
}

// Get all ideas with their filter evaluation (for overview)
// Phase 61-03: UNCHANGED — per-user view of own ideas, intentional.
export async function getIdeasWithFilters(overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('ideas')
      .select(`
        *,
        ideas_filter (*)
      `)
      .eq('user_id', userId)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching ideas with filters:', error);
      return [];
    }

    return data.map(idea => ({
      ...idea,
      filter: idea.ideas_filter?.[0] || null
    }));
  } catch (error) {
    console.error('Error fetching ideas with filters:', error);
    return [];
  }
}

// Format date helper
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Format currency helper — accounting convention: negatives as ($X)
export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
}
