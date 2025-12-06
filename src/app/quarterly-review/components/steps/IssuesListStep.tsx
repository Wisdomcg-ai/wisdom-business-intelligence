'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, IssueResolution } from '../../types';
import { Plus, X, AlertTriangle, CheckCircle2, MessageSquare, User, Calendar, Loader2, Lightbulb } from 'lucide-react';

interface IssuesListStepProps {
  review: QuarterlyReview;
  onUpdate: (issues: IssueResolution[]) => void;
}

interface Issue {
  id: string;
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low' | null;
  category?: string;
  created_at: string;
}

export function IssuesListStep({ review, onUpdate }: IssuesListStepProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newIssue, setNewIssue] = useState('');
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const supabase = createClient();

  const resolutions = review.issues_resolved || [];

  useEffect(() => {
    fetchIssues();
  }, []);

  const fetchIssues = async () => {
    try {
      // Get current user for query
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Fetch issues - uses user_id not business_id
      const { data, error } = await supabase
        .from('issues_list')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      // Handle different error types gracefully
      if (error) {
        console.log('Issues list query error:', error.message);
        setIssues([]);
      } else {
        // Filter to only show unsolved issues
        const filteredData = (data || []).filter((item: any) =>
          item.status !== 'solved'
        );
        setIssues(filteredData);
      }
    } catch (error) {
      console.log('Issues list table not available');
      setIssues([]);
    } finally {
      setIsLoading(false);
    }
  };

  const addNewIssue = async () => {
    if (!newIssue.trim()) return;

    try {
      const { data, error } = await supabase
        .from('issues_list')
        .insert({
          business_id: review.business_id,
          title: newIssue.trim(),
          priority: 'medium',
          is_resolved: false
        })
        .select()
        .single();

      if (error) throw error;
      setIssues([data, ...issues]);
      setNewIssue('');
    } catch (error) {
      console.error('Error adding issue:', error);
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

  const getPriorityColor = (priority: string) => {
    return 'bg-slate-100 text-gray-700 border-slate-200';
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="2.3"
          subtitle="Identify, Discuss, and Solve key issues"
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
        subtitle="Use the IDS (Identify, Discuss, Solve) framework to resolve issues"
        estimatedTime={25}
        tip="Focus on root causes, not symptoms"
      />

      {/* Progress */}
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

      {/* Add New Issue */}
      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newIssue}
            onChange={(e) => setNewIssue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNewIssue()}
            placeholder="Add a new issue to discuss..."
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
          />
          <button
            onClick={addNewIssue}
            disabled={!newIssue.trim()}
            className="px-4 py-3 bg-brand-orange text-white rounded-xl font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add
          </button>
        </div>
      </div>

      {/* Issues List */}
      {issues.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center border border-gray-200">
          <CheckCircle2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 mb-2">No Pending Issues!</h3>
          <p className="text-gray-700">
            Great job! Add any new issues that need to be resolved above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {issues.map(issue => {
            const resolution = getResolution(issue.id);
            const resolved = isResolved(issue.id);
            const isActive = activeIssueId === issue.id;

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
                        <h4 className={`font-semibold ${resolved ? 'text-gray-900' : 'text-gray-900'}`}>
                          {issue.title}
                        </h4>
                        {issue.description && (
                          <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {issue.priority && (
                          <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(issue.priority)}`}>
                            {issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1)} Priority
                          </span>
                        )}
                          {issue.category && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                              {issue.category}
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
                        Solution (What's the root cause and solution?)
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
            <h4 className="font-medium text-gray-900">IDS Framework</h4>
            <ul className="mt-2 text-sm text-gray-700 space-y-1">
              <li><strong>Identify:</strong> State the issue clearly - what's the real problem?</li>
              <li><strong>Discuss:</strong> Explore root causes, not just symptoms</li>
              <li><strong>Solve:</strong> Agree on one clear solution with owner and due date</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
