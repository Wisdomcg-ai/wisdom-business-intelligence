'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Check,
  Trash2,
  Edit3,
  Search,
  AlertTriangle,
  Clock,
  Pause,
  Play,
  X,
  RefreshCw,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { JargonTooltip } from '@/components/ui/Tooltip';
import {
  getOpenLoops,
  createOpenLoop,
  updateOpenLoop,
  completeOpenLoop,
  deleteOpenLoop,
  updateOpenLoopStatus,
  getOpenLoopsStats,
  calculateDaysOpen,
  formatDate,
  type OpenLoop,
  type CreateOpenLoopInput
} from '@/lib/services/openLoopsService';
import { useBusinessContext } from '@/hooks/useBusinessContext';

type StatusType = 'in-progress' | 'stuck' | 'on-hold';
type FilterType = 'all' | StatusType;

const STATUS_CONFIG = {
  'in-progress': {
    label: 'In Progress',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    borderColor: 'border-l-emerald-500',
    icon: Play,
    bgHover: 'hover:bg-emerald-50'
  },
  'stuck': {
    label: 'Stuck',
    color: 'bg-red-100 text-red-800 border-red-200',
    borderColor: 'border-l-red-500',
    icon: AlertTriangle,
    bgHover: 'hover:bg-red-50'
  },
  'on-hold': {
    label: 'On Hold',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    borderColor: 'border-l-amber-500',
    icon: Pause,
    bgHover: 'hover:bg-amber-50'
  }
};

// Skeleton loader for cards
function LoopCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-100 rounded w-1/2"></div>
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

// Status badge component
function StatusBadge({ status, size = 'md' }: { status: StatusType; size?: 'sm' | 'md' }) {
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

// Days open badge with urgency coloring
function DaysOpenBadge({ days }: { days: number }) {
  let colorClass = 'bg-gray-100 text-gray-600';
  let urgencyIcon = null;

  if (days >= 30) {
    colorClass = 'bg-red-100 text-red-700';
    urgencyIcon = <AlertTriangle className="w-3 h-3" />;
  } else if (days >= 14) {
    colorClass = 'bg-amber-100 text-amber-700';
  } else if (days >= 7) {
    colorClass = 'bg-blue-100 text-blue-700';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}>
      <Clock className="w-3 h-3" />
      {days}d open
      {urgencyIcon}
    </span>
  );
}

