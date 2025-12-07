'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Check,
  Trash2,
  Edit3,
  Search,
  AlertTriangle,
  AlertCircle,
  Target,
  MessageCircle,
  Wrench,
  CheckCircle2,
  X,
  User,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  RefreshCw
} from 'lucide-react';
import {
  getActiveIssues,
  getSolvedIssues,
  createIssue,
  updateIssue,
  solveIssue,
  deleteIssue,
  getIssuesStats,
  formatDate,
  type Issue,
  type CreateIssueInput
} from '@/lib/services/issuesService';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { PageHeader } from '@/components/ui/PageHeader';

type IssueStatus = 'new' | 'identified' | 'in-discussion' | 'solving' | 'solved';
type FilterStatus = 'all' | IssueStatus;

const STATUS_CONFIG = {
  'new': {
    label: 'New',
    color: 'bg-slate-100 text-gray-700 border-slate-200',
    borderColor: 'border-l-slate-400',
    icon: AlertCircle,
    bgHover: 'hover:bg-gray-50'
  },
  'identified': {
    label: 'Identified',
    color: 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200',
    borderColor: 'border-l-brand-orange',
    icon: Target,
    bgHover: 'hover:bg-brand-orange-50'
  },
  'in-discussion': {
    label: 'In Discussion',
    color: 'bg-brand-navy-50 text-brand-navy border-brand-navy-200',
    borderColor: 'border-l-brand-navy',
    icon: MessageCircle,
    bgHover: 'hover:bg-brand-navy-50'
  },
  'solving': {
    label: 'Solving',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    borderColor: 'border-l-amber-500',
    icon: Wrench,
    bgHover: 'hover:bg-amber-50'
  },
  'solved': {
    label: 'Solved',
    color: 'bg-brand-teal-50 text-brand-teal border-brand-teal-200',
    borderColor: 'border-l-brand-teal',
    icon: CheckCircle2,
    bgHover: 'hover:bg-brand-teal-50'
  }
};

// Skeleton loader for cards
function IssueCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 animate-pulse">
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

