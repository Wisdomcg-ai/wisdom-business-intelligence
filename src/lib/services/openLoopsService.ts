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

export interface OpenLoop {
  id: string;
  user_id: string;
  business_id: string | null;
  title: string;
  start_date: string;
  expected_completion_date: string | null;
  owner: string;
  status: 'in-progress' | 'stuck' | 'on-hold';
  blocker: string | null;
  completed_date: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateOpenLoopInput {
  title: string;
  start_date: string;
  expected_completion_date: string | null;
  owner: string;
  status: 'in-progress' | 'stuck' | 'on-hold';
  blocker: string | null;
}

// Get all open loops for current user (not archived)
// SHARED BOARD: Now supports querying by business_id
export async function getOpenLoops(status?: string, overrideUserId?: string, businessId?: string) {
  try {
    const supabase = createClient();

    // Shared board: query by business_id if provided
    if (businessId) {
      console.log('[OpenLoopsService] getOpenLoops (SHARED BOARD) - businessId:', businessId);
      let query = supabase
        .from('open_loops')
        .select('*')
        .eq('business_id', businessId)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OpenLoop[];
    }

    // Legacy: query by user_id
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    let query = supabase
      .from('open_loops')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as OpenLoop[];
  } catch (error) {
    console.error('Error fetching open loops:', error);
    throw error;
  }
}

// Get completed loops (archived)
export async function getCompletedLoops(overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('open_loops')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', true)
      .order('completed_date', { ascending: false });

    if (error) throw error;
    return data as OpenLoop[];
  } catch (error) {
    console.error('Error fetching completed loops:', error);
    throw error;
  }
}

// Get all loops including archived
export async function getAllLoops(overrideUserId?: string) {
  try {
    const supabase = createClient();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('open_loops')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as OpenLoop[];
  } catch (error) {
    console.error('Error fetching all loops:', error);
    throw error;
  }
}

// Create a new open loop
// SHARED BOARD: Now requires businessId to associate with the business
export async function createOpenLoop(input: CreateOpenLoopInput, overrideUserId?: string, businessId?: string) {
  try {
    const supabase = createClient();
    // Use current user as creator (not overrideUserId) so we track who actually created it
    const creatorId = await getCurrentUserId();
    const userId = await getEffectiveUserId(overrideUserId);
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('open_loops')
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
    return data as OpenLoop;
  } catch (error) {
    console.error('Error creating open loop:', error);
    throw error;
  }
}

// Update an open loop
export async function updateOpenLoop(id: string, updates: Partial<CreateOpenLoopInput>) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('open_loops')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as OpenLoop;
  } catch (error) {
    console.error('Error updating open loop:', error);
    throw error;
  }
}

// Mark loop as completed and archived
export async function completeOpenLoop(id: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('open_loops')
      .update({
        archived: true,
        completed_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as OpenLoop;
  } catch (error) {
    console.error('Error completing open loop:', error);
    throw error;
  }
}

// Delete an open loop
// Permission-aware: owner/admin can delete any, members can only delete their own
export async function deleteOpenLoop(
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
        .from('open_loops')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    }

    // Otherwise, only allow deleting own items (member role)
    const { data, error } = await supabase
      .from('open_loops')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUserId)  // Safety: only delete if user owns it
      .select()
      .single();

    if (error) {
      // If no rows affected, user doesn't own this item
      if (error.code === 'PGRST116') {
        throw new Error('You can only delete loops you created');
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting open loop:', error);
    throw error;
  }
}

// Update status
export async function updateOpenLoopStatus(id: string, status: 'in-progress' | 'stuck' | 'on-hold') {
  try {
    return await updateOpenLoop(id, { status });
  } catch (error) {
    console.error('Error updating status:', error);
    throw error;
  }
}

// Get stats
// SHARED BOARD: Now supports querying by business_id
export async function getOpenLoopsStats(overrideUserId?: string, businessId?: string) {
  try {
    const loops = await getOpenLoops(undefined, overrideUserId, businessId);

    return {
      total: loops.length,
      inProgress: loops.filter(l => l.status === 'in-progress').length,
      stuck: loops.filter(l => l.status === 'stuck').length,
      onHold: loops.filter(l => l.status === 'on-hold').length
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    throw error;
  }
}

// Calculate days open
export function calculateDaysOpen(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Format date
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}