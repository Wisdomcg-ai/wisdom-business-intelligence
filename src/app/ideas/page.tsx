'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Lightbulb,
  Search,
  X,
  Edit3,
  Trash2,
  Archive,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  Filter,
  BookOpen,
  ArrowRight,
  Sparkles,
  MoreVertical
} from 'lucide-react';
import {
  getActiveIdeas,
  createIdea,
  updateIdea,
  archiveIdea,
  deleteIdea,
  getIdeasStats,
  formatDate,
  type Idea,
  type CreateIdeaInput,
  type IdeaStatus,
  type IdeaCategory,
  type IdeaImpact
} from '@/lib/services/ideasService';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import PageHeader from '@/components/ui/PageHeader';

type FilterStatus = 'all' | IdeaStatus;

// Simplified color palette - teal for positive actions, slate for neutral, amber for attention
const STATUS_CONFIG: Record<IdeaStatus, { label: string; color: string; icon: typeof Lightbulb; bgHover: string }> = {
  'captured': {
    label: 'Captured',
    color: 'bg-slate-100 text-gray-700 border-slate-200',
    icon: Lightbulb,
    bgHover: 'hover:bg-gray-50'
  },
  'under_review': {
    label: 'Under Review',
    color: 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200',
    icon: Clock,
    bgHover: 'hover:bg-brand-orange-50'
  },
  'approved': {
    label: 'Approved',
    color: 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200',
    icon: CheckCircle2,
    bgHover: 'hover:bg-brand-orange-50'
  },
  'rejected': {
    label: 'Rejected',
    color: 'bg-slate-100 text-gray-500 border-slate-200',
    icon: XCircle,
    bgHover: 'hover:bg-gray-50'
  },
  'parked': {
    label: 'Parked',
    color: 'bg-slate-100 text-gray-600 border-slate-200',
    icon: PauseCircle,
    bgHover: 'hover:bg-gray-50'
  }
};

// All categories use neutral styling - the category name itself provides context
const CATEGORY_CONFIG: Record<IdeaCategory, { label: string; color: string }> = {
  'product': { label: 'Product', color: 'bg-gray-100 text-gray-600' },
  'marketing': { label: 'Marketing', color: 'bg-gray-100 text-gray-600' },
  'operations': { label: 'Operations', color: 'bg-gray-100 text-gray-600' },
  'people': { label: 'People', color: 'bg-gray-100 text-gray-600' },
  'finance': { label: 'Finance', color: 'bg-gray-100 text-gray-600' },
  'technology': { label: 'Technology', color: 'bg-gray-100 text-gray-600' },
  'other': { label: 'Other', color: 'bg-gray-100 text-gray-600' }
};

// Impact uses subtle differentiation
const IMPACT_CONFIG: Record<IdeaImpact, { label: string; color: string }> = {
  'low': { label: 'Low', color: 'bg-gray-100 text-gray-500' },
  'medium': { label: 'Medium', color: 'bg-gray-100 text-gray-600' },
  'high': { label: 'High', color: 'bg-brand-orange-50 text-brand-orange-700' }
};

// Skeleton loader
function IdeaCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-100 rounded w-full"></div>
          <div className="flex gap-2">
            <div className="h-6 bg-gray-100 rounded-full w-20"></div>
            <div className="h-6 bg-gray-100 rounded-full w-24"></div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-9 bg-gray-100 rounded-lg"></div>
          <div className="h-9 w-9 bg-gray-100 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
}

// Status badge
function StatusBadge({ status, size = 'md' }: { status: IdeaStatus; size?: 'sm' | 'md' }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs gap-1'
    : 'px-3 py-1 text-sm gap-1.5';

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${config.color} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {config.label}
    </span>
  );
}

// Category badge
function CategoryBadge({ category }: { category: IdeaCategory }) {
  const config = CATEGORY_CONFIG[category];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
}

// Impact badge
function ImpactBadge({ impact }: { impact: IdeaImpact }) {
  const config = IMPACT_CONFIG[impact];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
}