// Loop card component
function LoopCard({
  loop,
  onComplete,
  onEdit,
  onDelete,
  onStatusChange,
  isUpdating
}: {
  loop: OpenLoop;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: StatusType) => void;
  isUpdating: boolean;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const daysOpen = calculateDaysOpen(loop.start_date);
  const config = STATUS_CONFIG[loop.status as StatusType];
  const isOverdue = loop.expected_completion_date && new Date(loop.expected_completion_date) < new Date();
  const isOld = daysOpen >= 30;

  return (
    <div
      className={`
        bg-white rounded-xl border-l-4 border border-gray-200
        ${config.borderColor}
        ${isOld || loop.status === 'stuck' ? 'ring-1 ring-red-100' : ''}
        transition-all duration-200 hover:shadow-md
      `}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Title and badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900 text-lg">{loop.title}</h3>
              {isOverdue && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3" />
                  Overdue
                </span>
              )}
            </div>

            {/* Blocker warning */}
            {loop.blocker && (
              <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 border border-red-100 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{loop.blocker}</p>
              </div>
            )}

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={loop.status as StatusType} />
              <DaysOpenBadge days={daysOpen} />
              {loop.owner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                  <User className="w-3 h-3" />
                  {loop.owner}
                </span>
              )}
            </div>

            {/* Expanded details */}
            {expanded && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Started: {formatDate(loop.start_date)}</span>
                </div>
                {loop.expected_completion_date && (
                  <div className={`flex items-center gap-2 ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                    <Calendar className="w-4 h-4" />
                    <span>Target: {formatDate(loop.expected_completion_date)}</span>
                    {isOverdue && <span className="font-medium">(Overdue)</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-start gap-1 flex-shrink-0">
            {/* Status change dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={isUpdating}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Change status"
              >
                {isUpdating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
              </button>

              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            onStatusChange(key as StatusType);
                            setShowStatusMenu(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${cfg.bgHover} ${
                            loop.status === key ? 'bg-gray-50 font-medium' : ''
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {cfg.label}
                          {loop.status === key && <Check className="w-4 h-4 ml-auto text-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit3 className="w-5 h-5" />
            </button>

            <button
              onClick={onComplete}
              className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Mark complete"
            >
              <Check className="w-5 h-5" />
            </button>

            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="w-5 h-5" />
            </button>
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
  loop,
  onConfirm,
  onCancel
}: {
  loop: OpenLoop;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-100 rounded-full">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Delete Loop</h3>
            <p className="text-sm text-gray-500">This action cannot be undone</p>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg mb-6">
          <p className="font-medium text-gray-900">{loop.title}</p>
          <p className="text-sm text-gray-500 mt-1">
            {calculateDaysOpen(loop.start_date)} days open
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Delete Loop
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OpenLoopsPage() {
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, inProgress: 0, stuck: 0, onHold: 0 });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteLoop, setDeleteLoop] = useState<OpenLoop | null>(null);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'status'>('newest');

  // Form state
  const [formData, setFormData] = useState<CreateOpenLoopInput>({
    title: '',
    start_date: new Date().toISOString().split('T')[0],
    expected_completion_date: null,
    owner: 'Me',
    status: 'in-progress',
    blocker: null
  });

  // Filtered and sorted loops
  const filteredLoops = useMemo(() => {
    let result = [...loops];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(query) ||
        l.owner?.toLowerCase().includes(query) ||
        l.blocker?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(l => l.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'status') {
        const order = { 'stuck': 0, 'in-progress': 1, 'on-hold': 2 };
        return (order[a.status as keyof typeof order] || 0) - (order[b.status as keyof typeof order] || 0);
      }
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [loops, searchQuery, statusFilter, sortBy]);

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
      const [activeLoops, statsData] = await Promise.all([
        getOpenLoops(undefined, overrideUserId),
        getOpenLoopsStats(overrideUserId)
      ]);

      setLoops(activeLoops);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError('Failed to load open loops');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const overrideUserId = activeBusiness?.ownerId;
      if (editingId) {
        await updateOpenLoop(editingId, formData);
      } else {
        await createOpenLoop(formData, overrideUserId);
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError('Failed to save open loop');
      console.error(err);
    }
  }

  function resetForm() {
    setFormData({
      title: '',
      start_date: new Date().toISOString().split('T')[0],
      expected_completion_date: null,
      owner: 'Me',
      status: 'in-progress',
      blocker: null
    });
    setShowForm(false);
    setEditingId(null);
  }

  async function handleComplete(id: string) {
    try {
      setUpdatingId(id);
      await completeOpenLoop(id);
      await loadData();
    } catch (err) {
      setError('Failed to complete loop');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleStatusChange(id: string, newStatus: StatusType) {
    try {
      setUpdatingId(id);
      await updateOpenLoopStatus(id, newStatus);
      await loadData();
    } catch (err) {
      setError('Failed to update status');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteLoop) return;

    try {
      await deleteOpenLoop(deleteLoop.id);
      setDeleteLoop(null);
      await loadData();
    } catch (err) {
      setError('Failed to delete loop');
      console.error(err);
    }
  }

  function handleEdit(loop: OpenLoop) {
    setFormData({
      title: loop.title,
      start_date: loop.start_date,
      expected_completion_date: loop.expected_completion_date,
      owner: loop.owner,
      status: loop.status,
      blocker: loop.blocker
    });
    setEditingId(loop.id);
    setShowForm(true);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                <JargonTooltip term="openLoops">Open Loops</JargonTooltip>
              </h1>
              <p className="text-sm text-gray-600 mt-1">Track your in-progress projects and initiatives</p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium shadow-sm"
            >
              <Plus className="h-5 w-5" />
              <span>Add Loop</span>
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setStatusFilter('all')}
              className={`p-3 rounded-xl border-2 transition-all ${
                statusFilter === 'all'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs font-medium text-gray-600">Total Loops</p>
            </button>
            <button
              onClick={() => setStatusFilter('in-progress')}
              className={`p-3 rounded-xl border-2 transition-all ${
                statusFilter === 'in-progress'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <p className="text-2xl font-bold text-emerald-600">{stats.inProgress}</p>
              <p className="text-xs font-medium text-gray-600">In Progress</p>
            </button>
            <button
              onClick={() => setStatusFilter('stuck')}
              className={`p-3 rounded-xl border-2 transition-all ${
                statusFilter === 'stuck'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <p className="text-2xl font-bold text-red-600">{stats.stuck}</p>
              <p className="text-xs font-medium text-gray-600">Stuck</p>
            </button>
            <button
              onClick={() => setStatusFilter('on-hold')}
              className={`p-3 rounded-xl border-2 transition-all ${
                statusFilter === 'on-hold'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <p className="text-2xl font-bold text-amber-600">{stats.onHold}</p>
              <p className="text-xs font-medium text-gray-600">On Hold</p>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search loops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="status">By Status</option>
          </select>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <p className="text-red-700">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 rounded"
            >
              <X className="w-5 h-5 text-red-600" />
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <LoopCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredLoops.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            {loops.length === 0 ? (
              <>
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No open loops</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  You're all caught up! Add a new loop when you start a project or initiative you want to track.
                </p>
                <button
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
                >
                  <Plus className="h-5 w-5" />
                  Add your first loop
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No matching loops</h3>
                <p className="text-gray-600 mb-4">
                  Try adjusting your search or filter criteria
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          /* Loop Cards */
          <div className="space-y-4">
            {filteredLoops.map((loop) => (
              <LoopCard
                key={loop.id}
                loop={loop}
                onComplete={() => handleComplete(loop.id)}
                onEdit={() => handleEdit(loop)}
                onDelete={() => setDeleteLoop(loop)}
                onStatusChange={(status) => handleStatusChange(loop.id, status)}
                isUpdating={updatingId === loop.id}
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
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingId ? 'Edit Loop' : 'Add New Loop'}
              </h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Loop Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Implement new CRM system"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-lg"
                  autoFocus
                />
              </div>

              {/* Dates Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Target Date <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={formData.expected_completion_date || ''}
                    onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value || null })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Owner & Status Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Assigned To
                  </label>
                  <input
                    type="text"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="Me"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as StatusType })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="in-progress">In Progress</option>
                    <option value="stuck">Stuck</option>
                    <option value="on-hold">On Hold</option>
                  </select>
                </div>
              </div>

              {/* Blocker */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Blocker <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={formData.blocker || ''}
                  onChange={(e) => setFormData({ ...formData, blocker: e.target.value || null })}
                  placeholder="What's preventing progress? e.g., Waiting on vendor response"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors font-medium"
                >
                  {editingId ? 'Save Changes' : 'Add Loop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteLoop && (
        <DeleteModal
          loop={deleteLoop}
          onConfirm={handleDelete}
          onCancel={() => setDeleteLoop(null)}
        />
      )}
    </div>
  );
}
