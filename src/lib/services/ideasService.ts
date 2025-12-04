import { createClient } from '@/lib/supabase/client';

// Helper to get the effective user ID for queries
// When overrideUserId is provided (coach viewing client), use that instead
const getEffectiveUserId = async (overrideUserId?: string): Promise<string | null> => {
  if (overrideUserId) return overrideUserId;
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

export interface Idea {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  source: string | null;
  status: IdeaStatus;
  archived: boolean;
  category: IdeaCategory | null;
  estimated_impact: IdeaImpact | null;
  created_at: string;
  updated_at: string;
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

// Get all active ideas (not archived)
export async function getActiveIdeas(overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching active ideas:', error);
      return [];
    }
    return data as Idea[];
  } catch (error) {
    console.error('Error fetching active ideas:', error);
    return [];
  }
}

// Get ideas by status
export async function getIdeasByStatus(status: IdeaStatus, overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching ideas by status:', error);
      return [];
    }
    return data as Idea[];
  } catch (error) {
    console.error('Error fetching ideas by status:', error);
    return [];
  }
}

// Get a single idea by ID
export async function getIdeaById(id: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching idea:', error);
      return null;
    }
    return data as Idea;
  } catch (error) {
    console.error('Error fetching idea:', error);
    return null;
  }
}

// Create a new idea
export async function createIdea(input: CreateIdeaInput, overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('ideas')
      .insert([
        {
          user_id: userId,
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
export async function updateIdea(id: string, updates: UpdateIdeaInput) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ideas')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
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
export async function archiveIdea(id: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ideas')
      .update({
        archived: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
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
export async function deleteIdea(id: string) {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('ideas')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting idea:', error);
    throw error;
  }
}

// Get ideas stats
export async function getIdeasStats(overrideUserId?: string) {
  try {
    const ideas = await getActiveIdeas(overrideUserId);

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

// ============================================================================
// IDEAS FILTER (Evaluation)
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

// Format currency helper
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}
