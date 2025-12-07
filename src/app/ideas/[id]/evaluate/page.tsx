'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Save,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  HelpCircle,
  Plus,
  Trash2,
  Target,
  DollarSign,
  Clock,
  Users,
  TrendingUp,
  ShieldCheck,
  Megaphone,
  Loader2,
  ChevronDown,
  ChevronUp,
  Filter
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import {
  getIdeaById,
  getIdeasFilterByIdeaId,
  upsertIdeasFilter,
  updateIdea,
  formatDate,
  formatCurrency,
  type Idea,
  type IdeasFilter,
  type CreateIdeasFilterInput,
  type TimeInvestmentItem,
  type FilterDecision,
  type IdeaCategory,
  type IdeaImpact
} from '@/lib/services/ideasService';
import { useBusinessContext } from '@/hooks/useBusinessContext';

// Section component for collapsible sections
function Section({
  title,
  icon: Icon,
  children,
  defaultExpanded = true
}: {
  title: string;
  icon: typeof Target;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>
          <span className="font-semibold text-gray-900">{title}</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="px-6 pb-6 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

export default function IdeasFilterPage() {
  const params = useParams();
  const router = useRouter();
  const ideaId = params?.id as string;
  const { activeBusiness } = useBusinessContext();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Idea classification state
  const [ideaCategory, setIdeaCategory] = useState<IdeaCategory | null>(null);
  const [ideaImpact, setIdeaImpact] = useState<IdeaImpact | null>(null);

  // Autosave refs
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // Form state
  const [formData, setFormData] = useState<CreateIdeasFilterInput>({
    idea_id: ideaId,
    problem_solving: '',
    pros: [],
    cons: [],
    mvp_description: '',
    mvp_timeline: '',
    revenue_forecast: { month3: 0, year1: 0, year2: 0 },
    profit_forecast: { month3: 0, year1: 0, year2: 0 },
    cash_required: 0,
    time_investment: [],
    bhag_alignment_score: null,
    bhag_alignment_notes: '',
    unique_selling_proposition: '',
    how_to_sell: '',
    who_will_sell: '',
    why_now: '',
    what_will_suffer: '',
    competition_analysis: '',
    competitive_advantage: '',
    upside_risks: [],
    downside_risks: [],
    decision: null,
    decision_notes: '',
    evaluation_score: null
  });

  // Temporary input states for list items
  const [newPro, setNewPro] = useState('');
  const [newCon, setNewCon] = useState('');
  const [newUpside, setNewUpside] = useState('');
  const [newDownside, setNewDownside] = useState('');

  // Time investment form
  const [newTimeItem, setNewTimeItem] = useState<TimeInvestmentItem>({
    name: '',
    role: '',
    hours: 0,
    hourlyRate: 0,
    total: 0
  });

  // Load data
  useEffect(() => {
    loadData();
  }, [ideaId]);

  async function loadData() {
    try {
      setLoading(true);
      const [ideaData, filterData] = await Promise.all([
        getIdeaById(ideaId),
        getIdeasFilterByIdeaId(ideaId)
      ]);

      if (!ideaData) {
        setError('Idea not found');
        return;
      }

      setIdea(ideaData);
      setIdeaCategory(ideaData.category);
      setIdeaImpact(ideaData.estimated_impact);

      if (filterData) {
        setFormData({
          idea_id: ideaId,
          problem_solving: filterData.problem_solving || '',
          pros: filterData.pros || [],
          cons: filterData.cons || [],
          mvp_description: filterData.mvp_description || '',
          mvp_timeline: filterData.mvp_timeline || '',
          revenue_forecast: filterData.revenue_forecast || { month3: 0, year1: 0, year2: 0 },
          profit_forecast: filterData.profit_forecast || { month3: 0, year1: 0, year2: 0 },
          cash_required: filterData.cash_required || 0,
          time_investment: filterData.time_investment || [],
          bhag_alignment_score: filterData.bhag_alignment_score,
          bhag_alignment_notes: filterData.bhag_alignment_notes || '',
          unique_selling_proposition: filterData.unique_selling_proposition || '',
          how_to_sell: filterData.how_to_sell || '',
          who_will_sell: filterData.who_will_sell || '',
          why_now: filterData.why_now || '',
          what_will_suffer: filterData.what_will_suffer || '',
          competition_analysis: filterData.competition_analysis || '',
          competitive_advantage: filterData.competitive_advantage || '',
          upside_risks: filterData.upside_risks || [],
          downside_risks: filterData.downside_risks || [],
          decision: filterData.decision,
          decision_notes: filterData.decision_notes || '',
          evaluation_score: filterData.evaluation_score
        });
      }

      setError(null);
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Autosave function
  const performAutosave = useCallback(async () => {
    if (!idea || loading) return;

    console.log('[Ideas Filter] Autosave triggered...');

    try {
      setSaving(true);
      const overrideUserId = activeBusiness?.ownerId;

      // Save idea classification if changed
      if (ideaCategory !== idea.category || ideaImpact !== idea.estimated_impact) {
        console.log('[Ideas Filter] Saving classification changes...');
        await updateIdea(idea.id, {
          category: ideaCategory,
          estimated_impact: ideaImpact
        });
      }

      await upsertIdeasFilter(formData, overrideUserId);
      setLastSaved(new Date());
      setError(null);
      console.log('[Ideas Filter] Autosave complete ✓');
    } catch (err) {
      console.error('[Ideas Filter] Autosave failed:', err);
      // Don't show error for autosave failures - just log
    } finally {
      setSaving(false);
    }
  }, [idea, loading, ideaCategory, ideaImpact, formData, activeBusiness?.ownerId]);

  // Autosave effect - debounced 2 seconds after changes
  useEffect(() => {
    // Skip autosave on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    // Skip if still loading or no idea
    if (loading || !idea) return;

    // Clear existing timer
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    // Set new timer for autosave
    autosaveTimerRef.current = setTimeout(() => {
      performAutosave();
    }, 2000);

    // Cleanup
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [formData, ideaCategory, ideaImpact, performAutosave, loading, idea]);

  async function handleSave(makeDecision = false) {
    // Clear any pending autosave
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    try {
      setSaving(true);
      const overrideUserId = activeBusiness?.ownerId;

      // Save idea classification if changed
      if (idea && (ideaCategory !== idea.category || ideaImpact !== idea.estimated_impact)) {
        await updateIdea(idea.id, {
          category: ideaCategory,
          estimated_impact: ideaImpact
        });
      }

      await upsertIdeasFilter(formData, overrideUserId);
      setLastSaved(new Date());

      if (makeDecision && formData.decision) {
        router.push('/ideas');
      }
    } catch (err) {
      setError('Failed to save evaluation');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // List management helpers
  function addToList(list: string[], item: string, setter: (items: string[]) => void) {
    if (item.trim()) {
      setter([...list, item.trim()]);
    }
  }

  function removeFromList(list: string[], index: number, setter: (items: string[]) => void) {
    setter(list.filter((_, i) => i !== index));
  }

  // Time investment helpers
  function addTimeItem() {
    if (newTimeItem.name && newTimeItem.hours > 0) {
      const total = newTimeItem.hours * newTimeItem.hourlyRate;
      const items = [...(formData.time_investment || []), { ...newTimeItem, total }];
      setFormData({ ...formData, time_investment: items });
      setNewTimeItem({ name: '', role: '', hours: 0, hourlyRate: 0, total: 0 });
    }
  }

  function removeTimeItem(index: number) {
    const items = (formData.time_investment || []).filter((_, i) => i !== index);
    setFormData({ ...formData, time_investment: items });
  }

  const totalTimeInvestment = (formData.time_investment || []).reduce((sum, item) => sum + item.total, 0);
  const totalHours = (formData.time_investment || []).reduce((sum, item) => sum + item.hours, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-3" />
          <p className="text-gray-600">Loading evaluation...</p>
        </div>
      </div>
    );
  }

  if (error || !idea) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{error || 'Idea not found'}</h2>
          <button
            onClick={() => router.push('/ideas')}
            className="text-amber-600 hover:text-amber-700 font-medium"
          >
            Back to Ideas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="Ideas Filter™"
        subtitle={`Evaluate: ${idea.title}`}
        icon={Filter}
        backLink={{ href: '/ideas', label: 'Back to Ideas' }}
        actions={
          <div className="flex items-center gap-2 text-sm">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-white/70">Saving...</span>
              </>
            ) : lastSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-brand-orange" />
                <span className="text-white/70">Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </>
            ) : (
              <span className="text-white/50">Autosave enabled</span>
            )}
          </div>
        }
      />

      {/* Main Content */}
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Idea Summary Card */}
        <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-200 rounded-xl">
              <Lightbulb className="w-6 h-6 text-amber-700" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-1">{idea.title}</h2>
              {idea.description && (
                <p className="text-gray-700 mb-2">{idea.description}</p>
              )}
              <p className="text-sm text-amber-700 mb-4">Captured: {formatDate(idea.created_at)}</p>

              {/* Classification */}
              <div className="flex flex-wrap gap-4 pt-3 border-t border-amber-200">
                <div>
                  <label className="block text-xs font-medium text-amber-800 mb-1">Category</label>
                  <select
                    value={ideaCategory || ''}
                    onChange={(e) => setIdeaCategory((e.target.value || null) as IdeaCategory | null)}
                    className="px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="">Select category</option>
                    <option value="product">Product</option>
                    <option value="marketing">Marketing</option>
                    <option value="operations">Operations</option>
                    <option value="people">People</option>
                    <option value="finance">Finance</option>
                    <option value="technology">Technology</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-amber-800 mb-1">Estimated Impact</label>
                  <select
                    value={ideaImpact || ''}
                    onChange={(e) => setIdeaImpact((e.target.value || null) as IdeaImpact | null)}
                    className="px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="">Select impact</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 1. Problem & Solution */}
        <Section title="1. Problem & Solution" icon={Target}>
          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                What problem is this idea solving?
              </label>
              <textarea
                value={formData.problem_solving || ''}
                onChange={(e) => setFormData({ ...formData, problem_solving: e.target.value })}
                placeholder="Describe the problem this idea addresses..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Pros */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Pros</label>
              <div className="space-y-2">
                {(formData.pros || []).map((pro, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <CheckCircle2 className="w-4 h-4 text-brand-teal flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 py-2">{pro}</span>
                    <button
                      onClick={() => removeFromList(formData.pros || [], i, (items) => setFormData({ ...formData, pros: items }))}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-brand-teal-100 rounded transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
                {/* Always-visible input row */}
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <input
                    type="text"
                    value={newPro}
                    onChange={(e) => setNewPro(e.target.value)}
                    placeholder="Type a pro and press Enter..."
                    className="flex-1 py-2 text-sm border-0 border-b border-gray-200 focus:border-brand-teal focus:ring-0 bg-transparent placeholder:text-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPro.trim()) {
                        e.preventDefault();
                        addToList(formData.pros || [], newPro, (items) => setFormData({ ...formData, pros: items }));
                        setNewPro('');
                      }
                    }}
                    onBlur={() => {
                      if (newPro.trim()) {
                        addToList(formData.pros || [], newPro, (items) => setFormData({ ...formData, pros: items }));
                        setNewPro('');
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Cons */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Cons</label>
              <div className="space-y-2">
                {(formData.cons || []).map((con, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 py-2">{con}</span>
                    <button
                      onClick={() => removeFromList(formData.cons || [], i, (items) => setFormData({ ...formData, cons: items }))}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
                {/* Always-visible input row */}
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <input
                    type="text"
                    value={newCon}
                    onChange={(e) => setNewCon(e.target.value)}
                    placeholder="Type a con and press Enter..."
                    className="flex-1 py-2 text-sm border-0 border-b border-gray-200 focus:border-red-500 focus:ring-0 bg-transparent placeholder:text-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCon.trim()) {
                        e.preventDefault();
                        addToList(formData.cons || [], newCon, (items) => setFormData({ ...formData, cons: items }));
                        setNewCon('');
                      }
                    }}
                    onBlur={() => {
                      if (newCon.trim()) {
                        addToList(formData.cons || [], newCon, (items) => setFormData({ ...formData, cons: items }));
                        setNewCon('');
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 2. MVP Definition */}
        <Section title="2. Minimum Viable Product (MVP)" icon={Target}>
          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                What is the minimum viable version of this idea?
              </label>
              <textarea
                value={formData.mvp_description || ''}
                onChange={(e) => setFormData({ ...formData, mvp_description: e.target.value })}
                placeholder="Describe the simplest version you could test..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                How long to build the MVP?
              </label>
              <input
                type="text"
                value={formData.mvp_timeline || ''}
                onChange={(e) => setFormData({ ...formData, mvp_timeline: e.target.value })}
                placeholder="e.g., 2 weeks, 1 month..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>
        </Section>

        {/* 3. Financial Projections */}
        <Section title="3. Revenue & Profit Forecast" icon={DollarSign}>
          <div className="pt-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 uppercase">3 Months</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 uppercase">1 Year</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 uppercase">2 Years</p>
              </div>
            </div>

            {/* Revenue */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Revenue Forecast</label>
              <div className="grid grid-cols-3 gap-4">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={formData.revenue_forecast?.month3 || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      revenue_forecast: { ...formData.revenue_forecast, month3: Number(e.target.value) || 0 }
                    })}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={formData.revenue_forecast?.year1 || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      revenue_forecast: { ...formData.revenue_forecast, year1: Number(e.target.value) || 0 }
                    })}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={formData.revenue_forecast?.year2 || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      revenue_forecast: { ...formData.revenue_forecast, year2: Number(e.target.value) || 0 }
                    })}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Profit */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Profit Forecast</label>
              <div className="grid grid-cols-3 gap-4">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={formData.profit_forecast?.month3 || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      profit_forecast: { ...formData.profit_forecast, month3: Number(e.target.value) || 0 }
                    })}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={formData.profit_forecast?.year1 || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      profit_forecast: { ...formData.profit_forecast, year1: Number(e.target.value) || 0 }
                    })}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={formData.profit_forecast?.year2 || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      profit_forecast: { ...formData.profit_forecast, year2: Number(e.target.value) || 0 }
                    })}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Cash Required */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Cash Required to Launch</label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={formData.cash_required || ''}
                  onChange={(e) => setFormData({ ...formData, cash_required: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* 4. Time Investment */}
        <Section title="4. Time & Resource Investment" icon={Clock}>
          <div className="pt-4 space-y-4">
            {/* Existing items */}
            {(formData.time_investment || []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-600">Name</th>
                      <th className="text-left py-2 font-medium text-gray-600">Role</th>
                      <th className="text-right py-2 font-medium text-gray-600">Hours</th>
                      <th className="text-right py-2 font-medium text-gray-600">Rate</th>
                      <th className="text-right py-2 font-medium text-gray-600">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.time_investment || []).map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2">{item.name}</td>
                        <td className="py-2 text-gray-600">{item.role}</td>
                        <td className="py-2 text-right">{item.hours}</td>
                        <td className="py-2 text-right">{formatCurrency(item.hourlyRate)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => removeTimeItem(i)}
                            className="p-1 hover:bg-red-50 rounded text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={2} className="py-2">Total</td>
                      <td className="py-2 text-right">{totalHours} hrs</td>
                      <td className="py-2 text-right"></td>
                      <td className="py-2 text-right text-amber-600">{formatCurrency(totalTimeInvestment)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Add new item */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-3">Add team member investment:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <input
                  type="text"
                  value={newTimeItem.name}
                  onChange={(e) => setNewTimeItem({ ...newTimeItem, name: e.target.value })}
                  placeholder="Name"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <input
                  type="text"
                  value={newTimeItem.role}
                  onChange={(e) => setNewTimeItem({ ...newTimeItem, role: e.target.value })}
                  placeholder="Role"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <input
                  type="number"
                  value={newTimeItem.hours || ''}
                  onChange={(e) => setNewTimeItem({ ...newTimeItem, hours: Number(e.target.value) || 0 })}
                  placeholder="Hours"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <input
                  type="number"
                  value={newTimeItem.hourlyRate || ''}
                  onChange={(e) => setNewTimeItem({ ...newTimeItem, hourlyRate: Number(e.target.value) || 0 })}
                  placeholder="Hourly rate"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={addTimeItem}
                disabled={!newTimeItem.name || !newTimeItem.hours}
                className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Person
              </button>
            </div>
          </div>
        </Section>

        {/* 5. Strategic Alignment */}
        <Section title="5. Strategic Alignment" icon={Target}>
          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Alignment with 10-Year Goal / BHAG (1-10)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.bhag_alignment_score || 5}
                  onChange={(e) => setFormData({ ...formData, bhag_alignment_score: Number(e.target.value) })}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-2xl font-bold text-amber-600 w-12 text-center">
                  {formData.bhag_alignment_score || 5}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Not aligned</span>
                <span>Perfectly aligned</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                How does this align with your long-term vision?
              </label>
              <textarea
                value={formData.bhag_alignment_notes || ''}
                onChange={(e) => setFormData({ ...formData, bhag_alignment_notes: e.target.value })}
                placeholder="Explain the strategic fit..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </Section>

        {/* 6. Marketing */}
        <Section title="6. Marketing Requirements" icon={Megaphone}>
          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                What is the Unique Selling Proposition (USP)?
              </label>
              <textarea
                value={formData.unique_selling_proposition || ''}
                onChange={(e) => setFormData({ ...formData, unique_selling_proposition: e.target.value })}
                placeholder="What makes this unique in the market?"
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                How will we sell/market it?
              </label>
              <textarea
                value={formData.how_to_sell || ''}
                onChange={(e) => setFormData({ ...formData, how_to_sell: e.target.value })}
                placeholder="Sales channels, marketing strategy..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Who will sell it?
              </label>
              <input
                type="text"
                value={formData.who_will_sell || ''}
                onChange={(e) => setFormData({ ...formData, who_will_sell: e.target.value })}
                placeholder="Sales team, partners, direct..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>
        </Section>

        {/* 7. Timing & Opportunity Cost */}
        <Section title="7. Timing & Opportunity Cost" icon={Clock}>
          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Why now? What makes this the right time?
              </label>
              <textarea
                value={formData.why_now || ''}
                onChange={(e) => setFormData({ ...formData, why_now: e.target.value })}
                placeholder="Market conditions, competitive timing, internal readiness..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                What will suffer if we do this?
              </label>
              <textarea
                value={formData.what_will_suffer || ''}
                onChange={(e) => setFormData({ ...formData, what_will_suffer: e.target.value })}
                placeholder="Current projects, focus areas, resources that will be diverted..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </Section>

        {/* 8. Competition */}
        <Section title="8. Competition Analysis" icon={Users}>
          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Who are the competitors? What are they doing?
              </label>
              <textarea
                value={formData.competition_analysis || ''}
                onChange={(e) => setFormData({ ...formData, competition_analysis: e.target.value })}
                placeholder="Direct and indirect competitors, their offerings..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                What is our competitive advantage?
              </label>
              <textarea
                value={formData.competitive_advantage || ''}
                onChange={(e) => setFormData({ ...formData, competitive_advantage: e.target.value })}
                placeholder="Why we'll win against competitors..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </Section>

        {/* 9. Risk Analysis */}
        <Section title="9. Risk Analysis" icon={ShieldCheck}>
          <div className="pt-4 space-y-4">
            {/* Upside Risks */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Upside Risks (What if it succeeds big?)
              </label>
              <div className="space-y-2">
                {(formData.upside_risks || []).map((risk, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <TrendingUp className="w-4 h-4 text-brand-teal flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 py-2">{risk}</span>
                    <button
                      onClick={() => removeFromList(formData.upside_risks || [], i, (items) => setFormData({ ...formData, upside_risks: items }))}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-brand-teal-100 rounded transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
                {/* Always-visible input row */}
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <input
                    type="text"
                    value={newUpside}
                    onChange={(e) => setNewUpside(e.target.value)}
                    placeholder="Type an upside risk and press Enter..."
                    className="flex-1 py-2 text-sm border-0 border-b border-gray-200 focus:border-brand-teal focus:ring-0 bg-transparent placeholder:text-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newUpside.trim()) {
                        e.preventDefault();
                        addToList(formData.upside_risks || [], newUpside, (items) => setFormData({ ...formData, upside_risks: items }));
                        setNewUpside('');
                      }
                    }}
                    onBlur={() => {
                      if (newUpside.trim()) {
                        addToList(formData.upside_risks || [], newUpside, (items) => setFormData({ ...formData, upside_risks: items }));
                        setNewUpside('');
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Downside Risks */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Downside Risks (What if it fails?)
              </label>
              <div className="space-y-2">
                {(formData.downside_risks || []).map((risk, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 py-2">{risk}</span>
                    <button
                      onClick={() => removeFromList(formData.downside_risks || [], i, (items) => setFormData({ ...formData, downside_risks: items }))}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
                {/* Always-visible input row */}
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <input
                    type="text"
                    value={newDownside}
                    onChange={(e) => setNewDownside(e.target.value)}
                    placeholder="Type a downside risk and press Enter..."
                    className="flex-1 py-2 text-sm border-0 border-b border-gray-200 focus:border-red-500 focus:ring-0 bg-transparent placeholder:text-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDownside.trim()) {
                        e.preventDefault();
                        addToList(formData.downside_risks || [], newDownside, (items) => setFormData({ ...formData, downside_risks: items }));
                        setNewDownside('');
                      }
                    }}
                    onBlur={() => {
                      if (newDownside.trim()) {
                        addToList(formData.downside_risks || [], newDownside, (items) => setFormData({ ...formData, downside_risks: items }));
                        setNewDownside('');
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 10. Final Decision */}
        <Section title="10. Final Decision" icon={CheckCircle2} defaultExpanded={true}>
          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                What's your decision?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { value: 'proceed', label: 'Proceed', icon: CheckCircle2, color: 'teal' },
                  { value: 'reject', label: 'Reject', icon: XCircle, color: 'red' },
                  { value: 'park', label: 'Park', icon: PauseCircle, color: 'navy' },
                  { value: 'needs_more_info', label: 'Need More Info', icon: HelpCircle, color: 'orange' }
                ] as const).map((option) => {
                  const Icon = option.icon;
                  const isSelected = formData.decision === option.value;
                  const colorClasses = {
                    teal: isSelected ? 'border-brand-teal bg-brand-teal-50 text-brand-teal-700' : 'border-gray-200 hover:border-brand-teal-300',
                    red: isSelected ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-300',
                    navy: isSelected ? 'border-brand-navy bg-brand-navy-50 text-brand-navy-700' : 'border-gray-200 hover:border-brand-navy-300',
                    orange: isSelected ? 'border-brand-orange bg-brand-orange-50 text-brand-orange-700' : 'border-gray-200 hover:border-brand-orange-300'
                  };

                  return (
                    <button
                      key={option.value}
                      onClick={() => setFormData({ ...formData, decision: option.value })}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${colorClasses[option.color]}`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-sm font-medium">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Decision Notes
              </label>
              <textarea
                value={formData.decision_notes || ''}
                onChange={(e) => setFormData({ ...formData, decision_notes: e.target.value })}
                placeholder="Explain your reasoning for this decision..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <button
                onClick={() => handleSave(true)}
                disabled={saving || !formData.decision}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                Complete Evaluation
              </button>
              <p className="text-xs text-gray-500 text-center mt-2">
                Your progress is automatically saved as you work
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
