'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, AnnualInitiativePlan, YearType } from '../../types';
import { getDefaultAnnualInitiativePlan } from '../../types';
import { formatDollar, parseDollarInput } from '@/app/goals/utils/formatting';
import { calculateQuarters } from '@/app/goals/utils/quarters';
import { getInitials, getColorForName, parseTeamFromProfile } from '@/app/goals/utils/team';
import { getCategoryStyle } from '@/app/goals/utils/design-tokens';
import type { TeamMember } from '@/app/goals/utils/team';
import {
  DollarSign,
  Rocket,
  Plus,
  Trash2,
  Loader2,
  ArrowRight,
  Users,
  GripVertical,
} from 'lucide-react';

interface AnnualInitiativePlanStepProps {
  review: QuarterlyReview;
  onUpdate: (data: AnnualInitiativePlan) => void;
}

interface PlanInitiative {
  id: string;
  title: string;
  category: string;
  quarterAssigned: string;
  assignedTo?: string;
  notes?: string;
}

const CATEGORIES = [
  { value: 'marketing', label: 'Attract' },
  { value: 'operations', label: 'Convert' },
  { value: 'customer_experience', label: 'Deliver' },
  { value: 'people', label: 'People' },
  { value: 'systems', label: 'Systems' },
  { value: 'finance', label: 'Finance' },
  { value: 'product', label: 'Leadership' },
  { value: 'other', label: 'Other' },
];

