'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useBusinessContext } from '@/hooks/useBusinessContext';

function CreateGoalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const goalType = searchParams?.get('type') || 'annual';
  const supabase = createClient();
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();

  const [loading, setLoading] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [annualGoals, setAnnualGoals] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goal_type: goalType,
    category: 'strategic',
    start_date: new Date().toISOString().split('T')[0],
    end_date: goalType === 'annual' 
      ? new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    owner_name: '',
    target_metric: '',
    target_value: '',
    unit_of_measure: '',
    priority: '2',
    is_critical: false,
    parent_goal_id: '',
    notes: ''
  });

  useEffect(() => {
    if (!contextLoading) {
      loadBusinessAndGoals();
    }
  }, [contextLoading, activeBusiness?.id]);

  async function loadBusinessAndGoals() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Determine the correct business_profiles.id for data queries
      // Goals are stored with business_profiles.id
      let bizId: string | null = null;
      if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to look up the corresponding business_profiles.id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .single();

        bizId = profile?.id || null;
      } else {
        // Get user's own business profile
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();

        bizId = profile?.id || null;
      }

      if (bizId) {
        setBusinessId(bizId);

        // Load annual goals if creating a 90-day rock
        if (goalType === '90_day_rock') {
          const { data: goals } = await supabase
            .from('goals')
            .select('id, title')
            .eq('business_id', bizId)
            .eq('goal_type', 'annual')
            .order('priority');

          setAnnualGoals(goals || []);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !businessId) {
        throw new Error('Not authenticated or no business found');
      }

      const goalData = {
        business_id: businessId,
        created_by: user.id,
        title: formData.title,
        description: formData.description,
        goal_type: formData.goal_type,
        category: formData.category,
        start_date: formData.start_date,
        end_date: formData.end_date,
        owner_name: formData.owner_name,
        target_metric: formData.target_metric || null,
        target_value: formData.target_value ? parseFloat(formData.target_value) : null,
        unit_of_measure: formData.unit_of_measure || null,
        priority: parseInt(formData.priority),
        is_critical: formData.is_critical,
        parent_goal_id: formData.parent_goal_id || null,
        notes: formData.notes || null,
        status: 'not_started',
        progress_percentage: 0
      };

      const { error } = await supabase
        .from('goals')
        .insert([goalData]);

      if (error) throw error;

      router.push('/goals');
    } catch (error) {
      console.error('Error creating goal:', error);
      alert('Failed to create goal. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Create {goalType === 'annual' ? 'Annual Goal' : '90-Day Rock'}
              </h1>
              <p className="text-gray-600 mt-1">
                {goalType === 'annual' 
                  ? 'Set a strategic objective for the year'
                  : 'Define a quarterly priority to achieve your annual goals'}
              </p>
            </div>
            <Link
              href="/goals"
              className="text-gray-600 hover:text-gray-900"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Goal Type Selector */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Goal Type</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, goal_type: 'annual' });
                  router.push('/goals/create?type=annual');
                }}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.goal_type === 'annual'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-lg font-semibold">Annual Goal</div>
                <div className="text-sm text-gray-600 mt-1">Year-long strategic objective</div>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, goal_type: '90_day_rock' });
                  router.push('/goals/create?type=90_day_rock');
                }}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.goal_type === '90_day_rock'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-lg font-semibold">90-Day Rock</div>
                <div className="text-sm text-gray-600 mt-1">Quarterly priority</div>
              </button>
            </div>
          </div>

          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Goal Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder={goalType === 'annual' ? 'e.g., Achieve $1M in revenue' : 'e.g., Launch new product line'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Describe what success looks like for this goal..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="strategic">Strategic</option>
                    <option value="financial">Financial</option>
                    <option value="customer">Customer</option>
                    <option value="operations">Operations</option>
                    <option value="team">Team</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority (1-5)
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="1">1 - Highest</option>
                    <option value="2">2 - High</option>
                    <option value="3">3 - Medium</option>
                    <option value="4">4 - Low</option>
                    <option value="5">5 - Lowest</option>
                  </select>
                </div>
              </div>

              {formData.goal_type === '90_day_rock' && annualGoals.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Linked to Annual Goal
                  </label>
                  <select
                    value={formData.parent_goal_id}
                    onChange={(e) => setFormData({ ...formData, parent_goal_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">None - Independent Rock</option>
                    {annualGoals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_critical"
                  checked={formData.is_critical}
                  onChange={(e) => setFormData({ ...formData, is_critical: e.target.checked })}
                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                />
                <label htmlFor="is_critical" className="ml-2 text-sm text-gray-700">
                  Mark as critical (must be achieved)
                </label>
              </div>
            </div>
          </div>

          {/* Timeline & Ownership */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline & Ownership</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner/Responsible Person
                </label>
                <input
                  type="text"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="e.g., John Smith, Sales Team"
                />
              </div>
            </div>
          </div>

          {/* Measurement */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Measurement</h2>
            <p className="text-sm text-gray-600 mb-4">Optional: Define how you'll measure progress</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What will you measure?
                </label>
                <input
                  type="text"
                  value={formData.target_metric}
                  onChange={(e) => setFormData({ ...formData, target_metric: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="e.g., Revenue, Customers, Units Sold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Value
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.target_value}
                    onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="e.g., 1000000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    value={formData.unit_of_measure}
                    onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="e.g., $, customers, %"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h2>
            
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Any additional context, resources needed, or dependencies..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between">
            <Link
              href="/goals"
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="bg-teal-600 text-white px-8 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : `Create ${goalType === 'annual' ? 'Annual Goal' : '90-Day Rock'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateGoalPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    }>
      <CreateGoalContent />
    </Suspense>
  );
}