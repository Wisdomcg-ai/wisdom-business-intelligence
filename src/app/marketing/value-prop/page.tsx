'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Target, TrendingUp, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';

interface ValuePropData {
  target_demographics: string;
  target_problems: string;
  target_location: string;
  uvp_statement: string;
  uvp_framework_choice: 'option1' | 'option2' | '';
  competitive_advantage: string;
  key_differentiators: string;
  competitor_1_name: string;
  competitor_1_advantage: string;
  competitor_2_name: string;
  competitor_2_advantage: string;
  competitor_3_name: string;
  competitor_3_advantage: string;
  usp_list: string;
}

interface AISuggestions {
  [key: string]: string;
}

export default function ValuePropositionPage() {
  const router = useRouter();
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions>({});
  const [businessContextData, setBusinessContextData] = useState<any>({});

  const [formData, setFormData] = useState<ValuePropData>({
    target_demographics: '',
    target_problems: '',
    target_location: '',
    uvp_statement: '',
    uvp_framework_choice: '',
    competitive_advantage: '',
    key_differentiators: '',
    competitor_1_name: '',
    competitor_1_advantage: '',
    competitor_2_name: '',
    competitor_2_advantage: '',
    competitor_3_name: '',
    competitor_3_advantage: '',
    usp_list: ''
  });

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loading) {
        autoSave();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [formData]);

  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }
  }, [contextLoading, activeBusiness?.id]);

  const loadData = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      // Load existing data from marketing_data table
      const { data: existingData } = await supabase
        .from('marketing_data')
        .select('value_proposition')
        .eq('user_id', targetUserId)
        .single();

      if (existingData?.value_proposition) {
        setFormData(existingData.value_proposition as ValuePropData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  const autoSave = async () => {
    try {
      setSaving(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      // This ensures data saves to the correct user (client, not coach)
      const targetUserId = activeBusiness?.ownerId || user.id;

      // Upsert to marketing_data table
      const { error } = await supabase
        .from('marketing_data')
        .upsert({
          user_id: targetUserId,
          value_proposition: formData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (!error) {
        setLastSaved(new Date());
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const getAISuggestion = async (fieldType: string) => {
    setAiLoading(fieldType);
    setAiSuggestions(prev => ({ ...prev, [fieldType]: '' }));

    try {
      const response = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldType,
          currentValue: formData,
          businessContext: businessContextData
        })
      });

      const data = await response.json();
      if (data.suggestion) {
        setAiSuggestions(prev => ({ ...prev, [fieldType]: data.suggestion }));
      }
    } catch (error) {
      console.error('AI error:', error);
    } finally {
      setAiLoading(null);
    }
  };

  const applySuggestion = (fieldName: keyof ValuePropData, suggestion: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: suggestion }));
    setAiSuggestions(prev => {
      const newSuggestions = { ...prev };
      delete newSuggestions[fieldName];
      return newSuggestions;
    });
  };

  const handleChange = (field: keyof ValuePropData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your marketing strategy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-500 hover:text-gray-700 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            {saving && <span className="text-sm text-gray-500">Saving...</span>}
            {!saving && lastSaved && (
              <span className="text-sm text-green-600">
                ✓ Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
          
          <div className="flex items-start gap-4">
            <div className="p-3 bg-teal-100 rounded-lg">
              <Target className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Value Proposition & USP</h1>
              <p className="mt-2 text-gray-600">
                Define your unique value, target customers, and competitive differentiation.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Target Market */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-5 h-5 text-teal-600" />
              <h2 className="text-xl font-semibold text-gray-800">Target Market</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Who is your ideal customer? The more specific, the better your marketing.
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Demographics & Psychographics <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => getAISuggestion('target_demographics')}
                    disabled={aiLoading === 'target_demographics'}
                    className="text-sm px-3 py-1 bg-purple-50 text-purple-600 rounded-md hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    {aiLoading === 'target_demographics' ? 'Thinking...' : 'AI Assist'}
                  </button>
                </div>
                <textarea
                  value={formData.target_demographics}
                  onChange={(e) => handleChange('target_demographics', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                  placeholder="Example: SMB owners aged 35-55, $1-10M revenue, professional services, growth-focused, tech-savvy..."
                />
                {aiSuggestions.target_demographics && (
                  <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm text-gray-700 mb-2">{aiSuggestions.target_demographics}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => applySuggestion('target_demographics', aiSuggestions.target_demographics)}
                        className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                      >
                        Use This
                      </button>
                      <button
                        onClick={() => setAiSuggestions(prev => ({ ...prev, target_demographics: '' }))}
                        className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Problems They Experience <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => getAISuggestion('target_problems')}
                    disabled={aiLoading === 'target_problems' || !formData.target_demographics}
                    className="text-sm px-3 py-1 bg-purple-50 text-purple-600 rounded-md hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    {aiLoading === 'target_problems' ? 'Thinking...' : 'AI Assist'}
                  </button>
                </div>
                <textarea
                  value={formData.target_problems}
                  onChange={(e) => handleChange('target_problems', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                  placeholder="Example: Struggling with cash flow, can't scale operations, working 60+ hour weeks, unclear strategy..."
                />
                {aiSuggestions.target_problems && (
                  <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm text-gray-700 mb-2">{aiSuggestions.target_problems}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => applySuggestion('target_problems', aiSuggestions.target_problems)}
                        className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                      >
                        Use This
                      </button>
                      <button
                        onClick={() => setAiSuggestions(prev => ({ ...prev, target_problems: '' }))}
                        className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Where to Find Them
                </label>
                <textarea
                  value={formData.target_location}
                  onChange={(e) => handleChange('target_location', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={2}
                  placeholder="Example: LinkedIn groups, industry conferences, local business networks, Facebook communities..."
                />
              </div>
            </div>
          </div>

          {/* Value Proposition */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-teal-600" />
              <h2 className="text-xl font-semibold text-gray-800">Unique Value Proposition</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Your UVP explains why customers should choose you over competitors.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Choose a UVP Framework:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => handleChange('uvp_framework_choice', 'option1')}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      formData.uvp_framework_choice === 'option1'
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900 mb-1">Framework 1: Problem-Solution</div>
                    <div className="text-sm text-gray-600">
                      "We help [who] achieve [what] by [how] so they can [result]"
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('uvp_framework_choice', 'option2')}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      formData.uvp_framework_choice === 'option2'
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900 mb-1">Framework 2: Differentiation</div>
                    <div className="text-sm text-gray-600">
                      "Unlike [competitors], we [unique approach] which means [benefit]"
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Your UVP Statement <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => getAISuggestion('uvp_statement')}
                    disabled={aiLoading === 'uvp_statement' || !formData.target_demographics}
                    className="text-sm px-3 py-1 bg-purple-50 text-purple-600 rounded-md hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    {aiLoading === 'uvp_statement' ? 'Thinking...' : 'AI Assist'}
                  </button>
                </div>
                <textarea
                  value={formData.uvp_statement}
                  onChange={(e) => handleChange('uvp_statement', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                  placeholder={
                    formData.uvp_framework_choice === 'option2'
                      ? "Example: Unlike traditional consultants, we provide hands-on implementation support which means you see results in weeks, not months."
                      : "Example: We help growing businesses achieve predictable revenue by implementing proven systems so they can scale without burning out."
                  }
                />
                {aiSuggestions.uvp_statement && (
                  <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm text-gray-700 mb-2">{aiSuggestions.uvp_statement}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => applySuggestion('uvp_statement', aiSuggestions.uvp_statement)}
                        className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                      >
                        Use This
                      </button>
                      <button
                        onClick={() => setAiSuggestions(prev => ({ ...prev, uvp_statement: '' }))}
                        className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Competitive Differentiation */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Competitive Differentiation</h2>
            <p className="text-sm text-gray-600 mb-4">
              What makes you different and better than alternatives?
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Competitive Advantages
                </label>
                <textarea
                  value={formData.competitive_advantage}
                  onChange={(e) => handleChange('competitive_advantage', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                  placeholder="Example: 20 years experience, proprietary process, fastest implementation, proven track record..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Key Competitors & Your Difference <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {/* Competitor 1 */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <input
                      type="text"
                      value={formData.competitor_1_name}
                      onChange={(e) => handleChange('competitor_1_name', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded mb-2 focus:ring-2 focus:ring-teal-500"
                      placeholder="Competitor 1 name *"
                    />
                    <input
                      type="text"
                      value={formData.competitor_1_advantage}
                      onChange={(e) => handleChange('competitor_1_advantage', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
                      placeholder="How are you different? (e.g., 'We're faster', 'More personal service') *"
                    />
                  </div>

                  {/* Competitor 2 */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <input
                      type="text"
                      value={formData.competitor_2_name}
                      onChange={(e) => handleChange('competitor_2_name', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded mb-2 focus:ring-2 focus:ring-teal-500"
                      placeholder="Competitor 2 name *"
                    />
                    <input
                      type="text"
                      value={formData.competitor_2_advantage}
                      onChange={(e) => handleChange('competitor_2_advantage', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
                      placeholder="How are you different? *"
                    />
                  </div>

                  {/* Competitor 3 (Optional) */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <input
                      type="text"
                      value={formData.competitor_3_name}
                      onChange={(e) => handleChange('competitor_3_name', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded mb-2 focus:ring-2 focus:ring-teal-500"
                      placeholder="Competitor 3 name (optional)"
                    />
                    <input
                      type="text"
                      value={formData.competitor_3_advantage}
                      onChange={(e) => handleChange('competitor_3_advantage', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
                      placeholder="How are you different? (optional)"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Key Differentiators
                </label>
                <textarea
                  value={formData.key_differentiators}
                  onChange={(e) => handleChange('key_differentiators', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={2}
                  placeholder="Example: Only provider with money-back guarantee, fastest turnaround time, most experienced team..."
                />
              </div>
            </div>
          </div>

          {/* USPs */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Unique Selling Propositions (USPs)</h2>
            <p className="text-sm text-gray-600 mb-4">
              List 3-5 specific, compelling reasons customers should choose you.
            </p>
            <textarea
              value={formData.usp_list}
              onChange={(e) => handleChange('usp_list', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={5}
              placeholder="Example:
- 20+ years proven track record in your industry
- Guaranteed results or money back
- Implementation in 30 days (competitors take 90+)
- Dedicated success manager for every client
- Only provider with [unique feature/certification]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pb-8">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
            
            <button
              onClick={() => {
                autoSave();
                alert('Value proposition saved successfully!');
              }}
              className="px-8 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium"
            >
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}