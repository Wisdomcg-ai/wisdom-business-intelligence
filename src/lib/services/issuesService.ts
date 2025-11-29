import { createClient } from '@/lib/supabase/client';

// Helper to get the effective user ID for queries
// When overrideUserId is provided (coach viewing client), use that instead
const getEffectiveUserId = async (overrideUserId?: string): Promise<string | null> => {
  if (overrideUserId) return overrideUserId;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

export interface Issue {
  id: string;
  user_id: string;
  title: string;
  issue_type: 'problem' | 'opportunity' | 'idea' | 'challenge';
  priority: number | null;
  status: 'new' | 'identified' | 'in-discussion' | 'solving' | 'solved';
  owner: string;
  stated_problem: string | null;
  root_cause: string | null;
  solution: string | null;
  created_at: string;
  updated_at: string;
  solved_date: string | null;
  archived: boolean;
}

export interface CreateIssueInput {
  title: string;
  issue_type: 'problem' | 'opportunity' | 'idea' | 'challenge';
  priority: number | null;
  status: 'new' | 'identified' | 'in-discussion' | 'solving' | 'solved';
  owner: string;
  stated_problem: string | null;
  root_cause: string | null;
  solution: string | null;
}

// Get all active issues (not solved/archived)
// Pass overrideUserId when viewing as coach
export async function getActiveIssues(overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    console.log('[IssuesService] getActiveIssues - overrideUserId:', overrideUserId, 'effectiveUserId:', userId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('issues_list')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', false)
      .order('priority', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    console.log('[IssuesService] Query result - data:', data?.length, 'error:', error?.message);

    if (error) {
      console.error('Error fetching active issues:', error);
      return [];
    }
    return data as Issue[];
  } catch (error) {
    console.error('Error fetching active issues:', error);
    return [];
  }
}

// Get top 3 priority issues
export async function getTopPriorityIssues(overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('issues_list')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', false)
      .in('priority', [1, 2, 3])
      .order('priority', { ascending: true });

    if (error) {
      console.error('Error fetching top priority issues:', error);
      return [];
    }
    return data as Issue[];
  } catch (error) {
    console.error('Error fetching top priority issues:', error);
    return [];
  }
}

// Get solved issues
export async function getSolvedIssues(overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('issues_list')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'solved')
      .order('solved_date', { ascending: false });

    if (error) {
      console.error('Error fetching solved issues:', error);
      return [];
    }
    return data as Issue[];
  } catch (error) {
    console.error('Error fetching solved issues:', error);
    return [];
  }
}

// Create a new issue
export async function createIssue(input: CreateIssueInput) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('issues_list')
      .insert([
        {
          user_id: user.id,
          ...input,
          archived: false
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data as Issue;
  } catch (error) {
    console.error('Error creating issue:', error);
    throw error;
  }
}

// Update an issue
export async function updateIssue(id: string, updates: Partial<CreateIssueInput>) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('issues_list')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Issue;
  } catch (error) {
    console.error('Error updating issue:', error);
    throw error;
  }
}

// Solve an issue
export async function solveIssue(id: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('issues_list')
      .update({
        status: 'solved',
        solved_date: new Date().toISOString().split('T')[0],
        archived: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Issue;
  } catch (error) {
    console.error('Error solving issue:', error);
    throw error;
  }
}

// Delete an issue
export async function deleteIssue(id: string) {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('issues_list')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting issue:', error);
    throw error;
  }
}

// Get issues stats
export async function getIssuesStats(overrideUserId?: string) {
  try {
    const issues = await getActiveIssues(overrideUserId);

    return {
      total: issues.length,
      topPriority: issues.filter(i => i.priority && i.priority <= 3).length,
      new: issues.filter(i => i.status === 'new').length,
      inDiscussion: issues.filter(i => i.status === 'in-discussion').length,
      problems: issues.filter(i => i.issue_type === 'problem').length,
      opportunities: issues.filter(i => i.issue_type === 'opportunity').length
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { total: 0, topPriority: 0, new: 0, inDiscussion: 0, problems: 0, opportunities: 0 };
  }
}

// Format date
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}