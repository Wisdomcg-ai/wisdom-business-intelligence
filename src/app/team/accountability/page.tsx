'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';

interface Role {
  function: string;
  person: string;
  responsibilities: string;
  success_metric: string;
}

interface AccountabilityData {
  roles: Role[];
  culture_description: string;
}

export default function AccountabilityChartPage() {
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

  const [formData, setFormData] = useState<AccountabilityData>({
    roles: [
      { function: 'Sales & Business Development', person: '', responsibilities: '', success_metric: '' },
      { function: 'Marketing & Lead Generation', person: '', responsibilities: '', success_metric: '' },
      { function: 'Operations & Delivery', person: '', responsibilities: '', success_metric: '' },
      { function: 'Finance & Administration', person: '', responsibilities: '', success_metric: '' },
      { function: 'Customer Success', person: '', responsibilities: '', success_metric: '' },
      { function: 'Leadership & Strategy', person: '', responsibilities: '', success_metric: '' }
    ],
    culture_description: ''
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
        .select('accountability_chart')
        .eq('user_id', targetUserId)
        .single();

      if (existingData?.accountability_chart) {
        setFormData(existingData.accountability_chart as AccountabilityData);
        lastSavedDataRef.current = JSON.stringify(existingData.accountability_chart);
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
          accountability_chart: formData,
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

  const updateRole = (index: number, field: keyof Role, value: string) => {
    const newRoles = [...formData.roles];
    newRoles[index] = { ...newRoles[index], [field]: value };
    setFormData(prev => ({ ...prev, roles: newRoles }));
    handleFieldChange();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading accountability chart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-teal-100 rounded-lg">
                <Users className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Accountability Chart</h1>
                <p className="mt-2 text-gray-600">
                  Define roles, responsibilities, and team culture
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
          {/* Functional Accountability Chart */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              Functional Accountability Chart
            </h2>
            <p className="text-gray-600 mb-4">
              Map key roles, who's responsible, and how success is measured.
            </p>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-700">Function/Role</th>
                    <th className="text-left p-3 font-medium text-gray-700">Person Responsible</th>
                    <th className="text-left p-3 font-medium text-gray-700">Key Responsibilities</th>
                    <th className="text-left p-3 font-medium text-gray-700">Success Metric</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.roles.map((role, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-medium text-sm text-gray-700">{role.function}</td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={role.person}
                          onChange={(e) => updateRole(index, 'person', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          placeholder="Name or 'You'"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={role.responsibilities}
                          onChange={(e) => updateRole(index, 'responsibilities', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          placeholder="Main duties"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={role.success_metric}
                          onChange={(e) => updateRole(index, 'success_metric', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          placeholder="KPI or measure"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Team Culture */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Team Culture</h2>
            <p className="text-gray-600 mb-4">
              How do you want people to feel working with and for you?
            </p>
            <textarea
              value={formData.culture_description}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, culture_description: e.target.value }));
                handleFieldChange();
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={5}
              placeholder="Describe your ideal workplace culture, team dynamics, values in action, and working environment..."
            />
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center pb-8">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>

            <button
              onClick={() => {
                saveData();
                router.push('/team/hiring-roadmap');
              }}
              className="px-8 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium"
            >
              Continue to Hiring Roadmap →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}