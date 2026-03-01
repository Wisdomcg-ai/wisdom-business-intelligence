'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Save, HeartHandshake, ArrowLeft, Sparkles, Trophy, TrendingUp, Building, DollarSign, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import PageHeader from '@/components/ui/PageHeader';

interface TeamCultureData {
  core_values: string;
  team_rituals: string;
  recognition_rewards: string;
  growth_opportunities: string;
  work_environment: string;
  compensation_strategy: string;
  // Legacy field — ignored but preserved if present
  hiring_priorities?: unknown;
}

export default function TeamCulturePage() {
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

  const [formData, setFormData] = useState<TeamCultureData>({
    core_values: '',
    team_rituals: '',
    recognition_rewards: '',
    growth_opportunities: '',
    work_environment: '',
    compensation_strategy: '',
  });

  const formDataRef = useRef<TeamCultureData>(formData);

  const updateFormData = (updater: (prev: TeamCultureData) => TeamCultureData) => {
    setFormData(prev => {
      const newData = updater(prev);
      formDataRef.current = newData;
      return newData;
    });
  };

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

      const targetUserId = activeBusiness?.ownerId || user.id;

      const { data: existingData } = await supabase
        .from('team_data')
        .select('hiring_roadmap')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (existingData?.hiring_roadmap) {
        const loaded = existingData.hiring_roadmap as TeamCultureData;
        const merged: TeamCultureData = {
          core_values: loaded.core_values || '',
          team_rituals: loaded.team_rituals || '',
          recognition_rewards: loaded.recognition_rewards || '',
          growth_opportunities: loaded.growth_opportunities || '',
          work_environment: loaded.work_environment || '',
          compensation_strategy: loaded.compensation_strategy || '',
        };
        setFormData(merged);
        formDataRef.current = merged;
        lastSavedDataRef.current = JSON.stringify(merged);
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
    const dataToSave = formDataRef.current;
    const currentDataString = JSON.stringify(dataToSave);
    if (currentDataString === lastSavedDataRef.current) {
      setHasUnsavedChanges(false);
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const targetUserId = activeBusiness?.ownerId || user.id;

      const { error } = await supabase
        .from('team_data')
        .upsert({
          user_id: targetUserId,
          hiring_roadmap: dataToSave,
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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const sections = [
    {
      key: 'core_values' as const,
      icon: Sparkles,
      title: 'Core Values',
      description: 'What values define your team? These guide hiring, decisions, and daily behaviour.',
      placeholder: 'e.g., Ownership — we treat the business like our own. Transparency — we share the good and the bad openly. Growth mindset — we learn from mistakes and improve constantly.',
      rows: 4,
    },
    {
      key: 'team_rituals' as const,
      icon: Users,
      title: 'Team Rituals & Rhythms',
      description: 'Regular practices that build connection and keep everyone aligned.',
      placeholder: 'e.g., Monday morning standup (15 min), monthly team lunch, quarterly offsite, Friday wins Slack channel, annual planning day.',
      rows: 3,
    },
    {
      key: 'recognition_rewards' as const,
      icon: Trophy,
      title: 'Recognition & Rewards',
      description: 'How will you recognise and reward great performance?',
      placeholder: 'e.g., Monthly shoutouts in all-hands, spot bonuses for above-and-beyond work, annual awards ceremony, peer-nominated recognition.',
      rows: 3,
    },
    {
      key: 'growth_opportunities' as const,
      icon: TrendingUp,
      title: 'Growth & Development',
      description: 'What development and advancement opportunities will you offer?',
      placeholder: 'e.g., $2,000/year learning budget per person, quarterly career conversations, internal promotion pathways, mentorship pairing, conference attendance.',
      rows: 3,
    },
    {
      key: 'work_environment' as const,
      icon: Building,
      title: 'Work Environment',
      description: 'What kind of workplace will you create?',
      placeholder: 'e.g., Hybrid model (3 days office, 2 days remote), flexible start times, dog-friendly office, quarterly team social events, wellness allowance.',
      rows: 3,
    },
    {
      key: 'compensation_strategy' as const,
      icon: DollarSign,
      title: 'Compensation Strategy',
      description: 'How will you structure pay and benefits to attract and retain talent?',
      placeholder: 'e.g., Pay at 75th percentile for market, annual salary reviews, performance bonuses (10-20% of base), superannuation above minimum, health insurance.',
      rows: 3,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="Team Culture & Retention"
        subtitle="Define your culture and build a workplace people don't want to leave"
        icon={HeartHandshake}
        actions={
          <div className="flex flex-col items-end gap-1">
            {saving && (
              <span className="text-sm text-white/70 flex items-center gap-2">
                <Save className="h-4 w-4 animate-pulse" />
                Saving...
              </span>
            )}
            {!saving && lastSaved && (
              <span className="text-sm text-brand-orange">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
            {hasUnsavedChanges && !saving && (
              <span className="text-sm text-amber-400">Unsaved changes</span>
            )}
            {errorMessage && (
              <span className="text-sm text-red-400">Error: {errorMessage}</span>
            )}
          </div>
        }
      />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.key} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 bg-brand-navy/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-brand-navy" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{section.description}</p>
                  </div>
                </div>
                <textarea
                  value={formData[section.key]}
                  onChange={(e) => {
                    updateFormData(prev => ({ ...prev, [section.key]: e.target.value }));
                    handleFieldChange();
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm leading-relaxed"
                  rows={section.rows}
                  placeholder={section.placeholder}
                />
              </div>
            );
          })}

          {/* Navigation */}
          <div className="flex justify-between items-center pb-8">
            <button
              onClick={() => router.push('/team/accountability')}
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