// Idea card component
function IdeaCard({
  idea,
  onEdit,
  onEvaluate,
  onArchive,
  onDelete,
  isUpdating
}: {
  idea: Idea;
  onEdit: () => void;
  onEvaluate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-brand-orange transition-all duration-200 hover:shadow-md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange flex-shrink-0" />
              <h3 className="font-semibold text-gray-900 text-base sm:text-lg">{idea.title}</h3>
            </div>

            {/* Description preview */}
            {idea.description && (
              <p className="text-xs sm:text-sm text-gray-600 mb-3 line-clamp-2">
                {idea.description}
              </p>
            )}

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={idea.status} size="sm" />
              {idea.category && <CategoryBadge category={idea.category} />}
              {idea.estimated_impact && <ImpactBadge impact={idea.estimated_impact} />}
            </div>

            {/* Expanded details */}
            {expanded && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 text-sm">
                {idea.description && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                    <p className="text-gray-700">{idea.description}</p>
                  </div>
                )}
                {idea.source && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Source</p>
                    <p className="text-gray-700">{idea.source}</p>
                  </div>
                )}
                <div className="flex items-center gap-4 pt-2 text-xs text-gray-500">
                  <span>Captured: {formatDate(idea.created_at)}</span>
                  {idea.updated_at !== idea.created_at && (
                    <span>Updated: {formatDate(idea.updated_at)}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-start gap-2 flex-shrink-0">
            {/* Primary Action: Evaluate (for captured ideas) */}
            {idea.status === 'captured' && (
              <button
                onClick={onEvaluate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span>Evaluate</span>
              </button>
            )}

            {/* Secondary Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                disabled={isUpdating}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {isUpdating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <MoreVertical className="w-5 h-5" />
                )}
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <button
                      onClick={() => {
                        onEdit();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit
                    </button>
                    {idea.status !== 'captured' && (
                      <button
                        onClick={() => {
                          onEvaluate();
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Filter className="w-4 h-4" />
                        Re-evaluate
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onArchive();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Archive className="w-4 h-4" />
                      Archive
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={() => {
                        onDelete();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Show details
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Delete confirmation modal
function DeleteModal({
  idea,
  onConfirm,
  onCancel
}: {
  idea: Idea;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-4 sm:p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 sm:p-3 bg-red-100 rounded-full flex-shrink-0">
            <Trash2 className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Delete Idea</h3>
            <p className="text-xs sm:text-sm text-gray-500">This action cannot be undone</p>
          </div>
        </div>

        <div className="p-3 sm:p-4 bg-gray-50 rounded-lg mb-4 sm:mb-6">
          <p className="font-medium text-sm sm:text-base text-gray-900 break-words">{idea.title}</p>
          <div className="flex gap-2 mt-2">
            <StatusBadge status={idea.status} size="sm" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Delete Idea
          </button>
        </div>
      </div>
    </div>
  );
}

// Ideas Journal Info Box
function IdeasInfoBox() {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ideasInfoExpanded');
      return stored === 'true';
    }
    return false;
  });

  function toggleInfo() {
    const newState = !expanded;
    setExpanded(newState);
    localStorage.setItem('ideasInfoExpanded', newState.toString());
  }

  return (
    <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl overflow-hidden">
      <button
        onClick={toggleInfo}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-brand-orange-100 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 bg-brand-orange-100 rounded-lg flex-shrink-0">
            <BookOpen className="h-4 w-4 text-brand-orange" />
          </div>
          <span className="text-sm sm:text-base font-medium text-brand-orange-900">About Your Ideas Journal</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-brand-orange flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-brand-orange flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 py-4 border-t border-brand-orange-200 bg-white text-xs sm:text-sm text-gray-700 space-y-3">
          <p>
            <strong>Entrepreneurs are idea machines.</strong> The challenge isn't coming up with ideas -
            it's knowing which ones to pursue and which to let go.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-brand-orange-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb className="w-4 h-4 text-brand-orange flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-brand-orange-800">Capture Everything</span>
              </div>
              <p className="text-xs text-brand-orange-700">
                Write down every idea as it comes. Don't judge - just capture.
              </p>
            </div>
            <div className="p-3 bg-brand-teal-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Filter className="w-4 h-4 text-brand-teal flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-brand-teal-800">Evaluate Periodically</span>
              </div>
              <p className="text-xs text-brand-teal-700">
                Review your ideas quarterly. Use the Ideas Filter to make smart decisions.
              </p>
            </div>
          </div>

          <div className="bg-brand-orange-50 border border-brand-orange-200 p-3 rounded-lg">
            <p className="text-xs text-brand-navy">
              <strong>Pro Tip:</strong> Schedule a monthly "idea review" session. Most ideas won't survive
              scrutiny - and that's the point. Focus on the few that truly align with your goals.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IdeasJournalPage() {
  const router = useRouter();
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    captured: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    parked: 0
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteIdeaItem, setDeleteIdeaItem] = useState<Idea | null>(null);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  // Form state
  const [formData, setFormData] = useState<CreateIdeaInput>({
    title: '',
    description: null,
    source: null,
    category: null,
    estimated_impact: null
  });

  // Filtered and sorted ideas
  const filteredIdeas = useMemo(() => {
    let result = [...ideas];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.title.toLowerCase().includes(query) ||
        i.description?.toLowerCase().includes(query) ||
        i.source?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(i => i.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [ideas, searchQuery, statusFilter, sortBy]);

  // Load data
  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }
  }, [contextLoading, activeBusiness?.id]);

  async function loadData() {
    try {
      setLoading(true);
      const overrideUserId = activeBusiness?.ownerId;
      const [ideasData, statsData] = await Promise.all([
        getActiveIdeas(overrideUserId),
        getIdeasStats(overrideUserId)
      ]);

      setIdeas(ideasData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError('Failed to load ideas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      title: '',
      description: null,
      source: null,
      category: null,
      estimated_impact: null
    });
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const overrideUserId = activeBusiness?.ownerId;
      if (editingId) {
        await updateIdea(editingId, formData);
      } else {
        await createIdea(formData, overrideUserId);
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError('Failed to save idea');
      console.error(err);
    }
  }

  async function handleArchive(id: string) {
    try {
      setUpdatingId(id);
      await archiveIdea(id);
      await loadData();
    } catch (err) {
      setError('Failed to archive idea');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteIdeaItem) return;

    try {
      await deleteIdea(deleteIdeaItem.id);
      setDeleteIdeaItem(null);
      await loadData();
    } catch (err) {
      setError('Failed to delete idea');
      console.error(err);
    }
  }

  function handleEdit(idea: Idea) {
    setFormData({
      title: idea.title,
      description: idea.description,
      source: idea.source,
      category: idea.category,
      estimated_impact: idea.estimated_impact
    });
    setEditingId(idea.id);
    setShowForm(true);
  }

  function handleEvaluate(ideaId: string) {
    router.push(`/ideas/${ideaId}/evaluate`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Ideas Journal"
        subtitle="Capture ideas now, evaluate them later"
        icon={Sparkles}
        actions={
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-medium shadow-sm"
          >
            <Plus className="h-5 w-5" />
            <span>Capture Idea</span>
          </button>
        }
      />

      {/* Main Container */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 mb-6">
          <button
            onClick={() => setStatusFilter('all')}
            className={`p-3 sm:p-4 rounded-xl shadow-sm border transition-all ${
              statusFilter === 'all'
                ? 'border-brand-orange bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs font-medium text-gray-600">Total Ideas</p>
          </button>
          <button
            onClick={() => setStatusFilter('captured')}
            className={`p-3 sm:p-4 rounded-xl shadow-sm border transition-all ${
              statusFilter === 'captured'
                ? 'border-slate-500 bg-gray-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-gray-600">{stats.captured}</p>
            <p className="text-xs font-medium text-gray-600">Captured</p>
          </button>
          <button
            onClick={() => setStatusFilter('under_review')}
            className={`p-3 sm:p-4 rounded-xl shadow-sm border transition-all ${
              statusFilter === 'under_review'
                ? 'border-brand-orange bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-brand-orange">{stats.underReview}</p>
            <p className="text-xs font-medium text-gray-600">Under Review</p>
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`p-3 sm:p-4 rounded-xl shadow-sm border transition-all ${
              statusFilter === 'approved'
                ? 'border-brand-orange-500 bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-brand-orange">{stats.approved}</p>
            <p className="text-xs font-medium text-gray-600">Approved</p>
          </button>
          <button
            onClick={() => setStatusFilter('parked')}
            className={`p-3 sm:p-4 rounded-xl shadow-sm border transition-all ${
              statusFilter === 'parked'
                ? 'border-slate-400 bg-gray-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-gray-600">{stats.parked}</p>
            <p className="text-xs font-medium text-gray-600">Parked</p>
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`p-3 sm:p-4 rounded-xl shadow-sm border transition-all ${
              statusFilter === 'rejected'
                ? 'border-slate-400 bg-gray-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-gray-500">{stats.rejected}</p>
            <p className="text-xs font-medium text-gray-600">Rejected</p>
          </button>
        </div>
        {/* Info Box */}
        <div className="mb-6">
          <IdeasInfoBox />
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search ideas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
          {(statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="px-4 py-2.5 text-brand-orange hover:text-brand-orange-700 font-medium whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm sm:text-base text-red-700">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 rounded flex-shrink-0"
            >
              <X className="w-5 h-5 text-red-600" />
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <IdeaCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredIdeas.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
            {ideas.length === 0 ? (
              <>
                <div className="w-16 h-16 bg-brand-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lightbulb className="w-8 h-8 text-brand-orange" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                  Start Capturing Ideas
                </h3>
                <p className="text-sm sm:text-base text-gray-600 mb-6 max-w-md mx-auto">
                  Your Ideas Journal is empty. Whenever inspiration strikes, capture it here
                  instead of acting on it immediately.
                </p>
                <button
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-medium"
                >
                  <Plus className="h-5 w-5" />
                  Capture your first idea
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No matching ideas</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-4">
                  Try adjusting your search or filter criteria
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="text-brand-orange hover:text-brand-orange-700 font-medium"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          /* Idea Cards */
          <div className="space-y-4">
            {filteredIdeas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onEdit={() => handleEdit(idea)}
                onEvaluate={() => handleEvaluate(idea.id)}
                onArchive={() => handleArchive(idea.id)}
                onDelete={() => setDeleteIdeaItem(idea)}
                isUpdating={updatingId === idea.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-orange-100 rounded-lg">
                  <Lightbulb className="w-5 h-5 text-brand-orange" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  {editingId ? 'Edit Idea' : 'Capture New Idea'}
                </h2>
              </div>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  What's the idea? <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Launch a customer loyalty program"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-lg"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  More details <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
                  placeholder="Describe the idea in more detail..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                />
              </div>

              {/* Source & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Source <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.source || ''}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value || null })}
                    placeholder="e.g., Podcast, book, client..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Category <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: (e.target.value || null) as IdeaCategory | null })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
                  >
                    <option value="">Select category</option>
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tip */}
              <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-lg p-3">
                <p className="text-xs text-brand-orange-800">
                  <strong>Quick capture is key.</strong> Just get it down - you can add more details
                  and run it through the Ideas Filter later when you're ready to evaluate.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-medium"
                >
                  {editingId ? 'Save Changes' : 'Capture Idea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteIdeaItem && (
        <DeleteModal
          idea={deleteIdeaItem}
          onConfirm={handleDelete}
          onCancel={() => setDeleteIdeaItem(null)}
        />
      )}
    </div>
  );
}
