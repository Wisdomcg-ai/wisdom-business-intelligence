'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { getOpenLoops } from '@/lib/services/openLoopsService';
import { getActiveIssues } from '@/lib/services/issuesService';
import { type Issue } from '@/lib/services/issuesService';
import { type OpenLoop } from '@/lib/services/openLoopsService';
import { useBusinessContext } from '@/hooks/useBusinessContext';

export default function ExecutionStatusCard() {
  const { activeBusiness } = useBusinessContext();
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeBusiness?.ownerId]);

  async function loadData() {
    try {
      setLoading(true);
      // Pass ownerId for coach view - these tables use user_id
      const overrideUserId = activeBusiness?.ownerId;
      const [loopsData, issuesData] = await Promise.all([
        getOpenLoops(undefined, overrideUserId),
        getActiveIssues(overrideUserId)
      ]);

      setLoops(loopsData);
      setIssues(issuesData);
      setError(null);
    } catch (err) {
      console.error('Error loading execution status:', err);
      setError('Failed to load execution status');
    } finally {
      setLoading(false);
    }
  }

  // Calculate metrics
  const totalLoops = loops.length;
  const stuckLoops = loops.filter(l => l.status === 'stuck').length;
  const totalIssues = issues.length;
  const topPriorityIssues = issues.filter(i => i.priority && i.priority <= 3).length;

  // Determine health status
  const determineStatus = () => {
    if (stuckLoops >= 3 || topPriorityIssues >= 3) return { status: 'critical', color: 'bg-red-50', icon: '🔴' };
    if (stuckLoops >= 2 || topPriorityIssues >= 2) return { status: 'attention', color: 'bg-yellow-50', icon: '🟡' };
    return { status: 'healthy', color: 'bg-green-50', icon: '🟢' };
  };

  const { status, color, icon } = determineStatus();

  const statusMessages = {
    healthy: 'Execution is on track',
    attention: 'Review your priorities this week',
    critical: 'Urgent: Address blocked work immediately'
  };

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-gray-400" />
          <p className="text-gray-600">Loading execution status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-lg border border-red-200 p-6 mb-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${color} rounded-lg border border-gray-200 p-6 mb-6 transition-colors`}>
      {/* Header with Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">What's Slowing You Down</h3>
        </div>
        <span className="text-xs text-gray-500">Updated now</span>
      </div>

      {/* Status Message */}
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-900">
          {icon} {statusMessages[status as keyof typeof statusMessages]}
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Open Loops */}
        <div>
          <div className="text-sm text-gray-600 mb-1">Unfinished Projects</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalLoops}</span>
            {stuckLoops > 0 && (
              <span className="text-sm text-red-600 font-medium">({stuckLoops} stuck)</span>
            )}
          </div>
        </div>

        {/* Active Issues */}
        <div>
          <div className="text-sm text-gray-600 mb-1">Blocking Issues</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalIssues}</span>
            {topPriorityIssues > 0 && (
              <span className="text-sm text-brand-orange-600 font-medium">({topPriorityIssues} priority)</span>
            )}
          </div>
        </div>
      </div>

      {/* Alerts if needed */}
      {stuckLoops > 0 && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded flex gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Unfinished Work</p>
            <p className="text-xs text-red-700">{stuckLoops} project{stuckLoops > 1 ? 's are' : ' is'} stuck. Finish these before starting new ones.</p>
          </div>
        </div>
      )}

      {topPriorityIssues > 0 && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded flex gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900">Blocking Issues</p>
            <p className="text-xs text-yellow-700">{topPriorityIssues} friction point{topPriorityIssues > 1 ? 's' : ''} need diagnosis and removal.</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Link
          href="/open-loops"
          className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          View Open Loops
        </Link>
        <Link
          href="/issues-list"
          className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          View Issues List
        </Link>
      </div>
    </div>
  );
}