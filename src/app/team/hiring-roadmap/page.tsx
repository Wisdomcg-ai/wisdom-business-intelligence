'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Plus, Trash2, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';

interface HiringPriority {
  role: string;
  salary: string;
  start_date: string;
  comments: string;
}

interface HiringRoadmapData {
  hiring_priorities: HiringPriority[];
  recognition_rewards: string;
  growth_opportunities: string;
  work_environment: string;
  compensation_strategy: string;
}

export default function HiringRoadmapPage() {
  const router = useRouter();
  const supabase = createClient();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<string>('');
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<HiringRoadmapData>({
    hiring_priorities: [
      { role: '', salary: '', start_date: '', comments: '' },
      { role: '', salary: '', start_date: '', comments: '' }
    ],
    recognition_rewards: '',
    growth_opportunities: '',
    work_environment: '',
    compensation_strategy: ''
  });

  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }
  }, [contextLoading, activeBusiness?.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      // Load from team_data table
      const { data: existingData } = await supabase
        .from('team_data')
        .select('hiring_roadmap')
        .eq('user_id', targetUserId)
        .single();

      if (existingData?.hiring_roadmap) {
        setFormData(existingData.hiring_roadmap as HiringRoadmapData);
        lastSavedDataRef.current = JSON.stringify(existingData.hiring_roadmap);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading:', error);
      setLoading(false);
    }
  };

  const handleFieldChange = () => {
    setHasUnsavedChanges(true);
    setErrorMessage(null);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveData();
    }, 2000);
  };

  const saveData = async () => {
    const currentDataString = JSON.stringify(formData);
    if (currentDataString === lastSavedDataRef.current) {
      setHasUnsavedChanges(false);
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      const { error } = await supabase
        .from('team_data')
        .upsert({
          user_id: targetUserId,
          hiring_roadmap: formData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      lastSavedDataRef.current = currentDataString;
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (error: any) {
      console.error('Error saving:', error);
      setErrorMessage(error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateHiringPriority = (index: number, field: keyof HiringPriority, value: string) => {
    const newPriorities = [...formData.hiring_priorities];
    newPriorities[index] = { ...newPriorities[index], [field]: value };
    setFormData(prev => ({ ...prev, hiring_priorities: newPriorities }));
    handleFieldChange();
  };

  const addHiringPriority = () => {
    if (formData.hiring_priorities.length < 10) {
      setFormData(prev => ({
        ...prev,
        hiring_priorities: [...prev.hiring_priorities, { role: '', salary: '', start_date: '', comments: '' }]
      }));
      handleFieldChange();
    }
  };

  const removeHiringPriority = (index: number) => {
    if (formData.hiring_priorities.length > 2) {
      const newPriorities = formData.hiring_priorities.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, hiring_priorities: newPriorities }));
      handleFieldChange();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto mb-4"></div>
          <p className="text-gray-600">Loading hiring roadmap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <UserPlus className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Hiring Roadmap</h1>
                <p className="mt-2 text-gray-600">
                  Plan your hiring priorities and retention strategy
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {saving && (
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Save className="h-4 w-4 animate-pulse" />
                  Saving...
                </span>
              )}
              {!saving && lastSaved && (
                <span className="text-sm text-green-600">
                  ✓ Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {hasUnsavedChanges && !saving && (
                <span className="text-sm text-amber-600">Unsaved changes</span>
              )}
              {errorMessage && (
                <span className="text-sm text-red-600">Error: {errorMessage}</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Hiring Priorities */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Hiring Priorities</h2>
            <p className="text-gray-600 mb-4">
              What roles do you need to hire in the next 12 months to achieve your goals?
            </p>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-700">Role</th>
                    <th className="text-left p-3 font-medium text-gray-700">Estimated Annual Salary</th>
                    <th className="text-left p-3 font-medium text-gray-700">Estimated Start Date</th>
                    <th className="text-left p-3 font-medium text-gray-700">Comments</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {formData.hiring_priorities.map((priority, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3">
                        <input
                          type="text"
                          value={priority.role}
                          onChange={(e) => updateHiringPriority(index, 'role', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                          placeholder="e.g., Sales Manager"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={priority.salary}
                          onChange={(e) => updateHiringPriority(index, 'salary', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                          placeholder="e.g., $75,000"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="date"
                          value={priority.start_date}
                          onChange={(e) => updateHiringPriority(index, 'start_date', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={priority.comments}
                          onChange={(e) => updateHiringPriority(index, 'comments', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                          placeholder="Additional notes"
                        />
                      </td>
                      <td className="p-3">
                        {formData.hiring_priorities.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeHiringPriority(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {formData.hiring_priorities.length < 10 && (
              <button
                type="button"
                onClick={addHiringPriority}
                className="mt-4 flex items-center gap-2 px-4 py-2 text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Another Role
              </button>
            )}
            <p className="mt-2 text-sm text-gray-500">
              You can add up to {10 - formData.hiring_priorities.length} more roles
            </p>
          </div>

          {/* Retention Strategy */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Retention Strategy</h2>
            <p className="text-gray-600 mb-4">
              How will you keep your best people engaged and committed?
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recognition & Rewards
                </label>
                <textarea
                  value={formData.recognition_rewards}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, recognition_rewards: e.target.value }));
                    handleFieldChange();
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  rows={3}
                  placeholder="How will you recognize and reward great performance? (e.g., bonuses, public recognition, perks)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Growth Opportunities
                </label>
                <textarea
                  value={formData.growth_opportunities}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, growth_opportunities: e.target.value }));
                    handleFieldChange();
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  rows={3}
                  placeholder="What development and advancement opportunities will you offer? (e.g., training, mentorship, career paths)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Environment
                </label>
                <textarea
                  value={formData.work_environment}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, work_environment: e.target.value }));
                    handleFieldChange();
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  rows={3}
                  placeholder="What kind of workplace will you create? (e.g., flexibility, remote options, culture initiatives)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Compensation Strategy
                </label>
                <textarea
                  value={formData.compensation_strategy}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, compensation_strategy: e.target.value }));
                    handleFieldChange();
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  rows={3}
                  placeholder="How will you structure pay and benefits? (e.g., competitive base, bonuses, equity, benefits package)"
                />
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center pb-8">
            <button
              onClick={() => router.push('/accountability')}
              className="flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Accountability Chart
            </button>

            <button
              onClick={() => {
                saveData();
                router.push('/dashboard');
              }}
              className="px-8 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 font-medium"
            >
              Save & Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}