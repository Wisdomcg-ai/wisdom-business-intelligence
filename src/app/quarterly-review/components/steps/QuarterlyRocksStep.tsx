'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { formatDollar, parseDollarInput } from '@/app/goals/utils/formatting';
import { calculateQuarters } from '@/app/goals/utils/quarters';
import { getCurrentFiscalYear, startMonthFromYearType } from '@/lib/utils/fiscal-year-utils';
import { getCategoryStyle } from '@/app/goals/utils/design-tokens';
import { getInitials, getColorForName, parseTeamFromProfile, type TeamMember } from '@/app/goals/utils/team';
import { OperationalActivitiesService, type OperationalActivity } from '@/app/goals/services/operational-activities-service';
import OperationalPlanTab from '@/app/goals/components/OperationalPlanTab';
import type { QuarterlyReview, InitiativeDecision } from '../../types';
import {
  Rocket,
  Plus,
  GripVertical,
  Trash2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Zap,
  Flag,
  Settings,
  Check,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Users,
  UserPlus,
  X,
  Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface QuarterlyRocksStepProps {
  review: QuarterlyReview;
  onUpdateInitiativeDecisions: (decisions: InitiativeDecision[]) => void;
}

interface MonthlyBreakdown {
  month1: { revenue: number; grossProfit: number; netProfit: number };
  month2: { revenue: number; grossProfit: number; netProfit: number };
  month3: { revenue: number; grossProfit: number; netProfit: number };
}

type TabId = 'monthly' | 'initiatives' | 'operational';
type TaskStatus = 'not_started' | 'in_progress' | 'done';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MONTH_NAMES_BY_QUARTER: Record<number, string[]> = {
  1: ['January', 'February', 'March'],
  2: ['April', 'May', 'June'],
  3: ['July', 'August', 'September'],
  4: ['October', 'November', 'December'],
};

const MAX_INITIATIVES = 5;
const MAX_PER_PERSON = 3;

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function QuarterlyRocksStep({ review, onUpdateInitiativeDecisions }: QuarterlyRocksStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  // ─── State ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('initiatives');
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);
  const [showChecklist, setShowChecklist] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [operationalActivities, setOperationalActivities] = useState<OperationalActivity[]>([]);
  const [businessId, setBusinessId] = useState<string>('');

  // Initiative expansion & modals
  const [expandedInitiative, setExpandedInitiative] = useState<string | null>(null);
  const [showAddInitiative, setShowAddInitiative] = useState(false);
  const [showAddTeamMember, setShowAddTeamMember] = useState(false);
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null);

  // Planning quarter — resolved from year_type in loadData
  const [sprintQuarterKey, setSprintQuarterKey] = useState<string>('');
  const [sprintQuarterNum, setSprintQuarterNum] = useState<number>(0);
  const [sprintYear, setSprintYear] = useState<number>(0);

  // Local working copy of initiatives — populated after loadData resolves the sprint quarter
  const allDecisions = review.initiative_decisions || [];
  const [localInitiatives, setLocalInitiatives] = useState<InitiativeDecision[]>([]);

  // Monthly breakdown state
  const quarterlyTargets = review.quarterly_targets || { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] };
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyBreakdown>(() => {
    const third = (val: number) => Math.round(val / 3);
    const remainder = (val: number) => val - third(val) * 2;
    return {
      month1: { revenue: third(quarterlyTargets.revenue), grossProfit: third(quarterlyTargets.grossProfit), netProfit: third(quarterlyTargets.netProfit) },
      month2: { revenue: third(quarterlyTargets.revenue), grossProfit: third(quarterlyTargets.grossProfit), netProfit: third(quarterlyTargets.netProfit) },
      month3: { revenue: remainder(quarterlyTargets.revenue), grossProfit: remainder(quarterlyTargets.grossProfit), netProfit: remainder(quarterlyTargets.netProfit) },
    };
  });
  const monthNames = MONTH_NAMES_BY_QUARTER[sprintQuarterNum] || ['Month 1', 'Month 2', 'Month 3'];

  // ─── Sync & Write-back ─────────────────────────────────────
  const hasInitializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  // Re-sync when upstream changes (e.g. user navigates back from 4.2 and returns)
  useEffect(() => {
    if (!hasInitializedRef.current || !sprintQuarterKey) return;
    const incoming = (review.initiative_decisions || []).filter(
      (d) => d.decision !== 'kill' && d.quarterAssigned === sprintQuarterKey
    );
    // Only re-sync if the set of IDs changed (user added/removed in 4.2)
    const incomingIds = new Set(incoming.map((d) => d.initiativeId));
    const localIds = new Set(localInitiatives.map((d) => d.initiativeId));
    const added = incoming.filter((d) => !localIds.has(d.initiativeId));
    const removed = [...localIds].filter((id) => !incomingIds.has(id) && !id.startsWith('sprint-new-'));
    if (added.length > 0 || removed.length > 0) {
      isSyncingRef.current = true;
      setLocalInitiatives((prev) => {
        const kept = prev.filter((d) => !removed.includes(d.initiativeId));
        return [...kept, ...added];
      });
      setTimeout(() => { isSyncingRef.current = false; }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.initiative_decisions, sprintQuarterKey]);

  // Debounced write-back local → parent
  useEffect(() => {
    // Don't write back during sync or before initialization
    if (isSyncingRef.current || !hasInitializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Merge sprint plan data back into the full decisions array
      const currentDecisions = review.initiative_decisions || [];
      const localById = new Map(localInitiatives.map((i) => [i.initiativeId, i]));
      const merged = currentDecisions.map((d) => {
        const local = localById.get(d.initiativeId);
        if (local) return { ...d, ...local };
        return d;
      });
      // Also add any new initiatives (ids starting with 'sprint-new-')
      const existingIds = new Set(currentDecisions.map((d) => d.initiativeId));
      const newOnes = localInitiatives.filter((i) => !existingIds.has(i.initiativeId));
      onUpdateInitiativeDecisions([...merged, ...newOnes]);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localInitiatives]);

  // ─── Data Loading ──────────────────────────────────────────
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const targetUserId = activeBusiness?.ownerId || user.id;

      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id, key_roles, owner_info')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const bId = profile?.id || review.business_id;
      setBusinessId(bId);

      // Load year_type to determine the correct sprint quarter (same as Step 4.2)
      const { data: goalsData } = await supabase
        .from('business_financial_goals')
        .select('year_type')
        .eq('business_id', bId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const yearType = goalsData?.year_type || 'CY';
      const planYear = getCurrentFiscalYear(startMonthFromYearType(yearType as 'FY' | 'CY'));

      const quarters = calculateQuarters(yearType, planYear);
      const currentQ = quarters.find((q) => q.isCurrent);
      const nextQ = quarters.find((q) => q.isNextQuarter)
        || (currentQ ? quarters[quarters.indexOf(currentQ) + 1] : null);
      const sprintQ = nextQ || currentQ || quarters[0];

      const resolvedKey = sprintQ.id; // e.g. 'q4'
      const resolvedNum = parseInt(resolvedKey.replace('q', ''));
      setSprintQuarterKey(resolvedKey);
      setSprintQuarterNum(resolvedNum);
      setSprintYear(planYear);

      // Now filter initiatives for the sprint quarter
      const decisions = review.initiative_decisions || [];
      const filtered = decisions.filter(
        (d) => d.decision !== 'kill' && d.quarterAssigned === resolvedKey
      );
      isSyncingRef.current = true;
      setLocalInitiatives(filtered);
      hasInitializedRef.current = true;
      setTimeout(() => { isSyncingRef.current = false; }, 100);

      // Load team members
      if (profile) {
        const members = parseTeamFromProfile(
          {
            owner_info: profile.owner_info as { owner_name?: string } | undefined,
            key_roles: profile.key_roles as Array<{ name: string; role?: string }> | undefined,
          },
          bId
        );
        if (members.length > 0) setTeamMembers(members);
      }

      // Load operational activities
      try {
        const activities = await OperationalActivitiesService.loadActivities(bId);
        if (activities) setOperationalActivities(activities);
      } catch {
        // Operational activities are optional
      }
    } catch (error) {
      console.error('Error loading sprint planning data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Initiative CRUD ──────────────────────────────────────
  const updateInitiative = useCallback((id: string, updates: Partial<InitiativeDecision>) => {
    setLocalInitiatives((prev) =>
      prev.map((i) => {
        if (i.initiativeId !== id) return i;
        const updated = { ...i, ...updates };
        // Auto-calculate total hours from tasks
        if (updates.tasks) {
          const totalMinutes = updates.tasks.reduce((sum, t) => sum + (t.minutesAllocated || 0), 0);
          updated.totalHours = Math.round((totalMinutes / 60) * 10) / 10;
        }
        return updated;
      })
    );
  }, []);

  const addInitiative = useCallback((title: string) => {
    const newInit: InitiativeDecision = {
      initiativeId: `sprint-new-${Date.now()}`,
      title,
      category: 'other',
      currentStatus: 'active',
      progressPercentage: 0,
      decision: 'keep',
      notes: '',
      quarterAssigned: sprintQuarterKey,
      why: '',
      outcome: '',
      milestones: [],
      tasks: [],
      totalHours: 0,
    };
    setLocalInitiatives((prev) => [...prev, newInit]);
    setShowAddInitiative(false);
  }, [sprintQuarterKey]);

  const deleteInitiative = useCallback((id: string) => {
    setLocalInitiatives((prev) => prev.filter((i) => i.initiativeId !== id));
  }, []);

  // ─── Task CRUD ──────────────────────────────────────────
  const addTask = useCallback((initiativeId: string) => {
    setLocalInitiatives((prev) =>
      prev.map((i) => {
        if (i.initiativeId !== initiativeId) return i;
        const tasks = i.tasks || [];
        const newTask = {
          id: `task-${Date.now()}`,
          task: '',
          assignedTo: '',
          minutesAllocated: 0,
          dueDate: '',
          status: 'not_started' as const,
          order: tasks.length,
        };
        return { ...i, tasks: [...tasks, newTask] };
      })
    );
  }, []);

  const updateTask = useCallback((initiativeId: string, taskId: string, updates: Partial<NonNullable<InitiativeDecision['tasks']>[0]>) => {
    setLocalInitiatives((prev) =>
      prev.map((i) => {
        if (i.initiativeId !== initiativeId) return i;
        const tasks = (i.tasks || []).map((t) => (t.id === taskId ? { ...t, ...updates } : t));
        const totalMinutes = tasks.reduce((sum, t) => sum + (t.minutesAllocated || 0), 0);
        return { ...i, tasks, totalHours: Math.round((totalMinutes / 60) * 10) / 10 };
      })
    );
  }, []);

  const deleteTask = useCallback((initiativeId: string, taskId: string) => {
    setLocalInitiatives((prev) =>
      prev.map((i) => {
        if (i.initiativeId !== initiativeId) return i;
        const tasks = (i.tasks || []).filter((t) => t.id !== taskId);
        const totalMinutes = tasks.reduce((sum, t) => sum + (t.minutesAllocated || 0), 0);
        return { ...i, tasks, totalHours: Math.round((totalMinutes / 60) * 10) / 10 };
      })
    );
  }, []);

  // ─── Milestone CRUD ──────────────────────────────────────
  const addMilestone = useCallback((initiativeId: string) => {
    setLocalInitiatives((prev) =>
      prev.map((i) => {
        if (i.initiativeId !== initiativeId) return i;
        const milestones = i.milestones || [];
        return {
          ...i,
          milestones: [...milestones, { id: `ms-${Date.now()}`, description: '', targetDate: '', isCompleted: false }],
        };
      })
    );
  }, []);

  const updateMilestone = useCallback((initiativeId: string, msId: string, updates: Partial<NonNullable<InitiativeDecision['milestones']>[0]>) => {
    setLocalInitiatives((prev) =>
      prev.map((i) => {
        if (i.initiativeId !== initiativeId) return i;
        return {
          ...i,
          milestones: (i.milestones || []).map((m) => (m.id === msId ? { ...m, ...updates } : m)),
        };
      })
    );
  }, []);

  const deleteMilestone = useCallback((initiativeId: string, msId: string) => {
    setLocalInitiatives((prev) =>
      prev.map((i) => {
        if (i.initiativeId !== initiativeId) return i;
        return { ...i, milestones: (i.milestones || []).filter((m) => m.id !== msId) };
      })
    );
  }, []);

  // ─── Team Member Management ──────────────────────────────
  const handleAddTeamMember = useCallback(async (name: string, email: string, role: string, type: 'employee' | 'contractor') => {
    const newMember: TeamMember = {
      id: `member-${Date.now()}`,
      name,
      initials: getInitials(name),
      color: getColorForName(name),
      role,
    };
    setTeamMembers((prev) => [...prev, newMember]);

    // Persist to business_profiles.key_roles
    if (businessId) {
      try {
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('key_roles')
          .eq('id', businessId)
          .maybeSingle();

        const existingRoles = (profile?.key_roles as Array<{ name: string; role?: string; email?: string; type?: string }>) || [];
        const updatedRoles = [...existingRoles, { name, role, email, type }];

        await supabase
          .from('business_profiles')
          .update({ key_roles: updatedRoles })
          .eq('id', businessId);
      } catch (error) {
        console.error('Error saving team member:', error);
      }
    }
    setShowAddTeamMember(false);
  }, [businessId, supabase]);

  // ─── Owner Assignment ──────────────────────────────────────
  const handleAssignPerson = useCallback((initiativeId: string, memberName: string) => {
    updateInitiative(initiativeId, { assignedTo: memberName });
    setShowAssignmentFor(null);
  }, [updateInitiative]);

  const initiativesPerPerson = useMemo(() => {
    const counts: Record<string, number> = {};
    localInitiatives.forEach((i) => {
      if (i.assignedTo) {
        counts[i.assignedTo] = (counts[i.assignedTo] || 0) + 1;
      }
    });
    return counts;
  }, [localInitiatives]);

  const getAssignedMember = useCallback((name: string): TeamMember | null => {
    if (!name) return null;
    return teamMembers.find((m) => m.name === name) || {
      id: `parsed-${name}`,
      name,
      initials: getInitials(name),
      color: getColorForName(name),
    };
  }, [teamMembers]);

  // ─── Checklist ──────────────────────────────────────────────
  const hasInitiatives = localInitiatives.length > 0;
  const hasOperationalActivities = operationalActivities.length > 0;
  const allComplete = hasInitiatives && hasOperationalActivities;

  // ─── Monthly Breakdown ──────────────────────────────────────
  const updateMonthly = (month: 'month1' | 'month2' | 'month3', field: 'revenue' | 'grossProfit' | 'netProfit', value: number) => {
    setMonthlyBreakdown((prev) => ({ ...prev, [month]: { ...prev[month], [field]: value } }));
  };

  const monthlyTotals = useMemo(() => ({
    revenue: monthlyBreakdown.month1.revenue + monthlyBreakdown.month2.revenue + monthlyBreakdown.month3.revenue,
    grossProfit: monthlyBreakdown.month1.grossProfit + monthlyBreakdown.month2.grossProfit + monthlyBreakdown.month3.grossProfit,
    netProfit: monthlyBreakdown.month1.netProfit + monthlyBreakdown.month2.netProfit + monthlyBreakdown.month3.netProfit,
  }), [monthlyBreakdown]);

  // ─── Tab Configuration ──────────────────────────────────────
  const tabs = useMemo(() => {
    const allTabs = [
      {
        id: 'monthly' as TabId,
        label: 'Monthly Breakdown',
        icon: Calendar,
        description: 'Break down quarterly targets into monthly goals',
        gradient: 'from-slate-600 to-slate-700',
        advancedOnly: true,
      },
      {
        id: 'initiatives' as TabId,
        label: 'Initiatives & Projects',
        icon: Flag,
        description: 'Plan and track strategic initiatives',
        gradient: 'from-brand-orange to-amber-500',
        badge: localInitiatives.length,
        advancedOnly: false,
      },
      {
        id: 'operational' as TabId,
        label: 'Operational Plan',
        icon: Briefcase,
        description: 'Weekly execution and accountability',
        gradient: 'from-slate-600 to-slate-700',
        advancedOnly: false,
      },
    ];
    return showAdvancedMode ? allTabs : allTabs.filter((t) => !t.advancedOnly);
  }, [localInitiatives.length, showAdvancedMode]);

  // ═══════════════════════════════════════════════════════════════
  // Loading
  // ═══════════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ═══════════════════ TASK BANNER ═══════════════════ */}
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-2xl p-6 text-white">
        <div className="flex items-start gap-3">
          <Rocket className="w-6 h-6 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-bold">Sprint Planning</h2>
            <p className="text-brand-orange-100 text-sm mt-1">
              Unpack your quarterly plan into actionable initiatives, tasks, and operational activities
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════ REQUIREMENTS CHECKLIST ═══════════════════ */}
      <div className={`rounded-xl border p-4 ${allComplete ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
        <button onClick={() => setShowChecklist(!showChecklist)} className="w-full flex items-center justify-between">
          <h4 className={`text-sm font-bold ${allComplete ? 'text-green-800' : 'text-gray-800'}`}>
            {allComplete ? '✓ All Requirements Complete!' : 'Step 4.3 Requirements'}
          </h4>
          {showChecklist ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showChecklist && (
          <div className="space-y-2 mt-3">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${hasInitiatives ? 'bg-green-500' : 'bg-gray-300'}`}>
                {hasInitiatives ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">1</span>}
              </div>
              <span className={`text-sm ${hasInitiatives ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Plan initiatives with tasks and owners ({localInitiatives.length} initiatives)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${hasOperationalActivities ? 'bg-green-500' : 'bg-gray-300'}`}>
                {hasOperationalActivities ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">2</span>}
              </div>
              <span className={`text-sm ${hasOperationalActivities ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Set up operational activities ({operationalActivities.length} activities)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════ TWO-COLUMN LAYOUT ═══════════════════ */}
      <div className="flex gap-8 flex-col lg:flex-row">
        {/* ─── LEFT: TARGETS SIDEBAR ─── */}
        <div className="lg:w-72 flex-shrink-0">
          <div className="sticky top-6">
            <div className="bg-gradient-to-r from-brand-navy to-brand-navy-700 text-white rounded-t-xl p-4">
              <h3 className="font-bold text-base">Q{sprintQuarterNum} {sprintYear} Targets</h3>
            </div>
            <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-4 divide-y divide-gray-100">
              {/* Financial Targets */}
              <div className="pb-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Financial Targets</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-600">Revenue</span>
                    <span className="text-sm font-semibold text-gray-900">{formatDollar(quarterlyTargets.revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-600">Gross Profit</span>
                    <span className="text-sm font-semibold text-gray-900">{formatDollar(quarterlyTargets.grossProfit)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-600">Net Profit</span>
                    <span className="text-sm font-semibold text-gray-900">{formatDollar(quarterlyTargets.netProfit)}</span>
                  </div>
                </div>
              </div>
              {/* Core Metrics */}
              <div className="pt-3 pb-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Core Metrics</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-600">GP %</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {quarterlyTargets.revenue > 0 ? `${((quarterlyTargets.grossProfit / quarterlyTargets.revenue) * 100).toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-600">NP %</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {quarterlyTargets.revenue > 0 ? `${((quarterlyTargets.netProfit / quarterlyTargets.revenue) * 100).toFixed(1)}%` : '-'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Initiative Count */}
              <div className="pt-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Initiatives</h4>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Active initiatives</span>
                  <span className={`text-sm font-bold ${localInitiatives.length <= MAX_INITIATIVES ? 'text-green-700' : 'text-amber-700'}`}>
                    {localInitiatives.length} / {MAX_INITIATIVES}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: TABBED CONTENT ─── */}
        <div className="flex-1 min-w-0">
          {/* Tab Navigation - Large Gradient Icon Cards */}
          <div className="flex gap-4 mb-6 items-start">
            <div className="flex gap-4 flex-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 p-6 rounded-xl cursor-pointer transition-all duration-200 ${
                      isActive
                        ? `bg-gradient-to-br ${tab.gradient} text-white shadow-lg scale-[1.02]`
                        : 'bg-white border border-gray-200 text-gray-700 hover:shadow-md'
                    }`}
                  >
                    <Icon className={`w-6 h-6 mb-2 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{tab.label}</span>
                      {'badge' in tab && tab.badge !== undefined && tab.badge > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-brand-orange-100 text-brand-orange-700'
                        }`}>
                          {tab.badge}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-1 ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                      {tab.description}
                    </p>
                  </button>
                );
              })}
            </div>
            {/* Advanced Toggle */}
            <button
              onClick={() => setShowAdvancedMode(!showAdvancedMode)}
              className={`p-2 rounded-lg transition-colors ${showAdvancedMode ? 'bg-brand-orange-100 text-brand-orange-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}
              title={showAdvancedMode ? 'Hide monthly breakdown' : 'Show monthly breakdown'}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>

          {/* ═══════════════════ TAB CONTENT ═══════════════════ */}

          {/* ─── TAB 1: MONTHLY BREAKDOWN ─── */}
          {activeTab === 'monthly' && (
            <MonthlyBreakdownTab
              monthlyBreakdown={monthlyBreakdown}
              updateMonthly={updateMonthly}
              monthlyTotals={monthlyTotals}
              quarterlyTargets={quarterlyTargets}
              monthNames={monthNames}
              nextQuarter={sprintQuarterNum}
              nextYear={sprintYear}
            />
          )}

          {/* ─── TAB 2: INITIATIVES & PROJECTS ─── */}
          {activeTab === 'initiatives' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Initiatives &amp; Projects</h3>
                  <p className="text-sm text-gray-600">
                    Break down strategic initiatives into actionable tasks with clear ownership and deadlines.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddInitiative(true)}
                  disabled={localInitiatives.length >= MAX_INITIATIVES}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    localInitiatives.length < MAX_INITIATIVES
                      ? 'bg-brand-navy text-white hover:bg-brand-navy-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-5 h-5" />
                  Add New
                </button>
              </div>

              {/* Validation Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border-2 ${localInitiatives.length <= MAX_INITIATIVES ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {localInitiatives.length <= MAX_INITIATIVES ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{localInitiatives.length} / {MAX_INITIATIVES} Items</div>
                      <div className="text-xs text-gray-600">Max {MAX_INITIATIVES} initiatives per quarter</div>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 border-2 border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-slate-600" />
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{teamMembers.length} Team Members</div>
                      <div className="text-xs text-gray-600">Available for assignment</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Initiative Cards */}
              {localInitiatives.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-slate-300">
                  <Flag className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">No Initiatives Yet</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Initiatives from Step 4.2 will appear here, or add new ones.
                  </p>
                  <button
                    onClick={() => setShowAddInitiative(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    Add Initiative
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {localInitiatives.map((initiative, index) => (
                    <InitiativeCard
                      key={initiative.initiativeId}
                      initiative={initiative}
                      index={index}
                      isExpanded={expandedInitiative === initiative.initiativeId}
                      onToggle={() => setExpandedInitiative(expandedInitiative === initiative.initiativeId ? null : initiative.initiativeId)}
                      onUpdate={(updates) => updateInitiative(initiative.initiativeId, updates)}
                      onDelete={() => deleteInitiative(initiative.initiativeId)}
                      onAddTask={() => addTask(initiative.initiativeId)}
                      onUpdateTask={(taskId, updates) => updateTask(initiative.initiativeId, taskId, updates)}
                      onDeleteTask={(taskId) => deleteTask(initiative.initiativeId, taskId)}
                      onAddMilestone={() => addMilestone(initiative.initiativeId)}
                      onUpdateMilestone={(msId, updates) => updateMilestone(initiative.initiativeId, msId, updates)}
                      onDeleteMilestone={(msId) => deleteMilestone(initiative.initiativeId, msId)}
                      teamMembers={teamMembers}
                      getAssignedMember={getAssignedMember}
                      showAssignmentFor={showAssignmentFor}
                      setShowAssignmentFor={setShowAssignmentFor}
                      onAssignPerson={handleAssignPerson}
                      initiativesPerPerson={initiativesPerPerson}
                      onAddTeamMember={() => setShowAddTeamMember(true)}
                    />
                  ))}
                </div>
              )}

              {/* Add Initiative Modal */}
              {showAddInitiative && (
                <AddInitiativeModal
                  onClose={() => setShowAddInitiative(false)}
                  onAdd={addInitiative}
                />
              )}

              {/* Add Team Member Modal */}
              {showAddTeamMember && (
                <AddTeamMemberModal
                  onClose={() => setShowAddTeamMember(false)}
                  onAdd={handleAddTeamMember}
                />
              )}
            </div>
          )}

          {/* ─── TAB 3: OPERATIONAL PLAN ─── */}
          {activeTab === 'operational' && (
            <OperationalPlanTab
              operationalActivities={operationalActivities}
              setOperationalActivities={setOperationalActivities}
              businessId={businessId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INITIATIVE CARD SUB-COMPONENT
// ═══════════════════════════════════════════════════════════════

interface InitiativeCardProps {
  initiative: InitiativeDecision;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<InitiativeDecision>) => void;
  onDelete: () => void;
  onAddTask: () => void;
  onUpdateTask: (taskId: string, updates: Partial<NonNullable<InitiativeDecision['tasks']>[0]>) => void;
  onDeleteTask: (taskId: string) => void;
  onAddMilestone: () => void;
  onUpdateMilestone: (msId: string, updates: Partial<NonNullable<InitiativeDecision['milestones']>[0]>) => void;
  onDeleteMilestone: (msId: string) => void;
  teamMembers: TeamMember[];
  getAssignedMember: (name: string) => TeamMember | null;
  showAssignmentFor: string | null;
  setShowAssignmentFor: (id: string | null) => void;
  onAssignPerson: (initiativeId: string, memberName: string) => void;
  initiativesPerPerson: Record<string, number>;
  onAddTeamMember: () => void;
}

function InitiativeCard({
  initiative,
  index,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onAddMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  teamMembers,
  getAssignedMember,
  showAssignmentFor,
  setShowAssignmentFor,
  onAssignPerson,
  initiativesPerPerson,
  onAddTeamMember,
}: InitiativeCardProps) {
  const taskCount = initiative.tasks?.length || 0;
  const completedTasks = initiative.tasks?.filter((t) => t.status === 'done').length || 0;
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;
  const catStyle = getCategoryStyle(initiative.category);
  const ownerMember = initiative.assignedTo ? getAssignedMember(initiative.assignedTo) : null;
  const isShowingAssignment = showAssignmentFor === initiative.initiativeId;

  // Badge styles
  const getBadgeStyle = () => {
    if (initiative.source === 'roadmap') return { bg: 'bg-brand-navy', text: 'text-white', label: 'ROADMAP' };
    if (initiative.ideaType === 'operational') return { bg: 'bg-gray-200', text: 'text-gray-700', label: 'OPERATIONAL' };
    if (initiative.decision === 'accelerate') return { bg: 'bg-blue-500', text: 'text-white', label: 'ACCELERATE' };
    return { bg: 'bg-brand-orange', text: 'text-white', label: 'STRATEGIC' };
  };
  const badgeStyle = getBadgeStyle();

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Card Header */}
      <div
        onClick={onToggle}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-brand-navy/5 transition-all"
      >
        <div className="flex items-center gap-3 flex-1">
          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="flex items-center justify-center w-7 h-7 bg-brand-navy text-white rounded-full text-sm font-bold flex-shrink-0">
            {index + 1}
          </div>
          <span className="text-lg flex-shrink-0" title={catStyle.label}>{catStyle.emoji}</span>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 leading-tight">{initiative.title}</h4>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-block px-2 py-0.5 text-[10px] rounded font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}>
                {badgeStyle.label}
              </span>
              <span className={`text-xs ${catStyle.textColor} font-medium`}>{catStyle.shortLabel}</span>
              {taskCount > 0 && (
                <>
                  <span className="text-gray-300">&#183;</span>
                  <span className="text-xs text-gray-600">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
                </>
              )}
              {(initiative.totalHours || 0) > 0 && (
                <>
                  <span className="text-gray-300">&#183;</span>
                  <span className="text-xs text-gray-600">{initiative.totalHours} hours</span>
                </>
              )}
              {ownerMember && (
                <>
                  <span className="text-gray-300">&#183;</span>
                  <div className="flex items-center gap-1">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold ${ownerMember.color}`}>
                      {ownerMember.initials}
                    </div>
                    <span className="text-xs text-gray-600">{ownerMember.name}</span>
                  </div>
                </>
              )}
            </div>
            {/* Progress Bar */}
            {taskCount > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 font-medium">{progress}%</span>
              </div>
            )}
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5 bg-slate-50">
          {/* Why & Outcome */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Why is this important?</label>
              <textarea
                value={initiative.why || ''}
                onChange={(e) => onUpdate({ why: e.target.value })}
                placeholder="What problem does this solve? Why now?"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Expected Outcome</label>
              <textarea
                value={initiative.outcome || ''}
                onChange={(e) => onUpdate({ outcome: e.target.value })}
                placeholder="What does success look like? How will you measure it?"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Dates & Owner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={initiative.startDate || ''}
                onChange={(e) => onUpdate({ startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={initiative.endDate || ''}
                onChange={(e) => onUpdate({ endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
            </div>
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Owner</label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAssignmentFor(isShowingAssignment ? null : initiative.initiativeId);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white hover:border-brand-navy transition-colors"
              >
                {ownerMember ? (
                  <>
                    <div className={`w-6 h-6 rounded-full ${ownerMember.color} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white text-xs font-bold">{ownerMember.initials}</span>
                    </div>
                    <span className="text-sm font-medium text-brand-navy flex-1 text-left">{ownerMember.name}</span>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <span className="text-sm text-gray-500 flex-1 text-left">Assign to...</span>
                  </>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isShowingAssignment ? 'rotate-180' : ''}`} />
              </button>

              {isShowingAssignment && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto min-w-full">
                  {teamMembers.map((member) => {
                    const count = initiativesPerPerson[member.name] || 0;
                    const isOverLimit = count >= MAX_PER_PERSON && initiative.assignedTo !== member.name;
                    return (
                      <button
                        key={member.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isOverLimit) onAssignPerson(initiative.initiativeId, member.name);
                        }}
                        disabled={isOverLimit}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-slate-100 last:border-b-0 ${
                          isOverLimit ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white text-sm font-bold">{member.initials}</span>
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium text-brand-navy">{member.name}</div>
                          {member.role && <div className="text-xs text-gray-500">{member.role}</div>}
                        </div>
                        {count > 0 && (
                          <div className="text-xs text-gray-500">
                            {count} {isOverLimit ? '(Max reached)' : ''}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAssignmentFor(null);
                      onAddTeamMember();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-brand-navy hover:bg-gray-50 transition-colors font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    Add New Person...
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Milestones Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h5 className="text-lg font-bold text-gray-900">Key Milestones</h5>
              <button
                onClick={onAddMilestone}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Milestone
              </button>
            </div>

            {(initiative.milestones || []).length === 0 ? (
              <div className="text-center py-6 bg-white rounded-lg border-2 border-dashed border-slate-300">
                <p className="text-sm text-gray-600 mb-3">No milestones yet. Add key checkpoints to track progress.</p>
                <button
                  onClick={onAddMilestone}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add First Milestone
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {(initiative.milestones || []).map((milestone) => (
                  <div key={milestone.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <input
                      type="checkbox"
                      checked={milestone.isCompleted}
                      onChange={(e) => onUpdateMilestone(milestone.id, { isCompleted: e.target.checked })}
                      className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                    />
                    <input
                      type="text"
                      value={milestone.description}
                      onChange={(e) => onUpdateMilestone(milestone.id, { description: e.target.value })}
                      placeholder="Milestone description..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                    />
                    <input
                      type="date"
                      value={milestone.targetDate}
                      onChange={(e) => onUpdateMilestone(milestone.id, { targetDate: e.target.value })}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                    />
                    <button
                      onClick={() => onDeleteMilestone(milestone.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task Breakdown Table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h5 className="text-lg font-bold text-gray-900">Task Breakdown</h5>
              <button
                onClick={onAddTask}
                className="flex items-center gap-2 px-3 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            </div>

            {taskCount === 0 ? (
              <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-slate-300">
                <p className="text-sm text-gray-600 mb-3">No tasks yet. Break down this initiative into specific actions.</p>
                <button
                  onClick={onAddTask}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add First Task
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-brand-navy text-white">
                      <th className="px-4 py-3 text-left text-sm font-semibold">Task</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-48">Assigned To</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-32">Minutes</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-40">Due Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold w-36">Status</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(initiative.tasks || []).map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        teamMembers={teamMembers}
                        onUpdate={(updates) => onUpdateTask(task.id, updates)}
                        onDelete={() => onDeleteTask(task.id)}
                        onAddTeamMember={onAddTeamMember}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-brand-navy">
                      <td colSpan={2} className="px-4 py-3 text-right font-bold text-gray-900">
                        Total Time:
                      </td>
                      <td colSpan={4} className="px-4 py-3 font-bold text-brand-navy">
                        {initiative.totalHours?.toFixed(1) || '0.0'} hours
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Delete Initiative */}
          {initiative.initiativeId.startsWith('sprint-new-') && (
            <div className="border-t border-gray-200 pt-3 flex justify-end">
              <button
                onClick={onDelete}
                className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove Initiative
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TASK ROW SUB-COMPONENT
// ═══════════════════════════════════════════════════════════════

interface TaskRowProps {
  task: NonNullable<InitiativeDecision['tasks']>[0];
  teamMembers: TeamMember[];
  onUpdate: (updates: Partial<NonNullable<InitiativeDecision['tasks']>[0]>) => void;
  onDelete: () => void;
  onAddTeamMember: () => void;
}

function TaskRow({ task, teamMembers, onUpdate, onDelete, onAddTeamMember }: TaskRowProps) {
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'not_started': return 'bg-red-100 text-red-700 border-red-300';
      case 'in_progress': return 'bg-gray-100 text-gray-600 border-gray-300';
      case 'done': return 'bg-green-100 text-green-700 border-green-300';
      default: return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <input
          type="text"
          value={task.task}
          onChange={(e) => onUpdate({ task: e.target.value })}
          placeholder="Enter task description..."
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={task.assignedTo}
          onChange={(e) => {
            if (e.target.value === '__add_new__') {
              onAddTeamMember();
            } else {
              onUpdate({ assignedTo: e.target.value });
            }
          }}
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
        >
          <option value="">Select person...</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.name}>{member.name}</option>
          ))}
          <option value="__add_new__">+ Add Team Member</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          value={task.minutesAllocated || ''}
          onChange={(e) => onUpdate({ minutesAllocated: parseInt(e.target.value) || 0 })}
          placeholder="0"
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="date"
          value={task.dueDate}
          onChange={(e) => onUpdate({ dueDate: e.target.value })}
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={task.status}
          onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
          className={`w-full px-2 py-1 border rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-orange ${getStatusColor(task.status)}`}
        >
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={onDelete}
          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD INITIATIVE MODAL
// ═══════════════════════════════════════════════════════════════

interface AddInitiativeModalProps {
  onClose: () => void;
  onAdd: (title: string) => void;
}

function AddInitiativeModal({ onClose, onAdd }: AddInitiativeModalProps) {
  const [title, setTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Add Initiative or Project</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Launch new website, Implement CRM system"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD TEAM MEMBER MODAL
// ═══════════════════════════════════════════════════════════════

interface AddTeamMemberModalProps {
  onClose: () => void;
  onAdd: (name: string, email: string, role: string, type: 'employee' | 'contractor') => void;
}

function AddTeamMemberModal({ onClose, onAdd }: AddTeamMemberModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [type, setType] = useState<'employee' | 'contractor'>('employee');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAdd(name.trim(), email.trim(), role.trim(), type);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Add Team Member</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@company.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Marketing Manager, Developer"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Type *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('employee')}
                className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                  type === 'employee'
                    ? 'border-brand-navy bg-gray-50 text-brand-navy font-semibold'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                Employee
              </button>
              <button
                type="button"
                onClick={() => setType('contractor')}
                className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                  type === 'contractor'
                    ? 'border-brand-navy bg-gray-50 text-brand-navy font-semibold'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                Contractor
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Team Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MONTHLY BREAKDOWN TAB
// ═══════════════════════════════════════════════════════════════

interface MonthlyBreakdownTabProps {
  monthlyBreakdown: MonthlyBreakdown;
  updateMonthly: (month: 'month1' | 'month2' | 'month3', field: 'revenue' | 'grossProfit' | 'netProfit', value: number) => void;
  monthlyTotals: { revenue: number; grossProfit: number; netProfit: number };
  quarterlyTargets: { revenue: number; grossProfit: number; netProfit: number; kpis: unknown[] };
  monthNames: string[];
  nextQuarter: number;
  nextYear: number;
}

function MonthlyBreakdownTab({
  monthlyBreakdown,
  updateMonthly,
  monthlyTotals,
  quarterlyTargets,
  monthNames,
  nextQuarter,
  nextYear,
}: MonthlyBreakdownTabProps) {
  const months: ('month1' | 'month2' | 'month3')[] = ['month1', 'month2', 'month3'];
  const metrics: { key: 'revenue' | 'grossProfit' | 'netProfit'; label: string; color: string; labelColor: string; bg: string }[] = [
    { key: 'revenue', label: 'Revenue', color: 'border-brand-orange-300 focus:ring-brand-orange', labelColor: 'text-brand-orange-700', bg: 'bg-brand-orange-50' },
    { key: 'grossProfit', label: 'Gross Profit', color: 'border-green-300 focus:ring-green-500', labelColor: 'text-green-700', bg: 'bg-green-50' },
    { key: 'netProfit', label: 'Net Profit', color: 'border-blue-300 focus:ring-blue-500', labelColor: 'text-blue-700', bg: 'bg-blue-50' },
  ];

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
        <Calendar className="w-5 h-5 text-brand-orange" />
        Q{nextQuarter} {nextYear} Monthly Breakdown
      </h3>
      <p className="text-sm text-gray-600 mb-5">
        Break down your quarterly targets into monthly goals. Values default to quarterly target / 3 and are editable.
      </p>

      {(quarterlyTargets.revenue > 0 || quarterlyTargets.grossProfit > 0 || quarterlyTargets.netProfit > 0) && (
        <div className="bg-brand-orange-50 rounded-lg border border-brand-orange-200 p-3 mb-5 text-sm text-brand-orange-800">
          <strong>Quarterly Targets:</strong>{' '}
          Revenue {formatDollar(quarterlyTargets.revenue)} | GP {formatDollar(quarterlyTargets.grossProfit)} | NP {formatDollar(quarterlyTargets.netProfit)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {months.map((monthKey, idx) => (
          <div key={monthKey} className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 text-center mb-4 pb-2 border-b border-gray-100">{monthNames[idx]}</h4>
            <div className="space-y-3">
              {metrics.map(({ key, label, color, labelColor, bg }) => (
                <div key={key} className={`${bg} rounded-lg p-3`}>
                  <label className={`block text-xs font-medium ${labelColor} mb-1`}>{label}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="text"
                      value={monthlyBreakdown[monthKey][key] ? monthlyBreakdown[monthKey][key].toLocaleString('en-AU') : ''}
                      onChange={(e) => updateMonthly(monthKey, key, parseDollarInput(e.target.value))}
                      placeholder="0"
                      className={`w-full pl-7 pr-3 py-2 text-sm font-semibold border rounded-lg focus:ring-2 focus:border-transparent bg-white ${color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-100 rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Quarterly Totals (auto-calculated)</h4>
        <div className="grid grid-cols-3 gap-4">
          {metrics.map(({ key, label, labelColor }) => {
            const total = monthlyTotals[key];
            const target = quarterlyTargets[key];
            const isMatch = target > 0 && total === target;
            return (
              <div key={key} className="text-center">
                <div className={`text-xs font-medium ${labelColor} mb-1`}>{label}</div>
                <div className={`text-lg font-bold ${isMatch ? 'text-green-700' : 'text-gray-900'}`}>{formatDollar(total)}</div>
                {target > 0 && (
                  <div className={`text-xs mt-0.5 ${isMatch ? 'text-green-600' : 'text-gray-500'}`}>
                    {isMatch ? 'Matches target' : `Target: ${formatDollar(target)}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
