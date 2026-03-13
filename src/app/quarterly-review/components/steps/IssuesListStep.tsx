'use client';

import { useEffect, useState } from 'react';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, IssueResolution } from '../../types';
import {
  Plus, X, AlertTriangle, CheckCircle2, MessageSquare, User,
  Calendar, Loader2, Lightbulb, ShieldAlert, Inbox
} from 'lucide-react';
import {
  getActiveIssues,
  createIssue,
  type Issue,
  type CreateIssueInput
} from '@/lib/services/issuesService';

interface IssuesListStepProps {
  review: QuarterlyReview;
  onUpdate: (issues: IssueResolution[]) => void;
}

export function IssuesListStep({ review, onUpdate }: IssuesListStepProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const { activeBusiness } = useBusinessContext();

  // Form state — matches CreateIssueInput exactly
  const [formData, setFormData] = useState<CreateIssueInput>({
    title: '',
    priority: null,
    status: 'new',
    owner: 'Me',
    stated_problem: null,
    root_cause: null,
    solution: null
  });

  const resolutions = review.issues_resolved || [];

  useEffect(() => {
    fetchIssues();
  }, []);

  const fetchIssues = async () => {
    try {
      const businessId = activeBusiness?.id;
      const overrideUserId = activeBusiness?.ownerId;
      const data = await getActiveIssues(overrideUserId, businessId);
      // Filter to only show unsolved issues
      const filtered = (data || []).filter(item => item.status !== 'solved');
      setIssues(filtered);
    } catch (error) {
      console.log('Issues fetch error:', error);
      setIssues([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddIssue = async () => {
    if (!formData.title.trim()) return;
    setIsAdding(true);

    try {
      const businessId = activeBusiness?.id;
      const newIssue = await createIssue(formData, undefined, businessId);
      setIssues([newIssue, ...issues]);
      setFormData({
        title: '',
        priority: null,
        status: 'new',
        owner: 'Me',
        stated_problem: null,
        root_cause: null,
        solution: null
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding issue:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const getResolution = (issueId: string): IssueResolution | undefined => {
    return resolutions.find(r => r.issueId === issueId);
  };

  const updateResolution = (issueId: string, issue: string, field: keyof IssueResolution, value: string) => {
    const existing = resolutions.find(r => r.issueId === issueId);
    const updated: IssueResolution[] = existing
      ? resolutions.map(r => r.issueId === issueId ? { ...r, [field]: value } : r)
      : [...resolutions, { issueId, issue, solution: '', owner: '', dueDate: '', [field]: value }];

    onUpdate(updated);
  };

  const removeResolution = (issueId: string) => {
    const updated = resolutions.filter(r => r.issueId !== issueId);
    onUpdate(updated);
  };

  const isResolved = (issueId: string) => {
    const resolution = getResolution(issueId);
    return resolution && resolution.solution && resolution.owner && resolution.dueDate;
  };

  const resolvedCount = issues.filter(i => isResolved(i.id)).length;

  const getPriorityLabel = (priority: number | null) => {
    if (!priority) return null;
    if (priority <= 1) return { label: 'High', color: 'bg-red-50 text-red-700 border-red-200' };
    if (priority <= 3) return { label: 'Medium', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'Low', color: 'bg-gray-50 text-gray-600 border-gray-200' };
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="2.3"
          subtitle="Identify, Discuss, and Solve business problems"
          estimatedTime={25}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="2.3"
        subtitle="Use the IDS framework to solve internal business problems and blockers"
        estimatedTime={25}
        tip="Focus on root causes, not symptoms. Issues are problems holding the business back."
      />

      {/* Progress */}
      {issues.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              resolvedCount === issues.length && issues.length > 0
                ? 'bg-slate-200'
                : 'bg-slate-100'
            }`}>
              {resolvedCount === issues.length && issues.length > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-gray-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-gray-600" />
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900">Issues Resolved</p>
              <p className="text-sm text-gray-600">{resolvedCount} of {issues.length} complete</p>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {issues.length > 0 ? Math.round((resolvedCount / issues.length) * 100) : 0}%
          </div>
        </div>
      )}

      {/* Add New Issue */}
      <div className="mb-6">
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-brand-orange hover:text-brand-orange transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add a business problem or blocker to discuss
          </button>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-brand-orange" />
                <span className="text-sm font-medium text-gray-700">New Issue</span>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Title */}
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddIssue()}
              placeholder="What's the problem? e.g. 'Lead conversion rate has dropped 20%'"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white"
              autoFocus
            />

            {/* Owner & Stated Problem */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Me"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority (optional)</label>
                <select
                  value={formData.priority ?? ''}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm bg-white"
                >
                  <option value="">No priority</option>
                  <option value="1">1 - Highest</option>
                  <option value="2">2 - High</option>
                  <option value="3">3 - Medium</option>
                  <option value="4">4 - Low</option>
                  <option value="5">5 - Lowest</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddIssue}
                disabled={!formData.title.trim() || isAdding}
                className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium text-sm hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Issue
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Issues List */}
      {issues.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center border border-gray-200">
          <Inbox className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 mb-2">No Business Issues Tracked</h3>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            Think about what&apos;s blocking growth or causing friction in your business.
            Add problems that need solving above.
          </p>
          <div className="mt-4 text-left max-w-sm mx-auto">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Common examples:</p>
            <ul className="text-sm text-gray-600 space-y-1.5">
              <li className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-gray-400 flex-shrink-0" /> Cash flow is tight due to late-paying clients</li>
              <li className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-gray-400 flex-shrink-0" /> Team capacity bottleneck on delivery</li>
              <li className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-gray-400 flex-shrink-0" /> Lead pipeline has dried up</li>
              <li className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-gray-400 flex-shrink-0" /> No clear sales process or CRM</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {issues.map(issue => {
            const resolution = getResolution(issue.id);
            const resolved = isResolved(issue.id);
            const isActive = activeIssueId === issue.id;
            const priorityInfo = getPriorityLabel(issue.priority);

            return (
              <div
                key={issue.id}
                className={`rounded-xl border overflow-hidden transition-all ${
                  resolved ? 'bg-gray-50 border-slate-200' : 'bg-white border-gray-200'
                }`}
              >
                {/* Issue Header */}
                <button
                  onClick={() => setActiveIssueId(isActive ? null : issue.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {resolved ? (
                        <CheckCircle2 className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {issue.title}
                        </h4>
                        {issue.stated_problem && (
                          <p className="text-sm text-gray-600 mt-1">{issue.stated_problem}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {priorityInfo && (
                            <span className={`text-xs px-2 py-0.5 rounded border ${priorityInfo.color}`}>
                              {priorityInfo.label} Priority
                            </span>
                          )}
                          {issue.owner && (
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              {issue.owner}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${isActive ? 'text-brand-orange' : 'text-gray-400'}`}>
                      {isActive ? 'Collapse' : 'Expand'}
                    </span>
                  </div>
                </button>

                {/* IDS Resolution Form */}
                {isActive && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-4">
                    {/* Solution */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                        <MessageSquare className="w-4 h-4 text-brand-orange" />
                        Solution (What&apos;s the root cause and solution?)
                      </label>
                      <textarea
                        value={resolution?.solution || ''}
                        onChange={(e) => updateResolution(issue.id, issue.title, 'solution', e.target.value)}
                        placeholder="Describe the solution after discussing the root cause..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Owner */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                          <User className="w-4 h-4 text-gray-500" />
                          Owner
                        </label>
                        <input
                          type="text"
                          value={resolution?.owner || ''}
                          onChange={(e) => updateResolution(issue.id, issue.title, 'owner', e.target.value)}
                          placeholder="Who owns this?"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                      </div>

                      {/* Due Date */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          Due Date
                        </label>
                        <input
                          type="date"
                          value={resolution?.dueDate || ''}
                          onChange={(e) => updateResolution(issue.id, issue.title, 'dueDate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* Clear Button */}
                    {resolution && (
                      <button
                        onClick={() => removeResolution(issue.id)}
                        className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Clear Resolution
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* IDS Guide */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">IDS Framework — Business Problems</h4>
            <p className="text-sm text-gray-600 mt-1 mb-2">
              Issues are internal business problems and blockers — things holding you back from hitting your targets.
              Different from open loops, which are commitments made to others.
            </p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li><strong>Identify:</strong> State the issue clearly — what&apos;s the real problem?</li>
              <li><strong>Discuss:</strong> Explore root causes, not just symptoms</li>
              <li><strong>Solve:</strong> Agree on one clear solution with owner and due date</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
