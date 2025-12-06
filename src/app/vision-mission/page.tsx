'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Lightbulb, Compass, TrendingUp, Star, CheckCircle, AlertCircle, Info, Sparkles, X, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast, { Toaster } from 'react-hot-toast';
import {
  CORE_VALUES_LIBRARY,
  CATEGORIES,
  VALIDATION,
  getWordCount
} from '@/lib/vision-mission/constants';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import PageHeader from '@/components/ui/PageHeader';

interface VisionMissionData {
  mission_statement: string;
  vision_statement: string;
  core_values: string[];
}

export default function VisionMissionPage() {
  const router = useRouter();
  const supabase = createClient();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<string>('');
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showHelp, setShowHelp] = useState<{ [key: string]: boolean }>({
    mission: false,
    vision: false,
    values: false
  });
  const [showValuesLibrary, setShowValuesLibrary] = useState(false);
  const [showCustomValueHelper, setShowCustomValueHelper] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customValueName, setCustomValueName] = useState('');
  const [customValueStatement, setCustomValueStatement] = useState('');

  const [formData, setFormData] = useState<VisionMissionData>({
    mission_statement: '',
    vision_statement: '',
    core_values: ['', '', '', '', '', '', '', '']
  });

  const toggleHelp = (section: string) => {
    setShowHelp(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const addValueFromLibrary = (valueName: string, weStatement?: string) => {
    const emptyIndex = formData.core_values.findIndex(v => v.trim() === '');
    if (emptyIndex !== -1) {
      const newValues = [...formData.core_values];
      // Format as "Value Name - We statement"
      newValues[emptyIndex] = weStatement ? `${valueName} - ${weStatement}` : valueName;
      setFormData(prev => ({ ...prev, core_values: newValues }));
      handleFieldChange();
      toast.success('Value added successfully');
    } else {
      toast.error('All value slots are filled. Remove a value first.');
    }
  };

  const addCustomValue = () => {
    if (!customValueName.trim()) {
      toast.error('Please enter a value name');
      return;
    }

    addValueFromLibrary(customValueName, customValueStatement || undefined);
    setCustomValueName('');
    setCustomValueStatement('');
    setShowCustomValueHelper(false);
  };

  const clearValue = (index: number) => {
    const newValues = [...formData.core_values];
    newValues[index] = '';
    setFormData(prev => ({ ...prev, core_values: newValues }));
    handleFieldChange();
  };

  const categories = CATEGORIES;
  const filteredValues = selectedCategory === 'all'
    ? CORE_VALUES_LIBRARY
    : CORE_VALUES_LIBRARY.filter(v => v.category === selectedCategory);

  // Cleanup timeout on unmount and load data when context is ready
  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [contextLoading, activeBusiness?.id]);

  // Handle escape key for modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showValuesLibrary) {
        setShowValuesLibrary(false);
      }
      if (e.key === 'Escape' && showCustomValueHelper) {
        setShowCustomValueHelper(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showValuesLibrary, showCustomValueHelper]);

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

      const { data: existingData } = await supabase
        .from('strategy_data')
        .select('vision_mission')
        .eq('user_id', targetUserId)
        .single();

      if (existingData?.vision_mission) {
        const vmData = existingData.vision_mission as VisionMissionData;
        const values = [...(vmData.core_values || [])];
        while (values.length < VALIDATION.MAX_VALUES) values.push('');

        setFormData({
          ...vmData,
          core_values: values.slice(0, VALIDATION.MAX_VALUES)
        });
        lastSavedDataRef.current = JSON.stringify(vmData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading:', error);
      toast.error('Failed to load data');
      setLoading(false);
    }
  };

  const handleFieldChange = () => {
    setHasUnsavedChanges(true);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveData();
    }, 2000);
  };

  const saveData = async () => {
    const dataToSave = {
      ...formData,
      core_values: formData.core_values.filter(v => v.trim() !== '')
    };

    const currentDataString = JSON.stringify(dataToSave);
    if (currentDataString === lastSavedDataRef.current) {
      setHasUnsavedChanges(false);
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to save');
        return;
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      // This ensures data saves to the correct user (client, not coach)
      const targetUserId = activeBusiness?.ownerId || user.id;

      const { error } = await supabase
        .from('strategy_data')
        .upsert({
          user_id: targetUserId,
          vision_mission: dataToSave,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      lastSavedDataRef.current = currentDataString;
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
      console.log('✅ Vision, Mission & Values saved successfully');
    } catch (error: any) {
      console.error('Error saving:', error);
      toast.error(error?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCoreValueChange = (index: number, value: string) => {
    const newValues = [...formData.core_values];
    newValues[index] = value;
    setFormData(prev => ({ ...prev, core_values: newValues }));
    handleFieldChange();
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vision and mission...</p>
        </div>
      </div>
    );
  }

  const visionWordCount = getWordCount(formData.vision_statement);
  const missionWordCount = getWordCount(formData.mission_statement);
  const filledValuesCount = formData.core_values.filter(v => v.trim().length > 0).length;

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <Toaster position="top-right" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <PageHeader
          title="Vision, Mission & Values"
          subtitle="Define where you're going and what principles guide your business"
          icon={Lightbulb}
          actions={
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
            </div>
          }
        />

        <div className="space-y-6">
          {/* Vision Statement */}
          <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-teal-50 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-brand-teal" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-semibold text-gray-800">Vision (Your 5-10 Year Picture)</h2>
                  <p className="text-sm sm:text-base text-gray-600">Paint a picture of where you're headed</p>
                </div>
              </div>
              <button
                onClick={() => toggleHelp('vision')}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                aria-label="Toggle help"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>

            {showHelp.vision && (
              <div className="mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-2">💡 Jim Collins' Big Hairy Audacious Goal (BHAG):</p>
                <p className="text-sm sm:text-base text-gray-700 mb-3">
                  Your vision doesn't have to be BIG to everyone—<span className="font-semibold">big for YOU means what stretches YOU</span>. Paint a vivid picture of what success looks like in 5-10 years.
                </p>
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-1">Examples (all equally valid):</p>
                <ul className="text-sm sm:text-base text-gray-700 list-disc list-inside space-y-1 ml-2">
                  <li>"A team of 8 skilled people doing work we're proud of, serving 50 loyal clients"</li>
                  <li>"Known as the go-to experts in our county, with a 6-month waitlist"</li>
                  <li>"$2M revenue, 20 employees, and recognized as a great place to work"</li>
                  <li>"$500M revenue, 1,000+ employees, and operating in 15 countries"</li>
                </ul>
              </div>
            )}

            <textarea
              value={formData.vision_statement}
              onChange={(e) => {
                if (e.target.value.length <= VALIDATION.VISION_MAX_CHARS) {
                  setFormData(prev => ({ ...prev, vision_statement: e.target.value }));
                  handleFieldChange();
                }
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
              rows={4}
              placeholder="In 5-10 years, we will be..."
              maxLength={VALIDATION.VISION_MAX_CHARS}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-gray-500">
                {visionWordCount} words
                {visionWordCount < VALIDATION.VISION_TARGET_WORDS.min &&
                  ` (aim for ${VALIDATION.VISION_TARGET_WORDS.min}-${VALIDATION.VISION_TARGET_WORDS.max})`}
              </span>
              {visionWordCount >= VALIDATION.VISION_MIN_WORDS && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Complete
                </span>
              )}
            </div>
          </div>

          {/* Mission Statement */}
          <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-navy-50 rounded-lg flex-shrink-0">
                  <Compass className="w-5 h-5 text-brand-navy" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-semibold text-gray-800">Mission (Your Why)</h2>
                  <p className="text-sm sm:text-base text-gray-600">Why does your business exist? What impact do you want to make?</p>
                </div>
              </div>
              <button
                onClick={() => toggleHelp('mission')}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                aria-label="Toggle help"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>

            {showHelp.mission && (
              <div className="mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-2">✏️ Simon Sinek's "Start With Why":</p>
                <p className="text-sm sm:text-base text-gray-700 mb-3">
                  People don't buy WHAT you do, they buy WHY you do it. Your mission should capture your purpose, cause, or belief—the reason you exist beyond making money.
                </p>
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-1">Framework:</p>
                <p className="text-sm sm:text-base text-gray-700 italic mb-2">
                  "We believe [your belief/cause]. We do this by [what you do] for [who], so they can [transformation/benefit]."
                </p>
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-1">Example:</p>
                <p className="text-sm sm:text-base text-gray-700 italic">
                  "We believe every homeowner deserves work done right the first time. We deliver quality craftsmanship to families in our community, so they can love their homes and trust who they let in."
                </p>
              </div>
            )}

            <textarea
              value={formData.mission_statement}
              onChange={(e) => {
                if (e.target.value.length <= VALIDATION.MISSION_MAX_CHARS) {
                  setFormData(prev => ({ ...prev, mission_statement: e.target.value }));
                  handleFieldChange();
                }
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
              rows={4}
              placeholder="We believe [your belief]... We do this by [what you do] for [who], so they can [benefit]..."
              maxLength={VALIDATION.MISSION_MAX_CHARS}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-gray-500">
                {missionWordCount} words
                {missionWordCount < VALIDATION.MISSION_TARGET_WORDS.min &&
                  ` (aim for ${VALIDATION.MISSION_TARGET_WORDS.min}-${VALIDATION.MISSION_TARGET_WORDS.max})`}
              </span>
              {missionWordCount >= VALIDATION.MISSION_MIN_WORDS && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Complete
                </span>
              )}
            </div>
          </div>

          {/* Core Values */}
          <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-orange-50 rounded-lg flex-shrink-0">
                  <Star className="w-5 h-5 text-brand-orange" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-semibold text-gray-800">Core Values</h2>
                  <p className="text-sm sm:text-base text-gray-600">The principles that guide your team</p>
                </div>
              </div>
              <button
                onClick={() => toggleHelp('values')}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                aria-label="Toggle help"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>

            {showHelp.values && (
              <div className="mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm sm:text-base text-gray-700 mb-3">
                  Choose 3-5 values with "we statements" that show how you live them daily.
                </p>
                <p className="text-sm sm:text-base font-medium text-gray-800 mb-1">Example:</p>
                <p className="text-sm sm:text-base text-gray-700 italic">
                  "Integrity - We do the right thing even when no one's watching"
                </p>
              </div>
            )}

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4">
              <button
                onClick={() => setShowValuesLibrary(true)}
                className="px-4 py-3 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Browse Values Library (35 values)
              </button>
              <button
                onClick={() => setShowCustomValueHelper(true)}
                className="px-4 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Your Own Value
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {formData.core_values.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 w-6 flex-shrink-0">{index + 1}.</span>
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => handleCoreValueChange(index, e.target.value)}
                      placeholder={index < VALIDATION.MIN_VALUES ? 'Required' : 'Optional'}
                      className={`w-full px-3 py-2 pr-8 border rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent ${
                        index < VALIDATION.MIN_VALUES ? 'border-brand-orange-300 bg-brand-orange-50' : 'border-gray-300'
                      }`}
                    />
                    {value.trim().length > 0 && (
                      <button
                        onClick={() => clearValue(index)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Clear value"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              {filledValuesCount >= VALIDATION.MIN_VALUES && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {filledValuesCount} values defined
                </span>
              )}
              {filledValuesCount < VALIDATION.MIN_VALUES && (
                <span className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Add at least {VALIDATION.MIN_VALUES} core values (recommended: 3-5)
                </span>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-start items-center pb-4 sm:pb-8">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm sm:text-base"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Custom Value Helper Modal */}
      {showCustomValueHelper && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCustomValueHelper(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Add Your Own Value</h3>
              <button
                onClick={() => setShowCustomValueHelper(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-brand-orange-50 rounded-lg border border-brand-orange-200">
              <p className="text-sm sm:text-base font-medium text-gray-800 mb-2">📝 How to write a great "We Statement":</p>
              <ol className="text-sm sm:text-base text-gray-700 list-decimal list-inside space-y-1">
                <li>Start with "We" to show it's about the whole team</li>
                <li>Use action words that describe behaviors</li>
                <li>Make it specific and observable (not vague)</li>
              </ol>
              <p className="text-sm sm:text-base text-gray-700 mt-3 font-medium">Example:</p>
              <p className="text-sm sm:text-base text-gray-600 italic">"Integrity - We do the right thing even when no one's watching"</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Value Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customValueName}
                  onChange={(e) => setCustomValueName(e.target.value)}
                  placeholder="e.g., Integrity, Innovation, Teamwork"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  "We" Statement <span className="text-gray-500">(recommended)</span>
                </label>
                <textarea
                  value={customValueStatement}
                  onChange={(e) => setCustomValueStatement(e.target.value)}
                  placeholder="We..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                  rows={3}
                  maxLength={200}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Describe HOW you live this value day-to-day
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-6">
              <button
                onClick={() => setShowCustomValueHelper(false)}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addCustomValue}
                className="flex-1 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors"
              >
                Add Value
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Values Library Modal */}
      {showValuesLibrary && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowValuesLibrary(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0">
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Core Values Library</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">35 values with "we statements" - click to add</p>
                </div>
                <button
                  onClick={() => setShowValuesLibrary(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                  aria-label="Close library"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-2 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-brand-orange text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat === 'all' ? 'All Values' : cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {filteredValues.map((value, idx) => {
                  const isAdded = formData.core_values.some(v => v.includes(value.name));
                  return (
                    <button
                      key={idx}
                      onClick={() => addValueFromLibrary(value.name, value.weStatement)}
                      disabled={isAdded}
                      className={`text-left p-3 sm:p-4 border-2 rounded-lg transition-all group ${
                        isAdded
                          ? 'border-brand-teal-300 bg-brand-teal-50 cursor-not-allowed'
                          : 'border-gray-200 hover:border-brand-orange-400 hover:bg-brand-orange-50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className={`font-semibold text-sm sm:text-base ${
                          isAdded ? 'text-brand-teal-700' : 'text-gray-900 group-hover:text-brand-orange'
                        }`}>
                          {value.name}
                        </h4>
                        {isAdded && (
                          <CheckCircle className="w-4 h-4 text-brand-teal flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-gray-700 italic">
                        "{value.weStatement}"
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
