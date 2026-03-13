'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { formatDollar, parseDollarInput } from '@/app/goals/utils/formatting';
import { getCategoryStyle } from '@/app/goals/utils/design-tokens';
import { getInitials, getColorForName, parseTeamFromProfile, type TeamMember } from '@/app/goals/utils/team';
import { OperationalActivitiesService, type OperationalActivity } from '@/app/goals/services/operational-activities-service';
import OperationalPlanTab from '@/app/goals/components/OperationalPlanTab';
import { getDefaultRock, type QuarterlyReview, type Rock } from '../../types';
import {
  Rocket,
  Plus,
  GripVertical,
  Trash2,
  User,
  Target,
  Calendar,
  ChevronDown,
  ChevronUp,
  Zap,
  Flag,
  Settings,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lightbulb,
  ArrowRight,
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
  onUpdateRocks: (rocks: Rock[]) => void;
}

interface RockTask {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  minutes: number;
  status: 'not_started' | 'in_progress' | 'done';
}

interface Milestone {
  id: string;
  title: string;
  date: string;
}

interface MonthlyBreakdown {
  month1: { revenue: number; grossProfit: number; netProfit: number };
  month2: { revenue: number; grossProfit: number; netProfit: number };
  month3: { revenue: number; grossProfit: number; netProfit: number };
}

type TabId = 'monthly' | 'initiatives' | 'operational';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MONTH_NAMES_BY_QUARTER: Record<number, string[]> = {
  1: ['January', 'February', 'March'],
  2: ['April', 'May', 'June'],
  3: ['July', 'August', 'September'],
  4: ['October', 'November', 'December'],
};

