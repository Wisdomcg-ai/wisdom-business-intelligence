'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, Trash2, ChevronDown, ChevronUp, Info } from 'lucide-react';
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
    inDiscussion: 0,
    problems: 0,
    opportunities: 0
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'solved'>('active');
  const [expandedInfo, setExpandedInfo] = useState(true);

  // Form state
  const [formData, setFormData] = useState<CreateIssueInput>({
    title: '',
    issue_type: 'problem',
    priority: null,
    status: 'new',
    owner: 'Me',
    stated_problem: null,
    root_cause: null,
    solution: null
  });

  // Load data on mount and when context changes
  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }

    // Check localStorage for info box state
    const stored = localStorage.getItem('issuesInfoExpanded');
    if (stored === 'false') {
      setExpandedInfo(false);
    }
  }, [contextLoading, activeBusiness?.id]);

  async function loadData() {
    try {
      setLoading(true);
      // Pass ownerId when viewing as coach, otherwise undefined for current user
      const overrideUserId = activeBusiness?.ownerId;
      console.log('[IssuesListPage] loadData called - activeBusiness:', activeBusiness?.id, 'ownerId:', overrideUserId);
      const [activeData, solvedData, statsData] = await Promise.all([
        getActiveIssues(overrideUserId),
        getSolvedIssues(overrideUserId),
        getIssuesStats(overrideUserId)
      ]);
      console.log('[IssuesListPage] Data loaded - issues:', activeData.length, 'solved:', solvedData.length);

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

  function toggleInfo() {
    const newState = !expandedInfo;
    setExpandedInfo(newState);
    localStorage.setItem('issuesInfoExpanded', newState.toString());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (editingId) {
        await updateIssue(editingId, formData);
      } else {
        await createIssue(formData);
      }

      setFormData({
        title: '',
        issue_type: 'problem',
        priority: null,
        status: 'new',
        owner: 'Me',
        stated_problem: null,
        root_cause: null,
        solution: null
      });
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError('Failed to save issue');
      console.error(err);
    }
  }

  async function handleSolve(id: string) {
    try {
      await solveIssue(id);
      await loadData();
    } catch (err) {
      setError('Failed to solve issue');
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this issue?')) return;

    try {
      await deleteIssue(id);
      await loadData();
    } catch (err) {
      setError('Failed to delete issue');
      console.error(err);
    }
  }

  function handleEdit(issue: Issue) {
    setFormData({
      title: issue.title,
      issue_type: issue.issue_type,
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

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      await updateIssue(id, { status: newStatus as any });
      await loadData();
    } catch (err) {
      setError('Failed to update status');
      console.error(err);
    }
  }

  async function handlePriorityChange(id: string, newPriority: number | null) {
    try {
      await updateIssue(id, { priority: newPriority });
      await loadData();
    } catch (err) {
      setError('Failed to update priority');
      console.error(err);
    }
  }

  const displayedIssues = activeTab === 'active' ? issues : solvedIssues;

  const typeColors = {
    problem: 'bg-red-50 text-red-700',
    opportunity: 'bg-green-50 text-green-700',
    idea: 'bg-teal-50 text-teal-700',
    challenge: 'bg-yellow-50 text-yellow-700'
  };

  const statusColors = {
    new: 'bg-gray-50 text-gray-700',
    identified: 'bg-teal-50 text-teal-700',
    'in-discussion': 'bg-purple-50 text-purple-700',
    solving: 'bg-yellow-50 text-yellow-700',
    solved: 'bg-green-50 text-green-700'
  };

  const typeLabels = {
    problem: 'Problem',
    opportunity: 'Opportunity',
    idea: 'Idea',
    challenge: 'Challenge'
  };

  const statusLabels = {
    new: 'New',
    identified: 'Identified',
    'in-discussion': 'In Discussion',
    solving: 'Solving',
    solved: 'Solved'
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Issues List</h1>
            <p className="text-sm text-gray-600 mt-1">Identify, discuss, and solve your business challenges and opportunities</p>
          </div>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({
                title: '',
                issue_type: 'problem',
                priority: null,
                status: 'new',
                owner: 'Me',
                stated_problem: null,
                root_cause: null,
                solution: null
              });
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            Add New Issue
          </button>
        </div>

        {/* Info Box - Collapsible */}
        <div className="mb-6 bg-teal-50 border border-teal-200 rounded-lg overflow-hidden">
          <button
            onClick={toggleInfo}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-teal-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-teal-600 flex-shrink-0" />
              <span className="font-medium text-teal-900">How to Use the Issues List</span>
            </div>
            {expandedInfo ? (
              <ChevronUp className="h-5 w-5 text-teal-600" />
            ) : (
              <ChevronDown className="h-5 w-5 text-teal-600" />
            )}
          </button>

          {expandedInfo && (
            <div className="px-4 py-4 border-t border-teal-200 bg-white text-sm text-gray-700 space-y-3">
              <p>
                <strong>What is an Issue?</strong> An Issue is any problem, opportunity, idea, or challenge worth your team's attention. The magic is in solving issues <em>once and for all</em> by finding the root cause.
              </p>

              <p>
                <strong>How to Use It:</strong> Each week, pick your top 3 issues and IDS them with your team:
              </p>

              <ul className="ml-4 space-y-1 list-disc">
                <li><strong>Identify</strong> the root cause (dig past the symptoms)</li>
                <li><strong>Discuss</strong> openly — everyone shares their thoughts</li>
                <li><strong>Solve</strong> it — decide, assign action items, move on</li>
              </ul>

              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                <p className="text-xs font-medium text-yellow-900 mb-1">💡 Pro Tip:</p>
                <p className="text-xs text-yellow-800">
                  "We're losing customers" (symptom) → real root cause is "no onboarding process" (the issue to fix). Only fixing the symptom means the problem returns forever.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div>
            <p className="text-gray-600">Top 3</p>
            <p className="text-2xl font-bold text-red-700">{stats.topPriority}</p>
          </div>
          <div>
            <p className="text-gray-600">New</p>
            <p className="text-2xl font-bold text-gray-700">{stats.new}</p>
          </div>
          <div>
            <p className="text-gray-600">In Discussion</p>
            <p className="text-2xl font-bold text-purple-700">{stats.inDiscussion}</p>
          </div>
          <div>
            <p className="text-gray-600">Problems</p>
            <p className="text-2xl font-bold text-red-700">{stats.problems}</p>
          </div>
          <div>
            <p className="text-gray-600">Opportunities</p>
            <p className="text-2xl font-bold text-green-700">{stats.opportunities}</p>
          </div>
        </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'active'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Active ({issues.length})
          </button>
          <button
            onClick={() => setActiveTab('solved')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'solved'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Solved ({solvedIssues.length})
          </button>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading issues...</div>
          </div>
        ) : displayedIssues.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-600 mb-4">
              {activeTab === 'active' 
                ? 'No active issues. Great work! 🎉' 
                : 'No solved issues yet'}
            </p>
            {activeTab === 'active' && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setFormData({
                    title: '',
                    issue_type: 'problem',
                    priority: null,
                    status: 'new',
                    owner: 'Me',
                    stated_problem: null,
                    root_cause: null,
                    solution: null
                  });
                  setShowForm(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add your first issue
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-1/4">
                      Issue
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-20">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-16">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-32">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-20">
                      Owner
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide w-20">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {displayedIssues.map((issue) => {
                    const typeColor = typeColors[issue.issue_type as keyof typeof typeColors];
                    const statusColor = statusColors[issue.status as keyof typeof statusColors];
                    const typeLabel = typeLabels[issue.issue_type as keyof typeof typeLabels];
                    const statusLabel = statusLabels[issue.status as keyof typeof statusLabels];

                    return (
                      <tr key={issue.id} className="hover:bg-gray-50 transition-colors">
                        {/* Title */}
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{issue.title}</p>
                            {issue.stated_problem && (
                              <p className="text-xs text-gray-500 mt-1">Stated: {issue.stated_problem}</p>
                            )}
                            {issue.root_cause && (
                              <p className="text-xs text-teal-600 mt-1">Root: {issue.root_cause}</p>
                            )}
                          </div>
                        </td>

                        {/* Type */}
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${typeColor}`}>
                            {typeLabel}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="px-6 py-4">
                          <select
                            value={issue.priority || ''}
                            onChange={(e) => handlePriorityChange(issue.id, e.target.value ? parseInt(e.target.value) : null)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm font-medium"
                          >
                            <option value="">—</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <select
                            value={issue.status}
                            onChange={(e) => handleStatusChange(issue.id, e.target.value)}
                            className={`px-3 py-1 rounded text-sm font-medium border-0 cursor-pointer ${statusColor}`}
                          >
                            <option value="new">New</option>
                            <option value="identified">Identified</option>
                            <option value="in-discussion">In Discussion</option>
                            <option value="solving">Solving</option>
                            <option value="solved">Solved</option>
                          </select>
                        </td>

                        {/* Owner */}
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {issue.owner}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(issue)}
                              title="Edit"
                              className="p-2 text-teal-600 hover:bg-teal-50 rounded transition-colors"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                            {activeTab === 'active' && (
                              <button
                                onClick={() => handleSolve(issue.id)}
                                title="Mark as solved"
                                className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                              >
                                <Check className="h-5 w-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(issue.id)}
                              title="Delete"
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingId ? 'Edit Issue' : 'Add New Issue'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., High staff turnover"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={formData.issue_type}
                  onChange={(e) => setFormData({ ...formData, issue_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="problem">Problem</option>
                  <option value="opportunity">Opportunity</option>
                  <option value="idea">Idea</option>
                  <option value="challenge">Challenge</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority (1-3)</label>
                <p className="text-xs text-gray-500 mb-2">Pick your top 3 priorities each week for IDS</p>
                <select
                  value={formData.priority || ''}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">No priority</option>
                  <option value="1">1 (Top)</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>

              {/* Owner */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Me, Sarah, Mike, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Stated Problem */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stated Problem (optional)</label>
                <p className="text-xs text-gray-500 mb-2">How the problem first appeared (the symptom, not the cause)</p>
                <textarea
                  value={formData.stated_problem || ''}
                  onChange={(e) => setFormData({ ...formData, stated_problem: e.target.value || null })}
                  placeholder="E.g., We're losing customers"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Root Cause */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Root Cause (optional)</label>
                <p className="text-xs text-gray-500 mb-2">The real underlying issue (dig deep - what's really happening?)</p>
                <textarea
                  value={formData.root_cause || ''}
                  onChange={(e) => setFormData({ ...formData, root_cause: e.target.value || null })}
                  placeholder="E.g., No structured onboarding process"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Solution */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Solution (optional)</label>
                <p className="text-xs text-gray-500 mb-2">How you'll solve it once and for all</p>
                <textarea
                  value={formData.solution || ''}
                  onChange={(e) => setFormData({ ...formData, solution: e.target.value || null })}
                  placeholder="E.g., Create and implement a 30-day onboarding plan"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors font-medium"
                >
                  {editingId ? 'Update' : 'Add Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}