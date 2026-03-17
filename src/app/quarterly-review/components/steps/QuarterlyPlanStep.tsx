'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { formatDollar, parseDollarInput } from '@/app/goals/utils/formatting';
import { calculateQuarters } from '@/app/goals/utils/quarters';
import { getInitials, getColorForName, parseTeamFromProfile, type TeamMember } from '@/app/goals/utils/team';
import { getCategoryStyle } from '@/app/goals/utils/design-tokens';
import type {
  QuarterlyReview,
  InitiativeDecision,
  InitiativeAction,
  QuarterlyTargets,
  InitiativesChanges,
} from '../../types';
import {
  getDefaultQuarterlyTargets,
  getDefaultInitiativesChanges,
  getCurrentQuarter,
  type YearType,
} from '../../types';
import {
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  GripVertical,
  UserPlus,
  Shuffle,
  TrendingUp,
  X,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface QuarterlyPlanStepProps {
  review: QuarterlyReview;
  onUpdateInitiativeDecisions: (decisions: InitiativeDecision[]) => void;
  onUpdateQuarterlyTargets: (targets: QuarterlyTargets) => void;
  onUpdateInitiativesChanges: (changes: InitiativesChanges) => void;
}

interface SupabaseInitiative {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  progress_percentage: number;
  quarter_assigned?: string;
  assigned_to?: string;
}

type MetricKey = 'revenue' | 'grossProfit' | 'grossMargin' | 'netProfit' | 'netMargin';

interface FinancialRow {
  key: MetricKey;
  label: string;
  isPercentage: boolean;
}

interface QuarterlyFinancials {
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
}

interface QuarterColumn {
  id: string;
  label: string;
  months: string;
  isPast: boolean;
  isCurrent: boolean;
  isNextQuarter?: boolean;
  quarterNum: number;
  year: number;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const FINANCIAL_ROWS: FinancialRow[] = [
  { key: 'revenue', label: 'Revenue', isPercentage: false },
  { key: 'grossProfit', label: 'Gross Profit', isPercentage: false },
  { key: 'grossMargin', label: 'GP Margin %', isPercentage: true },
  { key: 'netProfit', label: 'Net Profit', isPercentage: false },
  { key: 'netMargin', label: 'NP Margin %', isPercentage: true },
];

const DECISION_OPTIONS: { value: InitiativeAction; label: string; activeColor: string; bgChip: string }[] = [
  { value: 'keep', label: 'Keep', activeColor: 'bg-green-100 text-green-700 border-green-300', bgChip: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'accelerate', label: 'Accelerate', activeColor: 'bg-blue-100 text-blue-700 border-blue-300', bgChip: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'defer', label: 'Defer', activeColor: 'bg-amber-100 text-amber-700 border-amber-300', bgChip: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'kill', label: 'Kill', activeColor: 'bg-red-100 text-red-700 border-red-300', bgChip: 'bg-red-50 text-red-700 border-red-200' },
];

const MAX_PER_QUARTER = 5;
const MAX_PER_PERSON = 3;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toLocaleString('en-AU')}`;
}

function parseCurrencyInput(value: string): number {
  return parseInt(value.replace(/[$,\s]/g, '')) || 0;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export function QuarterlyPlanStep({
  review,
  onUpdateInitiativeDecisions,
  onUpdateQuarterlyTargets,
  onUpdateInitiativesChanges,
}: QuarterlyPlanStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  // ─── State ──────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<SupabaseInitiative[]>([]);
  const [yearType, setYearType] = useState<YearType>('CY');
  const [planYear, setPlanYear] = useState<number>(new Date().getFullYear());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showAddForm, setShowAddForm] = useState<string | null>(null);
  const [newInitTitle, setNewInitTitle] = useState('');
  const [newInitCategory, setNewInitCategory] = useState('marketing');
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(true);

  // Financial table state
  const [quarterFinancials, setQuarterFinancials] = useState<Record<string, QuarterlyFinancials>>({});
  const [annualTargets, setAnnualTargets] = useState<{ revenue: number; grossProfit: number; netProfit: number }>({
    revenue: 0, grossProfit: 0, netProfit: 0,
  });

  // Accordion expand state
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set());

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{ initiativeId: string; sourceQuarter: string } | null>(null);
  const [dragOverQuarter, setDragOverQuarter] = useState<string | null>(null);

  // ─── Derived State from Review ──────────────────────────────
  const decisions = review.initiative_decisions || [];
  const targets = { ...getDefaultQuarterlyTargets(), ...(review.quarterly_targets || {}) };
  const changes = { ...getDefaultInitiativesChanges(), ...(review.initiatives_changes || {}) };
  const snapshot = review.annual_plan_snapshot;
  const realignment = review.realignment_decision;

  // ─── Quarter Calculation ────────────────────────────────────
  const quarterColumns = useMemo((): QuarterColumn[] => {
    const quarters = calculateQuarters(yearType, planYear);
    return quarters.map((q) => ({
      id: q.id,
      label: q.label,
      months: q.months,
      isPast: q.isPast,
      isCurrent: q.isCurrent,
      isNextQuarter: q.isNextQuarter,
      quarterNum: parseInt(q.id.replace('q', '')),
      year: planYear,
    }));
  }, [yearType, planYear]);

  // Init expanded quarters: all expanded by default (matching Step 4)
  useEffect(() => {
    if (quarterColumns.length > 0 && expandedQuarters.size === 0) {
      const expanded = new Set<string>();
      quarterColumns.forEach((q) => {
        expanded.add(q.id);
      });
      setExpandedQuarters(expanded);
    }
  }, [quarterColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Keyboard Shortcuts (press 1-4 to toggle quarters) ─────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
          toggleQuarter(`q${e.key}`);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Group Initiatives by Quarter ───────────────────────────
  const initiativesByQuarter = useMemo(() => {
    const grouped: Record<string, InitiativeDecision[]> = {};
    for (const q of quarterColumns) grouped[q.id] = [];
    grouped['unassigned'] = [];

    for (const d of decisions) {
      const qKey = d.quarterAssigned || 'unassigned';
      if (grouped[qKey]) grouped[qKey].push(d);
      else grouped['unassigned'].push(d);
    }
    return grouped;
  }, [decisions, quarterColumns]);

  // ─── Decision Stats ─────────────────────────────────────────
  const stats = useMemo(() => ({
    keep: decisions.filter(d => d.decision === 'keep').length,
    accelerate: decisions.filter(d => d.decision === 'accelerate').length,
    defer: decisions.filter(d => d.decision === 'defer').length,
    kill: decisions.filter(d => d.decision === 'kill').length,
    total: decisions.length,
  }), [decisions]);

  // ─── Checklist Completion ──────────────────────────────────
  const hasEditedTargets = useMemo(() => {
    return Object.values(quarterFinancials).some((qf) =>
      qf.revenue > 0 || qf.grossProfit > 0 || qf.netProfit > 0
    );
  }, [quarterFinancials]);

  const allInitiativesHaveQuarter = useMemo(() => {
    return decisions.length > 0 && decisions.every((d) => d.quarterAssigned && d.quarterAssigned !== 'unassigned');
  }, [decisions]);

  const allInitiativesHaveDecision = useMemo(() => {
    return decisions.length > 0 && decisions.every((d) => d.decision);
  }, [decisions]);

  const allComplete = hasEditedTargets && allInitiativesHaveQuarter && allInitiativesHaveDecision;

  // ─── Assignment counts per person per quarter ───────────────
  const assignmentCountsByQuarter = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    quarterColumns.forEach((q) => {
      counts[q.id] = {};
      const qInits = initiativesByQuarter[q.id] || [];
      qInits.forEach((d) => {
        const member = getAssignedMemberFromDecision(d);
        if (member) {
          counts[q.id][member.name] = (counts[q.id][member.name] || 0) + 1;
        }
      });
    });
    return counts;
  }, [initiativesByQuarter, quarterColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Annual Totals for Financial Table ─────────────────────
  const annualTotals = useMemo((): QuarterlyFinancials => {
    const totals: QuarterlyFinancials = { revenue: 0, grossProfit: 0, grossMargin: 0, netProfit: 0, netMargin: 0 };
    quarterColumns.forEach((q) => {
      const qf = quarterFinancials[q.id];
      if (qf) {
        totals.revenue += qf.revenue;
        totals.grossProfit += qf.grossProfit;
        totals.netProfit += qf.netProfit;
      }
    });
    totals.grossMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;
    totals.netMargin = totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0;
    return totals;
  }, [quarterFinancials, quarterColumns]);

  // ─── Reconciliation ────────────────────────────────────────
  const reconciliation = useMemo(() => {
    if (!snapshot || snapshot.annualTargets.revenue === 0) return null;

    const annualTarget = realignment?.choice === 'adjust_targets' && realignment.adjustedTargets
      ? realignment.adjustedTargets.revenue
      : snapshot.annualTargets.revenue;

    const totalPlannedRevenue = quarterColumns.reduce((sum, q) => sum + (quarterFinancials[q.id]?.revenue || 0), 0);
    const projected = totalPlannedRevenue > 0
      ? totalPlannedRevenue
      : (snapshot.ytdActuals.revenue || 0) + targets.revenue * (snapshot.remainingQuarters || 1);

    return { onTrack: projected >= annualTarget, projected, annual: annualTarget };
  }, [snapshot, realignment, quarterFinancials, quarterColumns, targets.revenue]);

  // ═══════════════════════════════════════════════════════════════
  // Data Fetching
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const targetUserId = activeBusiness?.ownerId || user.id;

      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id, key_roles, owner_info')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const businessId = profile?.id || review.business_id;

      // Load Year Type + Goals
      const { data: goalsData } = await supabase
        .from('business_financial_goals')
        .select('year_type, revenue_year1, gross_profit_year1, net_profit_year1, plan_year')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const resolvedYearType: YearType = goalsData?.year_type || 'CY';
      setYearType(resolvedYearType);

      if (goalsData?.plan_year) {
        setPlanYear(goalsData.plan_year);
      } else {
        const now = new Date();
        if (resolvedYearType === 'FY') {
          setPlanYear(now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear());
        } else {
          setPlanYear(now.getFullYear());
        }
      }

      if (goalsData) {
        setAnnualTargets({
          revenue: goalsData.revenue_year1 || 0,
          grossProfit: goalsData.gross_profit_year1 || 0,
          netProfit: goalsData.net_profit_year1 || 0,
        });
      }

      // Load Team Members
      if (profile) {
        const members = parseTeamFromProfile(
          {
            owner_info: profile.owner_info as { owner_name?: string } | undefined,
            key_roles: profile.key_roles as Array<{ name: string; role?: string }> | undefined,
          },
          businessId
        );
        if (members.length > 0) setTeamMembers(members);
      }

      // Load Strategic Initiatives
      const { data: initiativesData } = await supabase
        .from('strategic_initiatives')
        .select('id, title, description, category, status, progress_percentage, quarter_assigned, assigned_to')
        .eq('business_id', businessId)
        .in('status', ['in_progress', 'not_started'])
        .order('created_at', { ascending: false });

      if (initiativesData) {
        setInitiatives(initiativesData);

        if (decisions.length === 0 && initiativesData.length > 0) {
          const actualQ = getCurrentQuarter(resolvedYearType);
          const initialDecisions: InitiativeDecision[] = initiativesData.map((i) => {
            let qAssigned = 'unassigned';
            if (i.quarter_assigned) {
              const match = i.quarter_assigned.match(/[Qq](\d)/);
              if (match) qAssigned = `q${match[1]}`;
            }
            return {
              initiativeId: i.id,
              title: i.title,
              category: i.category || 'marketing',
              currentStatus: i.status || 'active',
              progressPercentage: i.progress_percentage || 0,
              decision: 'keep' as InitiativeAction,
              notes: '',
              quarterAssigned: qAssigned,
            };
          });
          onUpdateInitiativeDecisions(initialDecisions);
        }
      }

      // Load Quarterly Actuals from Snapshots
      const { data: snapshots } = await supabase
        .from('quarterly_snapshots')
        .select('snapshot_quarter, snapshot_year, financial_snapshot')
        .eq('business_id', businessId)
        .eq('snapshot_year', goalsData?.plan_year || new Date().getFullYear());

      const loadedFinancials: Record<string, QuarterlyFinancials> = {};

      if (snapshots && snapshots.length > 0) {
        snapshots.forEach((snap: any) => {
          const qId = `q${snap.snapshot_quarter}`;
          const fin = snap.financial_snapshot as any;
          if (fin) {
            const revenue = fin.revenue || fin.revenue_actual || 0;
            const grossProfit = fin.grossProfit || fin.gross_profit_actual || 0;
            const netProfit = fin.netProfit || fin.net_profit_actual || 0;
            loadedFinancials[qId] = {
              revenue,
              grossProfit,
              grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
              netProfit,
              netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
            };
          }
        });
      }

      // Pre-populate current/future quarters from run-rate if empty
      const quarters = calculateQuarters(resolvedYearType, goalsData?.plan_year || new Date().getFullYear());
      quarters.forEach((q) => {
        if (!loadedFinancials[q.id] && !q.isPast) {
          let sugR = 0, sugGP = 0, sugNP = 0;
          if (realignment?.choice === 'adjust_targets' && realignment.adjustedTargets) {
            sugR = Math.round(realignment.adjustedTargets.revenue / 4);
            sugGP = Math.round(realignment.adjustedTargets.grossProfit / 4);
            sugNP = Math.round(realignment.adjustedTargets.netProfit / 4);
          } else if (snapshot && snapshot.remainingQuarters > 0) {
            sugR = snapshot.runRateNeeded.revenue;
            sugGP = snapshot.runRateNeeded.grossProfit;
            sugNP = snapshot.runRateNeeded.netProfit;
          } else if (goalsData) {
            sugR = Math.round((goalsData.revenue_year1 || 0) / 4);
            sugGP = Math.round((goalsData.gross_profit_year1 || 0) / 4);
            sugNP = Math.round((goalsData.net_profit_year1 || 0) / 4);
          }
          loadedFinancials[q.id] = {
            revenue: sugR,
            grossProfit: sugGP,
            grossMargin: sugR > 0 ? (sugGP / sugR) * 100 : 0,
            netProfit: sugNP,
            netMargin: sugR > 0 ? (sugNP / sugR) * 100 : 0,
          };
        }
      });

      setQuarterFinancials(loadedFinancials);

      // Sync quarterly_targets with the relevant quarter data
      const currentQ = quarters.find(q => q.isCurrent);
      const nextQ = quarters.find(q => q.isNextQuarter) || (currentQ ? quarters[quarters.indexOf(currentQ) + 1] : null);
      const relevantQ = nextQ || currentQ;

      if (relevantQ && loadedFinancials[relevantQ.id]) {
        const qf = loadedFinancials[relevantQ.id];
        if (targets.revenue === 0 && targets.grossProfit === 0 && targets.netProfit === 0) {
          onUpdateQuarterlyTargets({
            ...targets,
            revenue: qf.revenue,
            grossProfit: qf.grossProfit,
            netProfit: qf.netProfit,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching quarterly plan data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Financial Table Handlers
  // ═══════════════════════════════════════════════════════════════

  const updateFinancialCell = useCallback((quarterId: string, metricKey: MetricKey, rawValue: string) => {
    setQuarterFinancials((prev) => {
      const existing = prev[quarterId] || { revenue: 0, grossProfit: 0, grossMargin: 0, netProfit: 0, netMargin: 0 };
      const updated = { ...existing };

      if (metricKey === 'grossMargin' || metricKey === 'netMargin') {
        const percentValue = parseFloat(rawValue) || 0;
        updated[metricKey] = percentValue;
        if (metricKey === 'grossMargin' && updated.revenue > 0) {
          updated.grossProfit = Math.round(updated.revenue * (percentValue / 100));
        } else if (metricKey === 'netMargin' && updated.revenue > 0) {
          updated.netProfit = Math.round(updated.revenue * (percentValue / 100));
        }
      } else {
        const dollarValue = parseCurrencyInput(rawValue);
        updated[metricKey] = dollarValue;
        if (metricKey === 'revenue') {
          if (updated.grossProfit > 0) updated.grossMargin = (updated.grossProfit / dollarValue) * 100;
          if (updated.netProfit > 0) updated.netMargin = (updated.netProfit / dollarValue) * 100;
        } else if (metricKey === 'grossProfit' && updated.revenue > 0) {
          updated.grossMargin = (dollarValue / updated.revenue) * 100;
        } else if (metricKey === 'netProfit' && updated.revenue > 0) {
          updated.netMargin = (dollarValue / updated.revenue) * 100;
        }
      }

      const next = { ...prev, [quarterId]: updated };

      // Sync quarterly_targets with the relevant quarter
      const currentQ = quarterColumns.find(q => q.isCurrent);
      const nextQCol = currentQ ? quarterColumns[quarterColumns.indexOf(currentQ) + 1] : quarterColumns[0];
      const relevantQ = nextQCol || currentQ;
      if (relevantQ && quarterId === relevantQ.id) {
        onUpdateQuarterlyTargets({ ...targets, revenue: updated.revenue, grossProfit: updated.grossProfit, netProfit: updated.netProfit });
      }

      return next;
    });
  }, [quarterColumns, targets, onUpdateQuarterlyTargets]);

  // ═══════════════════════════════════════════════════════════════
  // Initiative Decision Handlers
  // ═══════════════════════════════════════════════════════════════

  const updateDecision = useCallback((initiativeId: string, field: keyof InitiativeDecision, value: string | number) => {
    onUpdateInitiativeDecisions(decisions.map((d) => d.initiativeId === initiativeId ? { ...d, [field]: value } : d));
  }, [decisions, onUpdateInitiativeDecisions]);

  const assignTeamMember = useCallback((initiativeId: string, memberName: string) => {
    // Replace existing [Assigned: ...] tag or add new one
    onUpdateInitiativeDecisions(decisions.map((d) => {
      if (d.initiativeId !== initiativeId) return d;
      const notesWithoutAssignment = (d.notes || '').replace(/\s*\[Assigned: .+?\]/g, '').trim();
      const newNotes = notesWithoutAssignment
        ? `${notesWithoutAssignment} [Assigned: ${memberName}]`
        : `[Assigned: ${memberName}]`;
      return { ...d, notes: newNotes };
    }));
    setShowAssignmentFor(null);
  }, [decisions, onUpdateInitiativeDecisions]);

  const moveInitiative = useCallback((initiativeId: string, toQuarterId: string) => {
    onUpdateInitiativeDecisions(decisions.map((d) => d.initiativeId === initiativeId ? { ...d, quarterAssigned: toQuarterId } : d));
    const decision = decisions.find(d => d.initiativeId === initiativeId);
    if (decision) {
      onUpdateInitiativesChanges({
        ...changes,
        deferred: [...changes.deferred.filter(x => x.id !== initiativeId), { id: initiativeId, toQuarter: toQuarterId }],
      });
    }
  }, [decisions, changes, onUpdateInitiativeDecisions, onUpdateInitiativesChanges]);

  const addNewInitiative = useCallback((quarterId: string) => {
    if (!newInitTitle.trim()) return;
    const newDecision: InitiativeDecision = {
      initiativeId: `new-${Date.now()}`,
      title: newInitTitle.trim(),
      category: newInitCategory,
      currentStatus: 'not_started',
      progressPercentage: 0,
      decision: 'keep',
      notes: '',
      quarterAssigned: quarterId,
    };
    onUpdateInitiativeDecisions([...decisions, newDecision]);
    onUpdateInitiativesChanges({
      ...changes,
      added: [...changes.added, { title: newInitTitle.trim(), category: newInitCategory }],
    });
    setNewInitTitle('');
    setNewInitCategory('marketing');
    setShowAddForm(null);
  }, [newInitTitle, newInitCategory, decisions, changes, onUpdateInitiativeDecisions, onUpdateInitiativesChanges]);

  const removeInitiative = useCallback((initiativeId: string) => {
    onUpdateInitiativeDecisions(decisions.filter((d) => d.initiativeId !== initiativeId));
    if (initiativeId.startsWith('new-') || initiativeId.startsWith('suggestion-')) {
      onUpdateInitiativesChanges({
        ...changes,
        added: changes.added.filter(a => a.title !== decisions.find(d => d.initiativeId === initiativeId)?.title),
      });
    } else {
      onUpdateInitiativesChanges({ ...changes, removed: [...changes.removed, initiativeId] });
    }
  }, [decisions, changes, onUpdateInitiativeDecisions, onUpdateInitiativesChanges]);

  // ═══════════════════════════════════════════════════════════════
  // Drag & Drop Handlers
  // ═══════════════════════════════════════════════════════════════

  const handleDragStart = useCallback((e: React.DragEvent, initiativeId: string, sourceQuarter: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', initiativeId);
    setDraggedItem({ initiativeId, sourceQuarter });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, quarterId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverQuarter(quarterId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDragOverQuarter(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetQuarter: string) => {
    e.preventDefault();
    setDragOverQuarter(null);
    if (!draggedItem) return;
    if (draggedItem.sourceQuarter === targetQuarter) { setDraggedItem(null); return; }
    moveInitiative(draggedItem.initiativeId, targetQuarter);
    setDraggedItem(null);
  }, [draggedItem, moveInitiative]);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverQuarter(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Distribute by Priority
  // ═══════════════════════════════════════════════════════════════

  const distributeByPriority = useCallback(() => {
    const futureQuarters = quarterColumns.filter(q => !q.isPast);
    if (futureQuarters.length === 0) return;

    const unassigned = decisions.filter(d => !d.quarterAssigned || d.quarterAssigned === 'unassigned');
    if (unassigned.length === 0) return;

    const updated = [...decisions];
    let qIdx = 0;
    const counts: Record<string, number> = {};
    futureQuarters.forEach(q => { counts[q.id] = (initiativesByQuarter[q.id] || []).length; });

    for (const d of unassigned) {
      const targetQ = futureQuarters[qIdx % futureQuarters.length];
      const idx = updated.findIndex(u => u.initiativeId === d.initiativeId);
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], quarterAssigned: targetQ.id };
        counts[targetQ.id]++;
      }
      qIdx++;
    }
    onUpdateInitiativeDecisions(updated);
  }, [decisions, quarterColumns, initiativesByQuarter, onUpdateInitiativeDecisions]);

  // ═══════════════════════════════════════════════════════════════
  // Helper: Get assigned team member (from notes pattern)
  // ═══════════════════════════════════════════════════════════════

  function getAssignedMemberFromDecision(decision: InitiativeDecision): TeamMember | null {
    const match = decision.notes?.match(/\[Assigned: (.+?)\]/);
    if (match) {
      const name = match[1];
      return teamMembers.find(m => m.name === name) || {
        id: `parsed-${name}`, name, initials: getInitials(name), color: getColorForName(name),
      };
    }
    return null;
  }

  const getAssignedMember = useCallback((decision: InitiativeDecision): TeamMember | null => {
    return getAssignedMemberFromDecision(decision);
  }, [teamMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════
  // Quarter helpers
  // ═══════════════════════════════════════════════════════════════

  const getQuarterStatusColor = (q: QuarterColumn) => {
    const items = initiativesByQuarter[q.id] || [];
    const count = items.length;
    if (q.isPast) return 'bg-gray-100 border-gray-300 opacity-70';
    if (count >= MAX_PER_QUARTER) return 'bg-amber-50 border-amber-300';
    if (count > 0) return 'bg-brand-orange-50 border-brand-orange-300';
    return 'bg-gray-50 border-slate-200';
  };

  const toggleQuarter = (qId: string) => {
    setExpandedQuarters(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // Render: Loading State
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
      <div className="bg-gradient-to-r from-brand-orange to-brand-orange-700 rounded-lg p-4 text-white">
        <p className="text-base font-medium">
          {'\u{1F4CB}'} <strong>YOUR TASK:</strong> Complete both sections below to finish Step 4.2
        </p>
        <p className="text-sm text-brand-orange-100 mt-1">
          Set your quarterly targets, then assign initiatives to each planning quarter.
        </p>
      </div>

      {/* ═══════════════════ REQUIREMENTS CHECKLIST ═══════════════════ */}
      <div className={`rounded-lg border-2 p-4 ${allComplete ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-200'}`}>
        <button
          onClick={() => setShowChecklist(!showChecklist)}
          className="w-full flex items-center justify-between"
        >
          <h4 className={`text-sm font-bold ${allComplete ? 'text-green-800' : 'text-amber-800'}`}>
            {allComplete ? '\u2713 All Requirements Complete!' : 'Step 4.2 Requirements'}
          </h4>
          {showChecklist ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showChecklist && (
          <div className="space-y-2 mt-3">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${hasEditedTargets ? 'bg-green-500' : 'bg-gray-300'}`}>
                {hasEditedTargets ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">1</span>}
              </div>
              <span className={`text-sm ${hasEditedTargets ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Review financial targets for remaining quarters
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${allInitiativesHaveQuarter ? 'bg-green-500' : 'bg-gray-300'}`}>
                {allInitiativesHaveQuarter ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">2</span>}
              </div>
              <span className={`text-sm ${allInitiativesHaveQuarter ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Review initiative assignments
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${allInitiativesHaveDecision ? 'bg-green-500' : 'bg-gray-300'}`}>
                {allInitiativesHaveDecision ? <Check className="w-3 h-3 text-white" /> : <span className="text-white text-xs font-bold">3</span>}
              </div>
              <span className={`text-sm ${allInitiativesHaveDecision ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                Make decisions on each initiative
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════ SECTION 1: FINANCIAL TARGETS TABLE ═══════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${hasEditedTargets ? 'bg-green-500 text-white' : 'bg-brand-orange text-white'}`}>
            {hasEditedTargets ? <Check className="w-5 h-5" /> : '1'}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-brand-navy">Financial Targets</h3>
            <p className="text-sm text-gray-600">Break down your annual targets across quarters</p>
          </div>
          {hasEditedTargets && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
              {'\u2713'} Complete
            </span>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="p-6">
            <p className="text-xs text-gray-600 mb-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <strong>Actual</strong> — Enter your actual results for completed quarters
              </span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                <strong>Current</strong> — Enter your results to date
              </span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-brand-orange" />
                <strong>Planning</strong> — Set your targets
              </span>
            </p>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-200" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '12%' }} />
                  {quarterColumns.map((q) => (
                    <col key={q.id} style={{ width: '13%' }} />
                  ))}
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-brand-navy border-b border-r border-slate-200">Metric</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-r border-slate-200">
                      {yearType} {planYear}
                    </th>
                    {quarterColumns.map(q => (
                      <th
                        key={q.id}
                        className={`px-4 py-3 text-center text-sm font-semibold border-b border-r border-slate-200 ${
                          q.isPast ? 'bg-green-50 text-green-800' : q.isCurrent ? 'bg-amber-50 text-amber-800' : 'text-brand-navy'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <span>{q.label}</span>
                            {q.isPast && <span className="text-[9px] px-1 py-0.5 bg-green-500 text-white rounded font-semibold">ACTUAL</span>}
                            {q.isCurrent && !q.isPast && <span className="text-[9px] px-1 py-0.5 bg-amber-500 text-white rounded font-semibold">CURRENT</span>}
                            {q.isNextQuarter && <span className="text-[9px] px-1 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLANNING</span>}
                          </div>
                          <span className="text-[10px] font-normal text-gray-500">{q.months}</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-sm font-semibold text-brand-navy border-b border-slate-200">Q Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {FINANCIAL_ROWS.map((row) => {
                    const annualGoal = row.key === 'revenue'
                      ? annualTargets.revenue
                      : row.key === 'grossProfit'
                      ? annualTargets.grossProfit
                      : row.key === 'netProfit'
                      ? annualTargets.netProfit
                      : 0;

                    const totalVal = annualTotals[row.key];
                    const variance = !row.isPercentage && annualGoal > 0 ? totalVal - annualGoal : 0;
                    const isValid = annualGoal > 0 ? Math.abs(variance / annualGoal) * 100 < 5 : true;

                    return (
                      <tr key={row.key}>
                        <td className="px-4 py-3 text-sm font-medium text-brand-navy border-r border-slate-200">
                          {row.label}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 font-medium border-r border-slate-200 text-center">
                          {row.isPercentage
                            ? (annualGoal > 0 ? `${annualGoal}%` : '-')
                            : (annualGoal > 0 ? formatCurrency(annualGoal) : '-')
                          }
                        </td>
                        {quarterColumns.map(q => {
                          const qf = quarterFinancials[q.id] || { revenue: 0, grossProfit: 0, grossMargin: 0, netProfit: 0, netMargin: 0 };
                          const cellValue = qf[row.key];

                          return (
                            <td
                              key={q.id}
                              className={`px-4 py-2 border-r border-slate-200 ${
                                q.isPast ? 'bg-green-50' : q.isCurrent ? 'bg-amber-50' : ''
                              }`}
                            >
                              <input
                                type="text"
                                value={
                                  row.isPercentage
                                    ? (cellValue ? `${cellValue.toFixed(1)}%` : '')
                                    : (cellValue ? formatDollar(cellValue) : '')
                                }
                                onChange={(e) => {
                                  if (row.isPercentage) {
                                    updateFinancialCell(q.id, row.key, e.target.value.replace('%', ''));
                                  } else {
                                    updateFinancialCell(q.id, row.key, parseDollarInput(e.target.value).toString());
                                  }
                                }}
                                placeholder={q.isPast || q.isCurrent ? 'Actual' : row.isPercentage ? '0%' : 'Target'}
                                className={`w-full px-2 py-2 border rounded-md text-sm text-center font-medium focus:outline-none transition-colors ${
                                  q.isPast
                                    ? 'border-green-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-400'
                                    : q.isCurrent
                                    ? 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-400'
                                    : 'border-gray-300 focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300'
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className={`px-4 py-3 text-sm text-center font-medium ${
                          row.isPercentage ? 'text-gray-700' :
                          totalVal === 0 ? 'text-slate-400' :
                          isValid ? 'bg-green-50 text-green-700' :
                          variance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {row.isPercentage ? (
                            totalVal > 0 ? `${totalVal.toFixed(1)}% avg` : <span className="text-xs text-slate-400">-</span>
                          ) : totalVal > 0 ? (
                            <div>
                              <div className="font-semibold">{formatCurrency(totalVal)}</div>
                              {annualGoal > 0 && (
                                <div className="text-xs mt-0.5">
                                  {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                                  {isValid && ' \u2713'}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs">Not set</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reconciliation Bar */}
            {reconciliation && (
              <div className={`mt-4 rounded-lg p-3 flex items-center gap-2 text-sm ${
                reconciliation.onTrack ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}>
                {reconciliation.onTrack
                  ? <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  : <ChevronUp className="w-4 h-4 text-amber-600 flex-shrink-0" />
                }
                <p>
                  Annual target: <strong>{formatCurrency(reconciliation.annual)}</strong> | Current plan total: <strong>{formatCurrency(reconciliation.projected)}</strong> | Variance: <strong>{reconciliation.onTrack ? '+' : ''}{formatCurrency(reconciliation.projected - reconciliation.annual)}</strong>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════ DECISION SUMMARY CHIPS ═══════════════════ */}
      {stats.total > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-600">Decisions:</span>
          {stats.keep > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">{stats.keep} keep</span>}
          {stats.accelerate > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{stats.accelerate} accelerate</span>}
          {stats.defer > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{stats.defer} defer</span>}
          {stats.kill > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{stats.kill} kill</span>}
        </div>
      )}

      {/* ═══════════════════ SECTION 2: INITIATIVE KANBAN ═══════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${allInitiativesHaveQuarter ? 'bg-green-500 text-white' : 'bg-brand-orange text-white'}`}>
            {allInitiativesHaveQuarter ? <Check className="w-5 h-5" /> : '2'}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-brand-navy">Quarterly Execution Plan</h3>
            <p className="text-sm text-gray-600">Assign initiatives to quarters (Max {MAX_PER_QUARTER} per quarter)</p>
          </div>
          {allInitiativesHaveQuarter && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
              {'\u2713'} Complete
            </span>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="p-6">
            {/* Quarter Status Overview (inside kanban section, matching Step 4) */}
            {decisions.length > 0 && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-slate-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Quarter Status Overview</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {quarterColumns.map((q) => {
                    const qInits = initiativesByQuarter[q.id] || [];
                    const activeCount = qInits.filter(d => d.decision !== 'kill').length;
                    const assignedCount = qInits.filter(d => getAssignedMember(d)).length;
                    const isComplete = qInits.length > 0 && assignedCount === qInits.length;
                    const isEmpty = qInits.length === 0;
                    const isFull = qInits.length >= MAX_PER_QUARTER;

                    return (
                      <div
                        key={q.id}
                        className={`p-3 rounded-lg border-2 ${
                          q.isPast
                            ? 'bg-gray-100 border-gray-300 opacity-60'
                            : isEmpty
                            ? 'bg-amber-50 border-amber-200'
                            : isComplete
                            ? 'bg-green-50 border-green-300'
                            : 'bg-brand-orange-50 border-brand-orange-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-brand-navy">{q.label}</span>
                          {q.isPast && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-green-500 text-white rounded font-semibold">ACTUAL</span>
                          )}
                          {q.isCurrent && !q.isPast && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-amber-500 text-white rounded font-semibold">CURRENT</span>
                          )}
                          {q.isNextQuarter && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLAN NOW</span>
                          )}
                          {!q.isPast && !q.isCurrent && !q.isNextQuarter && isComplete && (
                            <Check className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-medium ${
                            isEmpty ? 'text-amber-700' : isComplete ? 'text-green-700' : 'text-gray-600'
                          }`}>
                            {activeCount}/{MAX_PER_QUARTER} initiatives
                          </span>
                          {qInits.length > 0 && (
                            <span className={`${assignedCount === qInits.length ? 'text-green-600' : 'text-amber-600'}`}>
                              {'\u2022'} {assignedCount}/{qInits.length} assigned
                            </span>
                          )}
                        </div>
                        {isEmpty && !q.isPast && (
                          <p className="text-[10px] text-amber-600 mt-1">Needs initiatives</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Batch Actions */}
            {decisions.length > 0 && (
              <div className="flex items-center justify-end gap-2 mb-4">
                {(initiativesByQuarter['unassigned'] || []).length > 0 && (
                  <>
                    <button
                      onClick={distributeByPriority}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-orange-50 text-brand-orange-700 rounded hover:bg-brand-orange-100 font-medium transition-colors"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      By Priority
                    </button>
                    <button
                      onClick={distributeByPriority}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-navy text-white rounded text-xs font-medium hover:bg-brand-navy-700 transition-colors"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      Distribute All
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Keyboard Hints */}
            {decisions.length > 0 && (
              <p className="text-xs text-gray-500 mb-4">
                {'\u{1F4A1}'} Shortcuts: Press 1-4 to toggle quarters
              </p>
            )}

            {/* Empty State */}
            {decisions.length === 0 && initiatives.length === 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-600">No strategic initiatives found.</p>
                <p className="text-sm text-gray-500 mt-1">
                  Add initiatives using the &quot;Add Initiative&quot; buttons on each quarter panel below.
                </p>
              </div>
            )}

            {/* ═══════════════════ KANBAN GRID (5-column layout matching Step 4) ═══════════════════ */}
            {decisions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {/* ─── Available Column (first) ─── */}
                <div className="md:col-span-2 lg:col-span-4 xl:col-span-1">
                  <div
                    className={`bg-gray-50 rounded-lg border-2 border-dashed p-4 h-full transition-colors ${
                      dragOverQuarter === 'unassigned' ? 'border-brand-orange bg-brand-orange-50' : 'border-slate-300'
                    }`}
                    onDragOver={(e) => handleDragOver(e, 'unassigned')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'unassigned')}
                  >
                    <h4 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wider">
                      Available
                    </h4>
                    <p className="text-xs text-gray-500 mb-3">
                      {(initiativesByQuarter['unassigned'] || []).length} unassigned
                    </p>
                    <div className="space-y-2">
                      {(initiativesByQuarter['unassigned'] || []).length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-6">
                          All initiatives assigned {'\u2713'}
                        </p>
                      ) : (
                        (initiativesByQuarter['unassigned'] || []).map((d, index) => {
                          const catStyle = getCategoryStyle(d.category);
                          return (
                            <div
                              key={d.initiativeId}
                              draggable
                              onDragStart={(e) => handleDragStart(e, d.initiativeId, 'unassigned')}
                              onDragEnd={handleDragEnd}
                              className={`group flex items-start gap-2 p-3 rounded-lg border-2 cursor-move transition-all bg-white border-gray-200 hover:shadow-md ${
                                draggedItem?.initiativeId === d.initiativeId ? 'opacity-40 scale-95 shadow-lg' : ''
                              } ${d.decision === 'kill' ? 'opacity-60 bg-red-50 border-red-200' : ''}`}
                            >
                              <GripVertical className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-300 group-hover:text-gray-500" />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold leading-tight ${d.decision === 'kill' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                  {d.title}
                                </p>
                                <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] rounded font-semibold ${catStyle.badgeBg} ${catStyle.badgeText}`}>
                                  {catStyle.emoji} {catStyle.shortLabel}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* ─── Quarter Columns ─── */}
                {quarterColumns.map((q) => {
                  const qInitiatives = initiativesByQuarter[q.id] || [];
                  const isExpanded = expandedQuarters.has(q.id);
                  const isFull = qInitiatives.length >= MAX_PER_QUARTER;
                  const isDragTarget = dragOverQuarter === q.id;

                  return (
                    <div key={q.id} className="lg:col-span-1">
                      <div
                        className={`rounded-lg border-2 p-4 min-h-96 transition-all ${
                          isDragTarget
                            ? 'border-brand-orange ring-2 ring-brand-orange/30 bg-brand-orange-50'
                            : q.isNextQuarter
                            ? 'bg-brand-orange-50 border-brand-orange-300 ring-2 ring-brand-orange-200'
                            : getQuarterStatusColor(q)
                        }`}
                        onDragOver={(e) => handleDragOver(e, q.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, q.id)}
                      >
                        {/* Quarter Header */}
                        <button
                          onClick={() => toggleQuarter(q.id)}
                          className="w-full text-left mb-4 pb-3 border-b border-current border-opacity-20"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className={`font-bold text-sm uppercase tracking-wider ${q.isPast ? 'text-gray-500' : 'text-brand-navy'}`}>
                                  {q.label}
                                </h4>
                                {q.isPast && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-green-500 text-white rounded font-semibold">PAST</span>
                                )}
                                {q.isCurrent && !q.isPast && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white rounded font-semibold">CURRENT</span>
                                )}
                                {q.isNextQuarter && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-brand-orange-500 text-white rounded font-semibold">PLANNING</span>
                                )}
                              </div>
                              <p className={`text-xs mt-1 ${q.isPast ? 'text-gray-500' : 'text-gray-600'}`}>
                                {q.months}
                              </p>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            )}
                          </div>
                          <p className={`text-xs font-medium mt-2 ${
                            isFull ? 'text-amber-700' : 'text-gray-700'
                          }`}>
                            {qInitiatives.length}/{MAX_PER_QUARTER} initiatives
                            {isFull && ' (Full)'}
                          </p>
                        </button>

                        {/* Cards list */}
                        {isExpanded && (
                          <div className="min-h-20">
                            {qInitiatives.length === 0 ? (
                              <p className={`text-xs text-center py-6 ${q.isPast ? 'text-gray-400' : 'text-gray-500'}`}>
                                {q.isPast ? 'No initiatives recorded' : 'Drag initiatives here'}
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {qInitiatives.map((d, index) => (
                                  <InitiativeCard
                                    key={d.initiativeId}
                                    decision={d}
                                    index={index}
                                    isPast={q.isPast}
                                    isDragging={draggedItem?.initiativeId === d.initiativeId}
                                    quarterId={q.id}
                                    teamMembers={teamMembers}
                                    getAssignedMember={getAssignedMember}
                                    assignmentCounts={assignmentCountsByQuarter[q.id] || {}}
                                    showAssignmentFor={showAssignmentFor}
                                    setShowAssignmentFor={setShowAssignmentFor}
                                    assignTeamMember={assignTeamMember}
                                    updateDecision={updateDecision}
                                    removeInitiative={removeInitiative}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Add Initiative Button */}
                            {!q.isPast && (
                              <div className="mt-2">
                                {showAddForm === q.id ? (
                                  <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <input
                                      type="text"
                                      value={newInitTitle}
                                      onChange={(e) => setNewInitTitle(e.target.value)}
                                      placeholder="Initiative title..."
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewInitiative(q.id);
                                        if (e.key === 'Escape') { setShowAddForm(null); setNewInitTitle(''); }
                                      }}
                                    />
                                    <select
                                      value={newInitCategory}
                                      onChange={(e) => setNewInitCategory(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange"
                                    >
                                      <option value="marketing">Attract</option>
                                      <option value="operations">Convert</option>
                                      <option value="customer_experience">Deliver</option>
                                      <option value="people">People</option>
                                      <option value="systems">Systems</option>
                                      <option value="finance">Finance</option>
                                      <option value="product">Leadership</option>
                                      <option value="other">Time</option>
                                    </select>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => addNewInitiative(q.id)}
                                        disabled={!newInitTitle.trim()}
                                        className="flex-1 px-3 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                                      >
                                        Add
                                      </button>
                                      <button
                                        onClick={() => { setShowAddForm(null); setNewInitTitle(''); }}
                                        className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setShowAddForm(q.id)}
                                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-brand-orange hover:text-brand-orange transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Initiative
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Initiative Card Sub-Component (matching Step 4 styling)
// ═══════════════════════════════════════════════════════════════

interface InitiativeCardProps {
  decision: InitiativeDecision;
  index: number;
  isPast: boolean;
  isDragging: boolean;
  quarterId: string;
  teamMembers: TeamMember[];
  getAssignedMember: (d: InitiativeDecision) => TeamMember | null;
  assignmentCounts: Record<string, number>;
  showAssignmentFor: string | null;
  setShowAssignmentFor: (id: string | null) => void;
  assignTeamMember: (initiativeId: string, memberName: string) => void;
  updateDecision: (initiativeId: string, field: keyof InitiativeDecision, value: string | number) => void;
  removeInitiative: (initiativeId: string) => void;
  onDragStart: (e: React.DragEvent, initiativeId: string, sourceQuarter: string) => void;
  onDragEnd: () => void;
}

function InitiativeCard({
  decision: d,
  index,
  isPast,
  isDragging,
  quarterId,
  teamMembers,
  getAssignedMember,
  assignmentCounts,
  showAssignmentFor,
  setShowAssignmentFor,
  assignTeamMember,
  updateDecision,
  removeInitiative,
  onDragStart,
  onDragEnd,
}: InitiativeCardProps) {
  const catStyle = getCategoryStyle(d.category);
  const assignedMember = getAssignedMember(d);
  const isShowingAssignment = showAssignmentFor === d.initiativeId;

  return (
    <div
      draggable={!isPast}
      onDragStart={(e) => onDragStart(e, d.initiativeId, quarterId)}
      onDragEnd={onDragEnd}
      className={`p-3 rounded-lg border-2 transition-all group ${
        isDragging ? 'opacity-40 scale-95 shadow-lg' :
        d.decision === 'kill' ? 'opacity-60 bg-red-50 border-red-200' :
        'bg-white border-gray-200 hover:shadow-md'
      } ${!isPast ? 'cursor-move' : ''}`}
    >
      {/* Header Row with index number */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="text-xs font-bold mt-0.5 text-gray-400">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold leading-tight ${d.decision === 'kill' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
              {d.title}
            </p>
            {d.progressPercentage > 0 && (
              <p className="text-xs mt-1 text-gray-500">{d.progressPercentage}% complete</p>
            )}
            <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] rounded font-semibold ${catStyle.badgeBg} ${catStyle.badgeText}`}>
              {catStyle.emoji} {catStyle.shortLabel}
            </span>
          </div>
        </div>
        {!isPast && (d.initiativeId.startsWith('new-') || d.initiativeId.startsWith('suggestion-')) && (
          <button
            onClick={() => removeInitiative(d.initiativeId)}
            className="opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 text-gray-300 hover:text-red-600"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Person Assignment - Rich dropdown matching Step 4 */}
      {!isPast && (
        <div className="relative mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAssignmentFor(isShowingAssignment ? null : d.initiativeId);
            }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border transition-colors ${
              assignedMember
                ? 'bg-gray-50 border-slate-200 hover:border-slate-300'
                : 'bg-white border-dashed border-slate-300 hover:border-slate-400'
            }`}
          >
            {assignedMember ? (
              <>
                <div className={`w-5 h-5 rounded-full ${assignedMember.color} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white text-xs font-bold">{assignedMember.initials}</span>
                </div>
                <span className="text-xs font-medium text-brand-navy flex-1 text-left">{assignedMember.name}</span>
              </>
            ) : (
              <>
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-3 h-3 text-slate-400" />
                </div>
                <span className="text-xs text-gray-500 flex-1 text-left">Assign to...</span>
              </>
            )}
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isShowingAssignment ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isShowingAssignment && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto min-w-[240px] w-full">
              {teamMembers.length > 0 ? (
                teamMembers.map((member) => {
                  const count = assignmentCounts[member.name] || 0;
                  const isAtCapacity = count >= MAX_PER_PERSON;
                  const isCurrentlyAssigned = assignedMember?.name === member.name;
                  const canAssign = !isAtCapacity || isCurrentlyAssigned;

                  return (
                    <button
                      key={member.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canAssign) {
                          assignTeamMember(d.initiativeId, member.name);
                        }
                      }}
                      disabled={!canAssign}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                        isCurrentlyAssigned ? 'bg-brand-orange-50' : ''
                      } ${!canAssign ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className={`w-6 h-6 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-[9px] font-bold">{member.initials}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-brand-navy">{member.name}</p>
                        <p className={`text-[10px] ${isAtCapacity ? 'text-red-600' : 'text-gray-500'}`}>
                          {count}/{MAX_PER_PERSON} this quarter{isAtCapacity && ' (Full)'}
                        </p>
                      </div>
                      {isCurrentlyAssigned && (
                        <Check className="w-4 h-4 text-brand-orange flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-gray-400 py-3 px-3">No team members found</p>
              )}
              <div className="border-t border-slate-200">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAssignmentFor(null);
                  }}
                  className="w-full text-center text-[10px] text-gray-400 hover:text-gray-600 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Decision Pills (compact row) */}
      {!isPast && (
        <div className="flex gap-1 mt-2">
          {DECISION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateDecision(d.initiativeId, 'decision', opt.value)}
              className={`flex-1 px-1 py-1 rounded text-[10px] font-medium transition-all border ${
                d.decision === opt.value
                  ? opt.activeColor
                  : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Read-only decision badge for past quarters */}
      {isPast && d.decision && (
        <div className="mt-2">
          {DECISION_OPTIONS.filter(o => o.value === d.decision).map(opt => (
            <span key={opt.value} className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded border ${opt.bgChip}`}>
              {opt.label}
            </span>
          ))}
        </div>
      )}

      {/* New badge */}
      {d.initiativeId.startsWith('new-') && (
        <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-brand-orange-100 text-brand-orange-700 font-medium">
          New
        </span>
      )}
    </div>
  );
}
