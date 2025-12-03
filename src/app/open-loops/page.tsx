'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, Trash2, ChevronDown } from 'lucide-react';
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

export default function OpenLoopsPage() {
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, inProgress: 0, stuck: 0, onHold: 0 });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateOpenLoopInput>({
    title: '',
    start_date: new Date().toISOString().split('T')[0],
    expected_completion_date: null,
    owner: 'Me',
    status: 'in-progress',
    blocker: null
  });

  // Load data on mount and when context changes
  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }
  }, [contextLoading, activeBusiness?.id]);

  async function loadData() {
    try {
      setLoading(true);
      // Pass ownerId when viewing as coach, otherwise undefined for current user
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
      // Pass ownerId when viewing as coach to create in client's account
      const overrideUserId = activeBusiness?.ownerId;
      if (editingId) {
        await updateOpenLoop(editingId, formData);
      } else {
        await createOpenLoop(formData, overrideUserId);
      }

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
      await loadData();
    } catch (err) {
      setError('Failed to save open loop');
      console.error(err);
    }
  }

  async function handleComplete(id: string) {
    try {
      await completeOpenLoop(id);
      await loadData();
    } catch (err) {
      setError('Failed to complete loop');
      console.error(err);
    }
  }

  async function handleStatusChange(id: string, newStatus: 'in-progress' | 'stuck' | 'on-hold') {
    try {
      await updateOpenLoopStatus(id, newStatus);
      await loadData();
    } catch (err) {
      setError('Failed to update status');
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this loop?')) return;
    
    try {
      await deleteOpenLoop(id);
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

  const statusColors = {
    'in-progress': 'text-green-700 bg-green-50',
    'stuck': 'text-red-700 bg-red-50',
    'on-hold': 'text-yellow-700 bg-yellow-50'
  };

  const statusLabels = {
    'in-progress': 'In Progress',
    'stuck': 'Stuck',
    'on-hold': 'On Hold'
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              <JargonTooltip term="openLoops">Open Loops</JargonTooltip>
            </h1>
            <p className="text-sm text-gray-600 mt-1">Your in-progress projects and initiatives</p>
          </div>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({
                title: '',
                start_date: new Date().toISOString().split('T')[0],
                expected_completion_date: null,
                owner: 'Me',
                status: 'in-progress',
                blocker: null
              });
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            Add New Loop
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-gray-600">Total: </span>
            <span className="font-bold text-gray-900">{stats.total}</span>
          </div>
          <div>
            <span className="text-gray-600">In Progress: </span>
            <span className="font-bold text-green-700">{stats.inProgress}</span>
          </div>
          <div>
            <span className="text-gray-600">Stuck: </span>
            <span className="font-bold text-red-700">{stats.stuck}</span>
          </div>
          <div>
            <span className="text-gray-600">On Hold: </span>
            <span className="font-bold text-yellow-700">{stats.onHold}</span>
          </div>
        </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading open loops...</div>
          </div>
        ) : loops.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-600 mb-4">No open loops yet. Great work! 🎉</p>
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({
                  title: '',
                  start_date: new Date().toISOString().split('T')[0],
                  expected_completion_date: null,
                  owner: 'Me',
                  status: 'in-progress',
                  blocker: null
                });
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add your first loop
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-1/4">
                      Loop Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-20">
                      Owner
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-32">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-40">
                      Started
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide w-40">
                      Target Date
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide w-20">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loops.map((loop) => {
                    const daysOpen = calculateDaysOpen(loop.start_date);
                    const statusColor = statusColors[loop.status as keyof typeof statusColors];
                    const statusLabel = statusLabels[loop.status as keyof typeof statusLabels];

                    return (
                      <tr key={loop.id} className="hover:bg-gray-50 transition-colors">
                        {/* Title */}
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{loop.title}</p>
                            {loop.blocker && (
                              <p className="text-xs text-red-700 mt-1">⚠️ {loop.blocker}</p>
                            )}
                          </div>
                        </td>

                        {/* Owner */}
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {loop.owner}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <select
                            value={loop.status}
                            onChange={(e) => handleStatusChange(loop.id, e.target.value as any)}
                            className={`px-3 py-1 rounded text-sm font-medium border-0 cursor-pointer ${statusColor}`}
                          >
                            <option value="in-progress">In Progress</option>
                            <option value="stuck">Stuck</option>
                            <option value="on-hold">On Hold</option>
                          </select>
                        </td>

                        {/* Started */}
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <div>{formatDate(loop.start_date)}</div>
                          <div className="text-xs text-gray-500">{daysOpen} days ago</div>
                        </td>

                        {/* Target Date */}
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {loop.expected_completion_date 
                            ? formatDate(loop.expected_completion_date)
                            : <span className="text-gray-400">Not set</span>
                          }
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleComplete(loop.id)}
                              title="Mark as complete"
                              className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                            >
                              <Check className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(loop.id)}
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
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingId ? 'Edit Loop' : 'Add New Loop'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loop Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Implement CRM System"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Expected Completion Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                <input
                  type="date"
                  value={formData.expected_completion_date || ''}
                  onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Owner */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Me, John, Sarah, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="in-progress">In Progress</option>
                  <option value="stuck">Stuck</option>
                  <option value="on-hold">On Hold</option>
                </select>
              </div>

              {/* Blocker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">What's Blocking? (optional)</label>
                <textarea
                  value={formData.blocker || ''}
                  onChange={(e) => setFormData({ ...formData, blocker: e.target.value || null })}
                  placeholder="E.g., Waiting on vendor response..."
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
                  {editingId ? 'Update' : 'Add Loop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}