export function AnnualInitiativePlanStep({ review, onUpdate }: AnnualInitiativePlanStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showAddForm, setShowAddForm] = useState<string | null>(null);
  const [newInitTitle, setNewInitTitle] = useState('');
  const [newInitCategory, setNewInitCategory] = useState('growth');
  const [draggedItem, setDraggedItem] = useState<{ id: string; fromQ: string } | null>(null);

  const data: AnnualInitiativePlan = {
    ...getDefaultAnnualInitiativePlan(),
    ...(review.annual_initiative_plan || {}),
  };

  const nextYear = data.nextYear || review.year + 1;
  const yearType = (data.yearType || 'CY') as YearType;
  const quarters = useMemo(() => calculateQuarters(yearType, nextYear), [yearType, nextYear]);

  useEffect(() => {
    loadData();
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

      const businessId = profile?.id || review.business_id;

      // Load team members
      if (profile) {
        const members = parseTeamFromProfile(profile as any, businessId);
        setTeamMembers(members);
      }

      // Load year type from financial goals
      const { data: goalsData } = await supabase
        .from('business_financial_goals')
        .select('year_type')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const yt = (goalsData?.year_type || 'CY') as YearType;

      // Pre-populate next year targets from NextYearTargetsStep
      const nextYearTargets = review.next_year_targets;
      if (nextYearTargets && data.quarterlyTargets.q1.revenue === 0) {
        const qRev = Math.round((nextYearTargets.revenue || 0) / 4);
        const qGP = Math.round((nextYearTargets.grossProfit || 0) / 4);
        const qNP = Math.round((nextYearTargets.netProfit || 0) / 4);
        onUpdate({
          ...data,
          nextYear: nextYear,
          yearType: yt,
          quarterlyTargets: {
            q1: { revenue: qRev, grossProfit: qGP, netProfit: qNP },
            q2: { revenue: qRev, grossProfit: qGP, netProfit: qNP },
            q3: { revenue: qRev, grossProfit: qGP, netProfit: qNP },
            q4: { revenue: nextYearTargets.revenue - qRev * 3, grossProfit: nextYearTargets.grossProfit - qGP * 3, netProfit: nextYearTargets.netProfit - qNP * 3 },
          },
        });
      }

      // Load carry-forward initiatives (incomplete from this year)
      const { data: carryForward } = await supabase
        .from('strategic_initiatives')
        .select('id, title, category, status')
        .eq('business_id', businessId)
        .in('status', ['in_progress', 'not_started'])
        .in('step_type', ['q1', 'q2', 'q3', 'q4', 'twelve_month']);

      // If no initiatives in plan yet, pre-populate from carry-forward
      if (data.initiatives.length === 0 && carryForward && carryForward.length > 0) {
        const prePopulated: PlanInitiative[] = carryForward.slice(0, 12).map(i => ({
          id: i.id,
          title: i.title,
          category: i.category || 'misc',
          quarterAssigned: 'q1', // Default to Q1
        }));
        onUpdate({ ...data, initiatives: prePopulated });
      }
    } catch (err) {
      console.error('Error loading annual initiative plan data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Group initiatives by quarter
  const initiativesByQuarter = useMemo(() => {
    const grouped: Record<string, PlanInitiative[]> = { q1: [], q2: [], q3: [], q4: [], unassigned: [] };
    for (const init of data.initiatives) {
      const qKey = init.quarterAssigned || 'unassigned';
      if (grouped[qKey]) {
        grouped[qKey].push(init);
      } else {
        grouped['unassigned'].push(init);
      }
    }
    return grouped;
  }, [data.initiatives]);

  const updateQuarterTarget = (qKey: string, field: string, value: number) => {
    const updatedTargets = {
      ...data.quarterlyTargets,
      [qKey]: {
        ...(data.quarterlyTargets as any)[qKey],
        [field]: value,
      },
    };
    onUpdate({ ...data, quarterlyTargets: updatedTargets });
  };

  const addInitiative = (quarterId: string) => {
    if (!newInitTitle.trim()) return;
    const newInit: PlanInitiative = {
      id: `annual-${Date.now()}`,
      title: newInitTitle.trim(),
      category: newInitCategory,
      quarterAssigned: quarterId,
    };
    onUpdate({ ...data, initiatives: [...data.initiatives, newInit] });
    setNewInitTitle('');
    setShowAddForm(null);
  };

  const removeInitiative = (id: string) => {
    onUpdate({ ...data, initiatives: data.initiatives.filter(i => i.id !== id) });
  };

  const moveInitiative = (id: string, toQuarter: string) => {
    onUpdate({
      ...data,
      initiatives: data.initiatives.map(i =>
        i.id === id ? { ...i, quarterAssigned: toQuarter } : i
      ),
    });
    setDraggedItem(null);
  };

  const assignPerson = (id: string, personName: string) => {
    onUpdate({
      ...data,
      initiatives: data.initiatives.map(i =>
        i.id === id ? { ...i, assignedTo: personName } : i
      ),
    });
  };

  // Drag and drop
  const handleDragStart = (id: string, fromQ: string) => {
    setDraggedItem({ id, fromQ });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, toQ: string) => {
    e.preventDefault();
    if (draggedItem) {
      moveInitiative(draggedItem.id, toQ);
    }
  };

  // Calculate annual totals
  const annualTotals = {
    revenue: Object.values(data.quarterlyTargets).reduce((sum, q) => sum + (q.revenue || 0), 0),
    grossProfit: Object.values(data.quarterlyTargets).reduce((sum, q) => sum + (q.grossProfit || 0), 0),
    netProfit: Object.values(data.quarterlyTargets).reduce((sum, q) => sum + (q.netProfit || 0), 0),
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader step="A4.4" subtitle="Plan initiatives across all quarters of next year" estimatedTime={30} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="A4.4"
        subtitle={`Plan your ${yearType}${nextYear} initiatives across all 4 quarters`}
        estimatedTime={30}
        tip="Spread initiatives evenly. Max 5 per quarter to maintain focus."
      />

      {/* Financial Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-5 mb-6 overflow-x-auto">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-brand-orange" />
          Quarterly Financial Targets — {yearType}{nextYear}
        </h3>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-4 font-medium text-gray-600">Metric</th>
              {quarters.map(q => (
                <th key={q.id} className="text-center py-2 px-2 font-medium text-gray-600">
                  {q.label}<br /><span className="text-xs font-normal text-gray-400">{q.months}</span>
                </th>
              ))}
              <th className="text-center py-2 pl-2 font-bold text-gray-900">Annual</th>
            </tr>
          </thead>
          <tbody>
            {[
              { key: 'revenue', label: 'Revenue' },
              { key: 'grossProfit', label: 'Gross Profit' },
              { key: 'netProfit', label: 'Net Profit' },
            ].map(({ key, label }) => (
              <tr key={key} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-medium text-gray-700">{label}</td>
                {(['q1', 'q2', 'q3', 'q4'] as const).map(qKey => (
                  <td key={qKey} className="py-2 px-1">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="text"
                        value={(data.quarterlyTargets[qKey] as any)[key] ? (data.quarterlyTargets[qKey] as any)[key].toLocaleString('en-AU') : ''}
                        onChange={(e) => updateQuarterTarget(qKey, key, parseDollarInput(e.target.value))}
                        className="w-full pl-5 pr-1 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-center focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-brand-orange-50"
                      />
                    </div>
                  </td>
                ))}
                <td className="py-2 pl-2 text-center font-bold text-gray-900 text-xs">
                  {formatDollar((annualTotals as any)[key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Initiative Swim Lanes */}
      <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <Rocket className="w-5 h-5 text-brand-orange" />
        Initiative Planning — {yearType}{nextYear}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {quarters.map(q => {
          const qInits = initiativesByQuarter[q.id] || [];
          const overCapacity = qInits.length > 5;

          return (
            <div
              key={q.id}
              className={`rounded-xl border-2 ${overCapacity ? 'border-amber-300' : 'border-gray-200'} overflow-hidden`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, q.id)}
            >
              {/* Quarter Header */}
              <div className="bg-brand-orange-50 px-4 py-2.5 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900">{q.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    overCapacity ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {qInits.length}/5
                  </span>
                </div>
                <div className="text-xs text-gray-500">{q.months}</div>
              </div>

              {/* Initiatives */}
              <div className="p-3 space-y-2 min-h-[120px]">
                {qInits.map(init => {
                  const catStyle = getCategoryStyle(init.category);
                  return (
                    <div
                      key={init.id}
                      draggable
                      onDragStart={() => handleDragStart(init.id, q.id)}
                      className="bg-white rounded-lg border border-gray-200 p-2.5 cursor-move hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs">{catStyle.emoji}</span>
                            <span className="text-xs font-medium text-gray-900 truncate">{init.title}</span>
                          </div>
                          {/* Team assignment */}
                          <select
                            value={init.assignedTo || ''}
                            onChange={(e) => assignPerson(init.id, e.target.value)}
                            className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded text-gray-600"
                          >
                            <option value="">Unassigned</option>
                            {teamMembers.map(m => (
                              <option key={m.id} value={m.name}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => removeInitiative(init.id)}
                          className="text-gray-400 hover:text-red-600 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add button */}
                {showAddForm === q.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newInitTitle}
                      onChange={(e) => setNewInitTitle(e.target.value)}
                      placeholder="Initiative title..."
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-brand-orange"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addInitiative(q.id);
                        if (e.key === 'Escape') { setShowAddForm(null); setNewInitTitle(''); }
                      }}
                    />
                    <select
                      value={newInitCategory}
                      onChange={(e) => setNewInitCategory(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      <button
                        onClick={() => addInitiative(q.id)}
                        disabled={!newInitTitle.trim()}
                        className="flex-1 px-2 py-1 bg-brand-orange text-white rounded-lg text-xs font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setShowAddForm(null); setNewInitTitle(''); }}
                        className="px-2 py-1 text-gray-500 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddForm(q.id)}
                    className="w-full flex items-center justify-center gap-1 text-xs text-brand-orange hover:text-brand-orange-600 font-medium py-1.5 border border-dashed border-gray-300 rounded-lg hover:border-brand-orange-300"
                  >
                    <Plus className="w-3 h-3" />
                    Add Initiative
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            Total: {data.initiatives.length} initiatives across 4 quarters
          </span>
          <span className="text-gray-500">
            Drag cards between quarters to reassign
          </span>
        </div>
      </div>
    </div>
  );
}