// Status badge component
function StatusBadge({ status, size = 'md' }: { status: IssueStatus; size?: 'sm' | 'md' }) {
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

// Priority badge component
function PriorityBadge({ priority }: { priority: number | null }) {
  if (!priority || priority > 3) return null;

  const colors = {
    1: 'bg-red-100 text-red-700 border-red-200 ring-1 ring-red-200',
    2: 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200',
    3: 'bg-yellow-100 text-yellow-700 border-yellow-200'
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${colors[priority as keyof typeof colors]}`}>
      P{priority}
      {priority === 1 && <AlertTriangle className="w-3 h-3" />}
    </span>
  );
}

// Issue card component
function IssueCard({
  issue,
  onSolve,
  onEdit,
  onDelete,
  onStatusChange,
  onPriorityChange,
  isUpdating,
  isSolvedTab
}: {
  issue: Issue;
  onSolve: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: IssueStatus) => void;
  onPriorityChange: (priority: number | null) => void;
  isUpdating: boolean;
  isSolvedTab: boolean;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[issue.status as IssueStatus];
  const isTopPriority = issue.priority && issue.priority <= 3;

  return (
    <div
      className={`
        bg-white rounded-xl border-l-4 border border-gray-200
        ${config.borderColor}
        ${isTopPriority ? 'ring-1 ring-red-100' : ''}
        transition-all duration-200 hover:shadow-md
      `}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Title row with badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900 text-base sm:text-lg">{issue.title}</h3>
              {issue.priority && issue.priority <= 3 && (
                <PriorityBadge priority={issue.priority} />
              )}
            </div>

            {/* Stated problem preview */}
            {issue.stated_problem && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {issue.stated_problem}
              </p>
            )}

            {/* Root cause highlight if identified */}
            {issue.root_cause && (
              <div className="flex items-start gap-2 p-2 mb-3 bg-brand-orange-50 border border-brand-orange-100 rounded-lg">
                <Target className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-brand-orange-700">Root Cause:</p>
                  <p className="text-sm text-brand-orange-800">{issue.root_cause}</p>
                </div>
              </div>
            )}

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={issue.status as IssueStatus} size="sm" />
              {issue.owner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-gray-600">
                  <User className="w-3 h-3" />
                  {issue.owner}
                </span>
              )}
            </div>

            {/* Expanded details */}
            {expanded && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 text-sm">
                {issue.stated_problem && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stated Problem</p>
                    <p className="text-gray-700">{issue.stated_problem}</p>
                  </div>
                )}
                {issue.root_cause && (
                  <div>
                    <p className="text-xs font-semibold text-brand-orange uppercase tracking-wide mb-1">Root Cause</p>
                    <p className="text-gray-700">{issue.root_cause}</p>
                  </div>
                )}
                {issue.solution && (
                  <div>
                    <p className="text-xs font-semibold text-brand-teal uppercase tracking-wide mb-1">Solution</p>
                    <p className="text-gray-700">{issue.solution}</p>
                  </div>
                )}
                <div className="flex items-center gap-4 pt-2 text-xs text-gray-500">
                  <span>Created: {formatDate(issue.created_at)}</span>
                  {issue.updated_at && <span>Updated: {formatDate(issue.updated_at)}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-start gap-1 flex-shrink-0">
            {/* Priority selector */}
            {!isSolvedTab && (
              <div className="relative">
                <button
                  onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                  disabled={isUpdating}
                  className={`p-2 rounded-lg transition-colors ${
                    issue.priority && issue.priority <= 3
                      ? 'text-red-600 bg-red-50 hover:bg-red-100'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                  title="Set priority"
                >
                  <span className="text-sm font-bold">P</span>
                </button>

                {showPriorityMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPriorityMenu(false)} />
                    <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      {[1, 2, 3, null].map((p) => (
                        <button
                          key={p || 'none'}
                          onClick={() => {
                            onPriorityChange(p);
                            setShowPriorityMenu(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                            issue.priority === p ? 'bg-gray-50 font-medium' : ''
                          }`}
                        >
                          {p ? (
                            <>
                              <span className={`font-bold ${p === 1 ? 'text-red-600' : p === 2 ? 'text-brand-orange-600' : 'text-yellow-600'}`}>
                                P{p}
                              </span>
                              {p === 1 && <span className="text-xs text-gray-500">Top</span>}
                            </>
                          ) : (
                            <span className="text-gray-500">No priority</span>
                          )}
                          {issue.priority === p && <Check className="w-4 h-4 ml-auto text-brand-teal" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

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
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            onStatusChange(key as IssueStatus);
                            setShowStatusMenu(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${cfg.bgHover} ${
                            issue.status === key ? 'bg-gray-50 font-medium' : ''
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {cfg.label}
                          {issue.status === key && <Check className="w-4 h-4 ml-auto text-brand-teal" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit3 className="w-5 h-5" />
            </button>

            {!isSolvedTab && (
              <button
                onClick={onSolve}
                className="p-2 text-gray-500 hover:text-brand-teal hover:bg-brand-teal-50 rounded-lg transition-colors"
                title="Mark as solved"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            )}

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
  issue,
  onConfirm,
  onCancel
}: {
  issue: Issue;
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
            <h3 className="text-lg font-semibold text-gray-900">Delete Issue</h3>
            <p className="text-sm text-gray-500">This action cannot be undone</p>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg mb-6">
          <p className="font-medium text-gray-900">{issue.title}</p>
          <div className="flex gap-2 mt-2">
            <StatusBadge status={issue.status as IssueStatus} size="sm" />
          </div>
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
            Delete Issue
          </button>
        </div>
      </div>
    </div>
  );
}

// IDS Methodology Info Box
function IDSInfoBox() {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('issuesInfoExpanded');
      return stored === 'true';
    }
    return false;
  });

  function toggleInfo() {
    const newState = !expanded;
    setExpanded(newState);
    localStorage.setItem('issuesInfoExpanded', newState.toString());
  }

  return (
    <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl overflow-hidden">
      <button
        onClick={toggleInfo}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-brand-orange-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-brand-orange-100 rounded-lg">
            <Info className="h-4 w-4 text-brand-orange" />
          </div>
          <span className="font-medium text-brand-navy">How to Use Your Issues List</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-brand-orange" />
        ) : (
          <ChevronDown className="h-5 w-5 text-brand-orange" />
        )}
      </button>

      {expanded && (
        <div className="px-4 py-4 border-t border-brand-orange-200 bg-white text-sm text-gray-700 space-y-4">
          {/* Workflow Steps */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-slate-200 text-gray-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <p><strong>Capture issues as they come up</strong> — don't try to solve them in the moment</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-slate-200 text-gray-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <p><strong>Before your weekly meeting</strong>, rank your top 3 as P1, P2, P3</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-slate-200 text-gray-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <p><strong>In the meeting, IDS each one</strong> with your team:</p>
            </div>
          </div>

          {/* IDS Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 ml-9">
            <div className="p-3 bg-brand-orange-50 rounded-lg border border-brand-orange-100">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-brand-orange" />
                <span className="font-semibold text-brand-orange-800">Identify</span>
              </div>
              <p className="text-xs text-brand-orange-700">Find the real root cause, not just the symptom</p>
            </div>
            <div className="p-3 bg-brand-navy-50 rounded-lg border border-brand-navy-200">
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-4 h-4 text-brand-navy" />
                <span className="font-semibold text-brand-navy">Discuss</span>
              </div>
              <p className="text-xs text-brand-navy">Everyone shares their thoughts openly</p>
            </div>
            <div className="p-3 bg-brand-teal-50 rounded-lg border border-brand-teal-200">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-brand-teal" />
                <span className="font-semibold text-brand-teal">Solve</span>
              </div>
              <p className="text-xs text-brand-teal">Decide, assign to-dos, and move on</p>
            </div>
          </div>

          {/* Pro Tip */}
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Root Cause Example:</strong> "Losing customers" is a symptom → the real root cause might be "no onboarding process". Fix the root cause to solve it once and for all.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IssuesListPage() {
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [solvedIssues, setSolvedIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    topPriority: 0,
    new: 0,
    identified: 0,
    inDiscussion: 0,
    solving: 0
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteIssueItem, setDeleteIssueItem] = useState<Issue | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'solved'>('active');

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority'>('priority');

  // Form state
  const [formData, setFormData] = useState<CreateIssueInput>({
    title: '',
    priority: null,
    status: 'new',
    owner: 'Me',
    stated_problem: null,
    root_cause: null,
    solution: null
  });

  // Filtered and sorted issues
  const filteredIssues = useMemo(() => {
    const sourceIssues = activeTab === 'active' ? issues : solvedIssues;
    let result = [...sourceIssues];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.title.toLowerCase().includes(query) ||
        i.owner?.toLowerCase().includes(query) ||
        i.stated_problem?.toLowerCase().includes(query) ||
        i.root_cause?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(i => i.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'priority') {
        // Priority 1 first, then 2, then 3, then null at end
        const pA = a.priority || 999;
        const pB = b.priority || 999;
        if (pA !== pB) return pA - pB;
        // Secondary sort by date
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [issues, solvedIssues, activeTab, searchQuery, statusFilter, sortBy]);

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
      const [activeData, solvedData, statsData] = await Promise.all([
        getActiveIssues(overrideUserId),
        getSolvedIssues(overrideUserId),
        getIssuesStats(overrideUserId)
      ]);

      setIssues(activeData);
      setSolvedIssues(solvedData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError('Failed to load issues');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      title: '',
      priority: null,
      status: 'new',
      owner: 'Me',
      stated_problem: null,
      root_cause: null,
      solution: null
    });
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const overrideUserId = activeBusiness?.ownerId;
      if (editingId) {
        await updateIssue(editingId, formData);
      } else {
        await createIssue(formData, overrideUserId);
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError('Failed to save issue');
      console.error(err);
    }
  }

  async function handleSolve(id: string) {
    try {
      setUpdatingId(id);
      await solveIssue(id);
      await loadData();
    } catch (err) {
      setError('Failed to solve issue');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteIssueItem) return;

    try {
      await deleteIssue(deleteIssueItem.id);
      setDeleteIssueItem(null);
      await loadData();
    } catch (err) {
      setError('Failed to delete issue');
      console.error(err);
    }
  }

  function handleEdit(issue: Issue) {
    setFormData({
      title: issue.title,
      priority: issue.priority,
      status: issue.status,
      owner: issue.owner,
      stated_problem: issue.stated_problem,
      root_cause: issue.root_cause,
      solution: issue.solution
    });
    setEditingId(issue.id);
    setShowForm(true);
  }

  async function handleStatusChange(id: string, newStatus: IssueStatus) {
    try {
      setUpdatingId(id);
      await updateIssue(id, { status: newStatus });
      await loadData();
    } catch (err) {
      setError('Failed to update status');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handlePriorityChange(id: string, newPriority: number | null) {
    try {
      setUpdatingId(id);
      await updateIssue(id, { priority: newPriority });
      await loadData();
    } catch (err) {
      setError('Failed to update priority');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Issues List"
        subtitle="Identify, discuss, and solve your business challenges"
        icon={AlertCircle}
        actions={
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium shadow-sm"
          >
            <Plus className="h-5 w-5" />
            <span>Add Issue</span>
          </button>
        }
      />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <button
            onClick={() => setStatusFilter('all')}
            className={`p-3 rounded-xl border-2 transition-all ${
              statusFilter === 'all'
                ? 'border-brand-orange-500 bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs font-medium text-gray-600">Total Issues</p>
          </button>
          <button
            onClick={() => { setStatusFilter('all'); setSortBy('priority'); }}
            className={`p-3 rounded-xl border-2 transition-all ${
              sortBy === 'priority' && statusFilter === 'all'
                ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-red-600">{stats.topPriority}</p>
            <p className="text-xs font-medium text-gray-600">Top 3 Priority</p>
          </button>
          <button
            onClick={() => setStatusFilter('new')}
            className={`p-3 rounded-xl border-2 transition-all ${
              statusFilter === 'new'
                ? 'border-slate-500 bg-gray-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-gray-600">{stats.new}</p>
            <p className="text-xs font-medium text-gray-600">New</p>
          </button>
          <button
            onClick={() => setStatusFilter('identified')}
            className={`p-3 rounded-xl border-2 transition-all ${
              statusFilter === 'identified'
                ? 'border-brand-orange-500 bg-brand-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-brand-orange">{stats.identified}</p>
            <p className="text-xs font-medium text-gray-600">Identified</p>
          </button>
          <button
            onClick={() => setStatusFilter('in-discussion')}
            className={`p-3 rounded-xl border-2 transition-all ${
              statusFilter === 'in-discussion'
                ? 'border-brand-navy bg-brand-navy-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-brand-navy">{stats.inDiscussion}</p>
            <p className="text-xs font-medium text-gray-600">In Discussion</p>
          </button>
          <button
            onClick={() => setStatusFilter('solving')}
            className={`p-3 rounded-xl border-2 transition-all ${
              statusFilter === 'solving'
                ? 'border-amber-500 bg-amber-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold text-amber-600">{stats.solving}</p>
            <p className="text-xs font-medium text-gray-600">Solving</p>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'active'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Active ({issues.length})
          </button>
          <button
            onClick={() => setActiveTab('solved')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'solved'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Solved ({solvedIssues.length})
          </button>
        </div>
        {/* IDS Info Box */}
        <div className="mb-6">
          <IDSInfoBox />
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search issues..."
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
            <option value="priority">By Priority</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
          {(statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="px-4 py-2.5 text-brand-orange hover:text-brand-orange-700 font-medium"
            >
              Clear filters
            </button>
          )}
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
              <IssueCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredIssues.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
            {(activeTab === 'active' ? issues : solvedIssues).length === 0 ? (
              <>
                <div className="w-16 h-16 bg-brand-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-brand-teal" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                  {activeTab === 'active' ? 'No active issues' : 'No solved issues yet'}
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  {activeTab === 'active'
                    ? 'Great work! Add issues as they come up to track and solve them systematically.'
                    : 'Solved issues will appear here for reference.'}
                </p>
                {activeTab === 'active' && (
                  <button
                    onClick={() => {
                      resetForm();
                      setShowForm(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium"
                  >
                    <Plus className="h-5 w-5" />
                    Add your first issue
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No matching issues</h3>
                <p className="text-gray-600 mb-4">
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
          /* Issue Cards */
          <div className="space-y-4">
            {filteredIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onSolve={() => handleSolve(issue.id)}
                onEdit={() => handleEdit(issue)}
                onDelete={() => setDeleteIssueItem(issue)}
                onStatusChange={(status) => handleStatusChange(issue.id, status)}
                onPriorityChange={(priority) => handlePriorityChange(issue.id, priority)}
                isUpdating={updatingId === issue.id}
                isSolvedTab={activeTab === 'solved'}
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
                  <AlertCircle className="w-5 h-5 text-brand-orange" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  {editingId ? 'Edit Issue' : 'Add New Issue'}
                </h2>
              </div>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Issue Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., High staff turnover"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-lg"
                  autoFocus
                />
              </div>

              {/* Priority & Owner Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Priority <span className="text-gray-400 font-normal">(1-3 for IDS)</span>
                  </label>
                  <select
                    value={formData.priority || ''}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  >
                    <option value="">No priority</option>
                    <option value="1">P1 (Top Priority)</option>
                    <option value="2">P2</option>
                    <option value="3">P3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Owner
                  </label>
                  <input
                    type="text"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="Me, Sarah, Mike, etc."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>
              </div>

              {/* Stated Problem */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Stated Problem <span className="text-gray-400 font-normal">(the symptom)</span>
                </label>
                <textarea
                  value={formData.stated_problem || ''}
                  onChange={(e) => setFormData({ ...formData, stated_problem: e.target.value || null })}
                  placeholder="E.g., We're losing customers month over month"
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                />
              </div>

              {/* Root Cause */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Root Cause <span className="text-gray-400 font-normal">(the real issue)</span>
                </label>
                <textarea
                  value={formData.root_cause || ''}
                  onChange={(e) => setFormData({ ...formData, root_cause: e.target.value || null })}
                  placeholder="E.g., No structured customer onboarding process"
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                />
              </div>

              {/* Solution */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Solution <span className="text-gray-400 font-normal">(how to fix it)</span>
                </label>
                <textarea
                  value={formData.solution || ''}
                  onChange={(e) => setFormData({ ...formData, solution: e.target.value || null })}
                  placeholder="E.g., Create and implement a 30-day onboarding checklist"
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                />
              </div>

              {/* Tip */}
              <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-lg p-3">
                <p className="text-xs text-brand-orange-800">
                  <strong>Focus on root cause.</strong> Add the issue now, then work through root cause
                  and solution during your weekly IDS session with your team.
                </p>
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
                  className="flex-1 px-4 py-3 text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors font-medium"
                >
                  {editingId ? 'Save Changes' : 'Add Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteIssueItem && (
        <DeleteModal
          issue={deleteIssueItem}
          onConfirm={handleDelete}
          onCancel={() => setDeleteIssueItem(null)}
        />
      )}
    </div>
  );
}
