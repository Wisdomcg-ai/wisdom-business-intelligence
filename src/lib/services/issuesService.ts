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

// Creator info joined from users table
export interface CreatorInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export interface Issue {
  id: string;
  user_id: string;
  business_id: string | null;
  title: string;
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
  // Joined creator info (optional, populated when fetching with joins)
  creator?: CreatorInfo;
}

export interface CreateIssueInput {
  title: string;
  priority: number | null;
  status: 'new' | 'identified' | 'in-discussion' | 'solving' | 'solved';
  owner: string;
  stated_problem: string | null;
  root_cause: string | null;
  solution: string | null;
}

// Get all active issues (not solved/archived)
// SHARED BOARD: Now queries by business_id to show all team issues
// Pass businessId to get all issues for a business, or overrideUserId for backward compatibility
export async function getActiveIssues(overrideUserId?: string, businessId?: string) {
  try {
    const supabase = createClient();

    // Shared board: query by business_id if provided
    if (businessId) {
      console.log('[IssuesService] getActiveIssues (SHARED BOARD) - businessId:', businessId);
      const { data, error } = await supabase
        .from('issues_list')
        .select('*')
        .eq('business_id', businessId)
        .eq('archived', false)
        .order('priority', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      console.log('[IssuesService] Query result - data:', data?.length, 'error:', error?.message);
      if (error) {
        console.error('Error fetching active issues:', error);
        return [];
      }
      return data as Issue[];
    }

    // Legacy: query by user_id (backward compatibility)
    const userId = await getEffectiveUserId(overrideUserId);
    console.log('[IssuesService] getActiveIssues (legacy) - overrideUserId:', overrideUserId, 'effectiveUserId:', userId);
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
// SHARED BOARD: Now supports querying by business_id
export async function getSolvedIssues(overrideUserId?: string, businessId?: string) {
  try {
    const supabase = createClient();

    // Shared board: query by business_id if provided
    if (businessId) {
      const { data, error } = await supabase
        .from('issues_list')
        .select('*')
        .eq('business_id', businessId)
        .eq('status', 'solved')
        .order('solved_date', { ascending: false });

      if (error) {
        console.error('Error fetching solved issues:', error);
        return [];
      }
      return data as Issue[];
    }

    // Legacy: query by user_id
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
// SHARED BOARD: Now requires businessId to associate with the business
export async function createIssue(input: CreateIssueInput, overrideUserId?: string, businessId?: string) {
  try {
    const supabase = createClient();
    // Use current user as creator (not overrideUserId) so we track who actually created it
    const creatorId = await getCurrentUserId();
    // For data ownership, use overrideUserId if provided (coach creating on behalf of client)
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('issues_list')
      .insert([
        {
          user_id: creatorId || userId,  // Track actual creator
          business_id: businessId || null,  // Associate with business for shared board
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
// Permission-aware: owner/admin can delete any, members can only delete their own
export async function deleteIssue(
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
        .from('issues_list')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    }

    // Otherwise, only allow deleting own items (member role)
    const { data, error } = await supabase
      .from('issues_list')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUserId)  // Safety: only delete if user owns it
      .select()
      .single();

    if (error) {
      // If no rows affected, user doesn't own this item
      if (error.code === 'PGRST116') {
        throw new Error('You can only delete issues you created');
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting issue:', error);
    throw error;
  }
}

// Get issues stats
// SHARED BOARD: Now supports querying by business_id
export async function getIssuesStats(overrideUserId?: string, businessId?: string) {
  try {
    const issues = await getActiveIssues(overrideUserId, businessId);

    return {
      total: issues.length,
      topPriority: issues.filter(i => i.priority && i.priority <= 3).length,
      new: issues.filter(i => i.status === 'new').length,
      identified: issues.filter(i => i.status === 'identified').length,
      inDiscussion: issues.filter(i => i.status === 'in-discussion').length,
      solving: issues.filter(i => i.status === 'solving').length
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { total: 0, topPriority: 0, new: 0, identified: 0, inDiscussion: 0, solving: 0 };
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