const TASK_STATUS_OPTIONS: { value: RockTask['status']; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: 'bg-gray-100 text-gray-600' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'done', label: 'Complete', color: 'bg-green-100 text-green-700' },
];

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function QuarterlyRocksStep({ review, onUpdateRocks }: QuarterlyRocksStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  const rocks = review.quarterly_rocks || [];
  const [activeTab, setActiveTab] = useState<TabId>('initiatives');
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);
  const [showChecklist, setShowChecklist] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [operationalActivities, setOperationalActivities] = useState<OperationalActivity[]>([]);
  const [businessId, setBusinessId] = useState<string>('');

  // Initiative expansion state
  const [expandedInitiative, setExpandedInitiative] = useState<string | null>(null);
  const [showAddInitiative, setShowAddInitiative] = useState(false);
  const [newInitTitle, setNewInitTitle] = useState('');

  // Initiative task/milestone state
  const [initiativeTasks, setInitiativeTasks] = useState<Record<string, RockTask[]>>({});
  const [initiativeMilestones, setInitiativeMilestones] = useState<Record<string, Milestone[]>>({});

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

  // Rock drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const initiativeDecisions = review.initiative_decisions || [];
  const rocksReview = review.rocks_review || [];
  const activeInitiatives = initiativeDecisions.filter((d) => d.decision !== 'kill');

  const nextQuarter = review.quarter < 4 ? review.quarter + 1 : 1;
  const nextYear = review.quarter < 4 ? review.year : review.year + 1;
  const monthNames = MONTH_NAMES_BY_QUARTER[nextQuarter] || ['Month 1', 'Month 2', 'Month 3'];

  // ═══════════════════════════════════════════════════════════════
  // Data Loading
  // ═══════════════════════════════════════════════════════════════

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
      console.error('Error loading rocks step data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Checklist Completion
  // ═══════════════════════════════════════════════════════════════

  const hasEnoughRocks = rocks.length >= 3;
  const rocksWithOwners = rocks.filter(r => r.owner && r.owner.trim()).length;
  const hasOwnersOnRocks = rocks.length > 0 && rocksWithOwners === rocks.length;
  const hasSuccessCriteria = rocks.length > 0 && rocks.every(r => r.successCriteria && r.successCriteria.trim());
  const hasInitiativeWithTasks = Object.values(initiativeTasks).some(tasks => tasks.length > 0);
  const allComplete = hasEnoughRocks && hasOwnersOnRocks && hasSuccessCriteria;

  // ═══════════════════════════════════════════════════════════════
  // Rock CRUD
  // ═══════════════════════════════════════════════════════════════

  const addRock = useCallback((prefill?: Partial<Rock>) => {
    const newRock: Rock = {
      ...getDefaultRock(),
      id: `rock-${Date.now()}`,
      priority: rocks.length + 1,
      ...prefill,
    };
    onUpdateRocks([...rocks, newRock]);
  }, [rocks, onUpdateRocks]);

  const updateRock = useCallback((id: string, field: keyof Rock, value: unknown) => {
    onUpdateRocks(rocks.map((rock) => (rock.id === id ? { ...rock, [field]: value } : rock)));
  }, [rocks, onUpdateRocks]);

  const removeRock = useCallback((id: string) => {
    onUpdateRocks(rocks.filter((rock) => rock.id !== id).map((rock, i) => ({ ...rock, priority: i + 1 })));
  }, [rocks, onUpdateRocks]);

  // ═══════════════════════════════════════════════════════════════
  // Rock Drag & Drop
  // ═══════════════════════════════════════════════════════════════

  const handleRockDragStart = (index: number) => setDraggedIndex(index);

  const handleRockDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newRocks = [...rocks];
    const draggedRock = newRocks[draggedIndex];
    newRocks.splice(draggedIndex, 1);
    newRocks.splice(index, 0, draggedRock);
    onUpdateRocks(newRocks.map((rock, i) => ({ ...rock, priority: i + 1 })));
    setDraggedIndex(index);
  };

  const handleRockDragEnd = () => setDraggedIndex(null);

  // ═══════════════════════════════════════════════════════════════
  // Initiative Tasks & Milestones
  // ═══════════════════════════════════════════════════════════════

  const addTask = (initiativeId: string) => {
    const tasks = initiativeTasks[initiativeId] || [];
    setInitiativeTasks({
      ...initiativeTasks,
      [initiativeId]: [...tasks, { id: `task-${Date.now()}`, title: '', owner: '', dueDate: '', minutes: 0, status: 'not_started' }],
    });
  };

  const updateTask = (initiativeId: string, taskId: string, field: keyof RockTask, value: string | number) => {
    const tasks = initiativeTasks[initiativeId] || [];
    setInitiativeTasks({
      ...initiativeTasks,
      [initiativeId]: tasks.map((t) => (t.id === taskId ? { ...t, [field]: value } : t)),
    });
  };

  const removeTask = (initiativeId: string, taskId: string) => {
    const tasks = initiativeTasks[initiativeId] || [];
    setInitiativeTasks({ ...initiativeTasks, [initiativeId]: tasks.filter((t) => t.id !== taskId) });
  };

  const addMilestone = (initiativeId: string) => {
    const milestones = initiativeMilestones[initiativeId] || [];
    setInitiativeMilestones({
      ...initiativeMilestones,
      [initiativeId]: [...milestones, { id: `ms-${Date.now()}`, title: '', date: '' }],
    });
  };

  const updateMilestone = (initiativeId: string, msId: string, field: keyof Milestone, value: string) => {
    const milestones = initiativeMilestones[initiativeId] || [];
    setInitiativeMilestones({
      ...initiativeMilestones,
      [initiativeId]: milestones.map((m) => (m.id === msId ? { ...m, [field]: value } : m)),
    });
  };

  const removeMilestone = (initiativeId: string, msId: string) => {
    const milestones = initiativeMilestones[initiativeId] || [];
    setInitiativeMilestones({ ...initiativeMilestones, [initiativeId]: milestones.filter((m) => m.id !== msId) });
  };

  // ═══════════════════════════════════════════════════════════════
  // Monthly Breakdown
  // ═══════════════════════════════════════════════════════════════

  const updateMonthly = (month: 'month1' | 'month2' | 'month3', field: 'revenue' | 'grossProfit' | 'netProfit', value: number) => {
    setMonthlyBreakdown((prev) => ({ ...prev, [month]: { ...prev[month], [field]: value } }));
  };

  const monthlyTotals = useMemo(() => ({
    revenue: monthlyBreakdown.month1.revenue + monthlyBreakdown.month2.revenue + monthlyBreakdown.month3.revenue,
    grossProfit: monthlyBreakdown.month1.grossProfit + monthlyBreakdown.month2.grossProfit + monthlyBreakdown.month3.grossProfit,
    netProfit: monthlyBreakdown.month1.netProfit + monthlyBreakdown.month2.netProfit + monthlyBreakdown.month3.netProfit,
  }), [monthlyBreakdown]);

  // ═══════════════════════════════════════════════════════════════
  // Auto-Suggestions
  // ═══════════════════════════════════════════════════════════════

  const carryForwardRocks = rocksReview.filter((r) => r.decision === 'carry_forward');

  const feedbackStartItems: string[] = useMemo(() => {
    const items: string[] = [];
    if (review.feedback_loop) {
      const areas = ['marketing', 'sales', 'operations', 'finances', 'people', 'owner'] as const;
      for (const area of areas) {
        const areaData = review.feedback_loop[area];
        if (areaData?.start) items.push(...areaData.start.map((item) => `[${area}] ${item}`));
      }
    }
    return items;
  }, [review.feedback_loop]);

  const accelerationActions = useMemo(
    () => initiativeDecisions.filter((d) => d.decision === 'accelerate').map((d) => `Accelerate: ${d.title}`),
    [initiativeDecisions]
  );

  const hasSuggestions = carryForwardRocks.length > 0 || feedbackStartItems.length > 0 || accelerationActions.length > 0;

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  const getInitiativeTitle = (id: string): string => {
    const decision = initiativeDecisions.find((d) => d.initiativeId === id);
    return decision?.title || id;
  };

  const getRockCountColor = () => {
    if (rocks.length >= 3 && rocks.length <= 5) return 'text-green-700';
    if (rocks.length > 5) return 'text-amber-700';
    return 'text-gray-600';
  };

  const toggleInitiative = (id: string) => {
    setExpandedInitiative(expandedInitiative === id ? null : id);
  };

  const getAssignedMember = useCallback((name: string): TeamMember | null => {
    if (!name) return null;
    return teamMembers.find(m => m.name === name) || {
      id: `parsed-${name}`, name, initials: getInitials(name), color: getColorForName(name),
    };
  }, [teamMembers]);

  // ═══════════════════════════════════════════════════════════════
  // Tab Configuration
  // ═══════════════════════════════════════════════════════════════

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
        badge: activeInitiatives.length,
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
    return showAdvancedMode ? allTabs : allTabs.filter(t => !t.advancedOnly);
  }, [activeInitiatives.length, showAdvancedMode]);

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
              Break down your quarterly targets into monthly goals, initiatives, and operational activities
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
              <div className={`w-5 h-5 rounded flex items-center justify-center ${hasEnoughRocks && hasOwnersOnRocks ? 'bg-green-500' : 'bg-gray-300'}`}>
                {hasEnoughRocks && hasOwnersOnRocks ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">1</span>}
              </div>
              <span className={`text-sm ${hasEnoughRocks && hasOwnersOnRocks ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Define 3-5 quarterly rocks with owners ({rocks.length} rocks, {rocksWithOwners} with owners)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${hasSuccessCriteria ? 'bg-green-500' : 'bg-gray-300'}`}>
                {hasSuccessCriteria ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">2</span>}
              </div>
              <span className={`text-sm ${hasSuccessCriteria ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Set success criteria for each rock
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${hasInitiativeWithTasks ? 'bg-green-500' : 'bg-gray-300'}`}>
                {hasInitiativeWithTasks ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">3</span>}
              </div>
              <span className={`text-sm ${hasInitiativeWithTasks ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Break initiatives into tasks
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
              <h3 className="font-bold text-base">Q{nextQuarter} {nextYear} Targets</h3>
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
              {/* Rock Count */}
              <div className="pt-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rocks</h4>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Quarterly rocks</span>
                  <span className={`text-sm font-bold ${getRockCountColor()}`}>{rocks.length} / 3-5</span>
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
                      {tab.badge !== undefined && tab.badge > 0 && (
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
              nextQuarter={nextQuarter}
              nextYear={nextYear}
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
                  disabled={activeInitiatives.length >= 5}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeInitiatives.length < 5
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
                <div className={`p-4 rounded-lg border-2 ${activeInitiatives.length <= 5 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {activeInitiatives.length <= 5 ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{activeInitiatives.length} / 5 Items</div>
                      <div className="text-xs text-gray-600">Max 5 initiatives per quarter</div>
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
              {activeInitiatives.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-slate-300">
                  <Flag className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">No Initiatives Yet</h4>
                  <p className="text-sm text-gray-600 mb-4">Initiatives from Step 4.2 will appear here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeInitiatives.map((initiative, index) => {
                    const isExpanded = expandedInitiative === initiative.initiativeId;
                    const tasks = initiativeTasks[initiative.initiativeId] || [];
                    const milestones = initiativeMilestones[initiative.initiativeId] || [];
                    const catStyle = getCategoryStyle(initiative.category);
                    const totalMinutes = tasks.reduce((sum, t) => sum + (t.minutes || 0), 0);
                    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
                    const assignedMatch = initiative.notes?.match(/\[Assigned: (.+?)\]/);
                    const ownerMember = assignedMatch ? getAssignedMember(assignedMatch[1]) : null;

                    return (
                      <div key={initiative.initiativeId} className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
                        {/* Card Header */}
                        <div
                          onClick={() => toggleInitiative(initiative.initiativeId)}
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-all"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="flex items-center justify-center w-7 h-7 bg-brand-navy text-white rounded-full text-sm font-bold flex-shrink-0">
                              {index + 1}
                            </div>
                            <span className="text-lg flex-shrink-0">{catStyle.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-gray-900 leading-tight">{initiative.title}</h4>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className={`text-xs ${catStyle.textColor} font-medium`}>{catStyle.shortLabel}</span>
                                {tasks.length > 0 && (
                                  <>
                                    <span className="text-gray-300">&#183;</span>
                                    <span className="text-xs text-gray-600">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
                                  </>
                                )}
                                {totalHours > 0 && (
                                  <>
                                    <span className="text-gray-300">&#183;</span>
                                    <span className="text-xs text-gray-600">{totalHours} hours</span>
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
                                {initiative.decision === 'accelerate' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
                                    <Zap className="w-3 h-3" /> Accelerate
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 px-5 py-4 space-y-5">
                            {/* Milestones Section */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5" /> Milestones
                                </h5>
                                <button onClick={() => addMilestone(initiative.initiativeId)} className="text-xs text-brand-orange hover:text-brand-orange-600 font-medium flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Milestone
                                </button>
                              </div>
                              {milestones.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No milestones yet. Add key dates to track progress.</p>
                              ) : (
                                <div className="space-y-2">
                                  {milestones.map((ms) => (
                                    <div key={ms.id} className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-200 p-3">
                                      <input type="text" value={ms.title} onChange={(e) => updateMilestone(initiative.initiativeId, ms.id, 'title', e.target.value)} placeholder="Milestone title" className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent" />
                                      <input type="date" value={ms.date} onChange={(e) => updateMilestone(initiative.initiativeId, ms.id, 'date', e.target.value)} className="w-36 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent" />
                                      <button onClick={() => removeMilestone(initiative.initiativeId, ms.id)} className="p-1 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Task Breakdown Table */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                  <Briefcase className="w-3.5 h-3.5" /> Task Breakdown
                                </h5>
                                <button onClick={() => addTask(initiative.initiativeId)} className="text-xs text-brand-orange hover:text-brand-orange-600 font-medium flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Task
                                </button>
                              </div>
                              {tasks.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No tasks yet. Click &quot;Add Task&quot; to break this initiative into actionable steps.</p>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-gray-200">
                                  <table className="w-full">
                                    <thead>
                                      <tr className="bg-brand-navy text-white">
                                        <th className="px-3 py-2 text-left text-xs font-semibold">Task</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold">Assigned To</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold">Minutes</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold">Due Date</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold">Status</th>
                                        <th className="px-3 py-2 w-10" />
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                      {tasks.map((task) => (
                                        <tr key={task.id} className="hover:bg-gray-50">
                                          <td className="px-3 py-2">
                                            <input type="text" value={task.title} onChange={(e) => updateTask(initiative.initiativeId, task.id, 'title', e.target.value)} placeholder="Task title" className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-brand-orange focus:border-transparent" />
                                          </td>
                                          <td className="px-3 py-2">
                                            <input type="text" value={task.owner} onChange={(e) => updateTask(initiative.initiativeId, task.id, 'owner', e.target.value)} placeholder="Owner" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-brand-orange focus:border-transparent" />
                                          </td>
                                          <td className="px-3 py-2">
                                            <input type="number" value={task.minutes || ''} onChange={(e) => updateTask(initiative.initiativeId, task.id, 'minutes', parseInt(e.target.value) || 0)} placeholder="0" className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:ring-1 focus:ring-brand-orange focus:border-transparent" />
                                          </td>
                                          <td className="px-3 py-2">
                                            <input type="date" value={task.dueDate} onChange={(e) => updateTask(initiative.initiativeId, task.id, 'dueDate', e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-brand-orange focus:border-transparent" />
                                          </td>
                                          <td className="px-3 py-2">
                                            <select value={task.status} onChange={(e) => updateTask(initiative.initiativeId, task.id, 'status', e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-brand-orange">
                                              {TASK_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                          </td>
                                          <td className="px-3 py-2">
                                            <button onClick={() => removeTask(initiative.initiativeId, task.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* Quick-add rock from initiative */}
                            <div className="border-t border-gray-100 pt-3">
                              <button
                                onClick={() => addRock({ title: `Rock: ${initiative.title}`, linkedInitiatives: [initiative.initiativeId], notes: `Linked to initiative: ${initiative.title}` })}
                                className="text-sm text-brand-orange hover:text-brand-orange-600 font-medium flex items-center gap-1.5"
                              >
                                <Target className="w-3.5 h-3.5" /> Create Rock from this Initiative
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Initiative Modal */}
              {showAddInitiative && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900">Add Initiative</h3>
                      <button onClick={() => setShowAddInitiative(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                    <input
                      type="text"
                      value={newInitTitle}
                      onChange={(e) => setNewInitTitle(e.target.value)}
                      placeholder="Initiative title..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent mb-4"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newInitTitle.trim()) {
                          addRock({ title: newInitTitle.trim() });
                          setNewInitTitle('');
                          setShowAddInitiative(false);
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (newInitTitle.trim()) {
                            addRock({ title: newInitTitle.trim() });
                            setNewInitTitle('');
                            setShowAddInitiative(false);
                          }
                        }}
                        disabled={!newInitTitle.trim()}
                        className="flex-1 px-4 py-2 bg-brand-navy text-white rounded-lg font-medium hover:bg-brand-navy-700 disabled:bg-gray-200 disabled:text-gray-400"
                      >
                        Add
                      </button>
                      <button onClick={() => setShowAddInitiative(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Auto-Suggestions ─── */}
              {hasSuggestions && (
                <SuggestionsPanel
                  carryForwardRocks={carryForwardRocks}
                  feedbackStartItems={feedbackStartItems}
                  accelerationActions={accelerationActions}
                  addRock={addRock}
                />
              )}

              {/* ─── Standalone Rocks ─── */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  Quarterly Rocks ({rocks.length})
                  <span className={`ml-2 text-xs font-bold ${getRockCountColor()}`}>3-5 recommended</span>
                </h4>
              </div>

              {/* Rocks List */}
              <div className="space-y-3">
                {rocks.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-slate-300">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">No Rocks Yet</h4>
                    <p className="text-sm text-gray-600 mb-4">Add your 3-5 most important priorities for the quarter</p>
                    <button onClick={() => addRock()} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600">
                      <Plus className="w-4 h-4" /> Add First Rock
                    </button>
                  </div>
                ) : (
                  rocks.map((rock, index) => (
                    <RockCard
                      key={rock.id}
                      rock={rock}
                      index={index}
                      updateRock={updateRock}
                      removeRock={removeRock}
                      teamMembers={teamMembers}
                      activeInitiatives={activeInitiatives}
                      getInitiativeTitle={getInitiativeTitle}
                      isDragging={draggedIndex === index}
                      onDragStart={() => handleRockDragStart(index)}
                      onDragOver={(e: React.DragEvent) => handleRockDragOver(e, index)}
                      onDragEnd={handleRockDragEnd}
                    />
                  ))
                )}
              </div>

              {/* Add Rock Button */}
              {rocks.length > 0 && rocks.length < 7 && (
                <button
                  onClick={() => addRock()}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-brand-orange hover:text-brand-orange transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Add Another Rock
                </button>
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

      {/* Warning if too many rocks */}
      {rocks.length > 5 && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
          <p className="text-amber-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            You have more than 5 rocks. Consider reducing to maintain focus.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROCK CARD SUB-COMPONENT
// ═══════════════════════════════════════════════════════════════

interface RockCardProps {
  rock: Rock;
  index: number;
  updateRock: (id: string, field: keyof Rock, value: unknown) => void;
  removeRock: (id: string) => void;
  teamMembers: TeamMember[];
  activeInitiatives: QuarterlyReview['initiative_decisions'];
  getInitiativeTitle: (id: string) => string;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function RockCard({
  rock,
  index,
  updateRock,
  removeRock,
  teamMembers,
  activeInitiatives,
  getInitiativeTitle,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: RockCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-xl border-2 border-gray-200 transition-all ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      {/* Rock Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-shrink-0 cursor-grab active:cursor-grabbing mt-2">
          <GripVertical className="w-5 h-5 text-gray-400" />
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 bg-brand-orange">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={rock.title}
            onChange={(e) => updateRock(rock.id, 'title', e.target.value)}
            placeholder="Rock title - What will you achieve this quarter?"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg font-medium focus:ring-2 focus:ring-brand-orange focus:border-transparent"
          />
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <User className="w-3.5 h-3.5" /> Owner
              </label>
              <select
                value={rock.owner}
                onChange={(e) => updateRock(rock.id, 'owner', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange"
              >
                <option value="">Select owner...</option>
                {teamMembers.map((m) => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <Calendar className="w-3.5 h-3.5" /> Target Date
              </label>
              <input
                type="date"
                value={rock.targetDate || ''}
                onChange={(e) => updateRock(rock.id, 'targetDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
              <Target className="w-3.5 h-3.5" /> Success Criteria
            </label>
            <textarea
              value={rock.successCriteria || ''}
              onChange={(e) => updateRock(rock.id, 'successCriteria', e.target.value)}
              placeholder="How will you know this Rock is done?"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
            />
          </div>
          {rock.linkedInitiatives && rock.linkedInitiatives.length > 0 && (
            <div className="bg-brand-orange-50 rounded-lg px-3 py-2 text-xs text-brand-orange-700 mt-2">
              Linked to: {rock.linkedInitiatives.map(getInitiativeTitle).join(', ')}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => removeRock(rock.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 ml-16 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Linked Initiative</label>
              <select
                value={(rock.linkedInitiatives && rock.linkedInitiatives[0]) || ''}
                onChange={(e) => updateRock(rock.id, 'linkedInitiatives', e.target.value ? [e.target.value] : [])}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange"
              >
                <option value="">None</option>
                {activeInitiatives.map((init) => <option key={init.initiativeId} value={init.initiativeId}>{init.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Linked KPIs</label>
              <input
                type="text"
                value={(rock.linkedKPIs || []).join(', ')}
                onChange={(e) => updateRock(rock.id, 'linkedKPIs', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="KPI names (comma-separated)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
            <textarea
              value={rock.notes || ''}
              onChange={(e) => updateRock(rock.id, 'notes', e.target.value)}
              placeholder="Additional notes..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS PANEL
// ═══════════════════════════════════════════════════════════════

function SuggestionsPanel({
  carryForwardRocks,
  feedbackStartItems,
  accelerationActions,
  addRock,
}: {
  carryForwardRocks: QuarterlyReview['rocks_review'];
  feedbackStartItems: string[];
  accelerationActions: string[];
  addRock: (prefill?: Partial<Rock>) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-brand-orange-50 rounded-xl border border-brand-orange-200 p-5">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" /> Suggested Rocks
        </h3>
        {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </div>
      <p className="text-sm text-brand-orange-700 mt-1 mb-3">Based on your earlier workshop steps. Click to add as a Rock.</p>

      {isOpen && (
        <div className="space-y-4">
          {carryForwardRocks.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <ArrowRight className="w-3.5 h-3.5" /> Carry-Forward Rocks
              </h4>
              <div className="space-y-1">
                {carryForwardRocks.map((rock) => (
                  <div key={rock.rockId} className="flex items-center justify-between bg-white rounded-lg p-3 border border-brand-orange-200">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{rock.title}</span>
                      <span className="text-xs text-gray-500 ml-2">({rock.progressPercentage}% done)</span>
                    </div>
                    <button
                      onClick={() => addRock({ title: rock.title, owner: rock.owner, successCriteria: rock.successCriteria, notes: `Carried forward from previous quarter (was ${rock.progressPercentage}% complete)` })}
                      className="text-brand-orange hover:text-brand-orange-600 text-sm font-medium whitespace-nowrap ml-2"
                    >
                      + Add Rock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {feedbackStartItems.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> Actionable Items (Feedback Loop)
              </h4>
              <div className="space-y-1">
                {feedbackStartItems.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-brand-orange-200">
                    <span className="text-sm text-gray-700">{item}</span>
                    <button onClick={() => addRock({ title: item.replace(/^\[.*?\]\s*/, '') })} className="text-brand-orange hover:text-brand-orange-600 text-sm font-medium whitespace-nowrap ml-2">+ Add Rock</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accelerationActions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Acceleration Actions
              </h4>
              <div className="space-y-1">
                {accelerationActions.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-brand-orange-200">
                    <span className="text-sm text-gray-700">{item}</span>
                    <button onClick={() => addRock({ title: item.replace('Accelerate: ', ''), notes: 'From initiative acceleration decision' })} className="text-brand-orange hover:text-brand-orange-600 text-sm font-medium whitespace-nowrap ml-2">+ Add Rock</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
