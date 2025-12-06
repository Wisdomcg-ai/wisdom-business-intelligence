'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Lightbulb, Target, Compass, TrendingUp, Star, CheckCircle, AlertCircle, HelpCircle, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface VisionMissionData {
  purpose_statement: string;
  mission_statement: string;
  vision_statement: string;
  core_values: string[];
}

interface CoreValue {
  name: string;
  category: string;
  definition: string;
  example: string;
}

const CORE_VALUES_LIBRARY: CoreValue[] = [
  // Customer-Focused
  { name: 'Customer Obsession', category: 'Customer-Focused', definition: 'We prioritize customer success above all else', example: 'Respond within 2 hours, never say "not our problem"' },
  { name: 'Exceptional Service', category: 'Customer-Focused', definition: 'We exceed expectations in every interaction', example: 'Go the extra mile, anticipate needs before they ask' },
  { name: 'Customer-First Thinking', category: 'Customer-Focused', definition: 'Every decision starts with the customer impact', example: 'Ask "How does this help our customers?" in meetings' },

  // Quality & Excellence
  { name: 'Excellence', category: 'Quality & Excellence', definition: 'We deliver exceptional quality in everything we do', example: 'No shortcuts, double-check work, pride in craft' },
  { name: 'Continuous Improvement', category: 'Quality & Excellence', definition: 'We constantly seek better ways of doing things', example: 'Weekly process reviews, welcome feedback' },
  { name: 'Attention to Detail', category: 'Quality & Excellence', definition: 'We sweat the small stuff because it matters', example: 'Triple-check deliverables, typos are unacceptable' },

  // Innovation & Growth
  { name: 'Innovation', category: 'Innovation & Growth', definition: 'We embrace new ideas and creative solutions', example: 'Monthly innovation time, reward experimentation' },
  { name: 'Move Fast, Learn Faster', category: 'Innovation & Growth', definition: 'We value speed and learning over perfection', example: 'Ship MVPs quickly, iterate based on feedback' },
  { name: 'Think Big', category: 'Innovation & Growth', definition: 'We set ambitious goals and pursue bold visions', example: '10x thinking, not 10% improvements' },

  // Integrity & Trust
  { name: 'Integrity', category: 'Integrity & Trust', definition: 'We do the right thing, even when no one is watching', example: 'Admit mistakes, keep promises, no cutting corners' },
  { name: 'Radical Transparency', category: 'Integrity & Trust', definition: 'We share information openly and honestly', example: 'Open financials, honest feedback, no hidden agendas' },
  { name: 'Trust & Respect', category: 'Integrity & Trust', definition: 'We build relationships based on mutual trust', example: 'Assume positive intent, give autonomy' },

  // Team & Culture
  { name: 'Teamwork', category: 'Team & Culture', definition: 'We succeed together and support each other', example: 'Help teammates before personal work, celebrate wins together' },
  { name: 'Ownership', category: 'Team & Culture', definition: 'We act like owners and take responsibility', example: 'No "that\'s not my job", solve problems proactively' },
  { name: 'Diversity & Inclusion', category: 'Team & Culture', definition: 'We value different perspectives and backgrounds', example: 'Actively seek diverse viewpoints, everyone has voice' },

  // Performance & Results
  { name: 'Results-Driven', category: 'Performance & Results', definition: 'We focus on outcomes, not just activities', example: 'Measure what matters, cut busy work' },
  { name: 'Accountability', category: 'Performance & Results', definition: 'We take ownership of our commitments', example: 'Do what we say, no excuses, track deliverables' },
  { name: 'Bias for Action', category: 'Performance & Results', definition: 'We make decisions and move forward quickly', example: 'Done is better than perfect, don\'t wait for permission' }
];

const EXAMPLE_PURPOSES = [
  'We exist to help small business owners achieve financial freedom by providing world-class coaching and practical systems they can implement immediately.',
  'We exist to transform how businesses operate by delivering innovative software solutions that save time, reduce costs, and empower teams.',
  'We exist to make healthy living accessible and enjoyable for busy professionals through convenient, science-backed wellness programs.'
];

const EXAMPLE_MISSIONS = [
  'We deliver personalized business coaching and strategic planning tools to ambitious entrepreneurs, empowering them to build profitable, sustainable companies that support their ideal lifestyle.',
  'We provide cloud-based project management software to remote teams worldwide, helping them collaborate seamlessly, ship projects faster, and work from anywhere.',
  'We offer corporate wellness programs combining nutrition guidance, fitness coaching, and mental health support to companies who want healthier, more productive teams.'
];

const EXAMPLE_VISIONS = [
  'In 3 years, we will be the #1 business coaching platform in North America, serving 5,000+ clients with a team of 50 expert coaches, generating $10M in annual recurring revenue.',
  'In 3 years, our software will power 100,000+ projects globally, we\'ll have offices in 5 countries, employ 200 team members, and be recognized as a category leader.',
  'In 3 years, we will have helped 50,000 professionals achieve their health goals, partner with 500+ companies, and be known as the most trusted name in corporate wellness.'
];

export default function VisionMissionPage() {
  const router = useRouter();
  const supabase = createClient();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<string>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState<{ [key: string]: boolean }>({
    purpose: true,
    mission: true,
    vision: true,
    values: true
  });
  const [showValuesLibrary, setShowValuesLibrary] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [formData, setFormData] = useState<VisionMissionData>({
    purpose_statement: '',
    mission_statement: '',
    vision_statement: '',
    core_values: ['', '', '', '', '', '', '', '']
  });

  const toggleHelp = (section: string) => {
    setShowHelp(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getWordCount = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const getCompletionPercentage = (): number => {
    let completed = 0;
    let total = 4;

    if (formData.purpose_statement && formData.purpose_statement.trim().length > 20) completed++;
    if (formData.mission_statement && formData.mission_statement.trim().length > 20) completed++;
    if (formData.vision_statement && formData.vision_statement.trim().length > 20) completed++;

    const filledValues = formData.core_values.filter(v => v.trim().length > 0).length;
    if (filledValues >= 3) completed++;

    return Math.round((completed / total) * 100);
  };

  const addValueFromLibrary = (valueName: string) => {
    const emptyIndex = formData.core_values.findIndex(v => v.trim() === '');
    if (emptyIndex !== -1) {
      const newValues = [...formData.core_values];
      newValues[emptyIndex] = valueName;
      setFormData(prev => ({ ...prev, core_values: newValues }));
      handleFieldChange();
    }
  };

  const useExample = (field: 'purpose_statement' | 'mission_statement' | 'vision_statement', exampleIndex: number) => {
    const examples = field === 'purpose_statement' ? EXAMPLE_PURPOSES :
                    field === 'mission_statement' ? EXAMPLE_MISSIONS : EXAMPLE_VISIONS;
    setFormData(prev => ({ ...prev, [field]: examples[exampleIndex] }));
    handleFieldChange();
  };

  const categories = ['all', ...Array.from(new Set(CORE_VALUES_LIBRARY.map(v => v.category)))];
  const filteredValues = selectedCategory === 'all'
    ? CORE_VALUES_LIBRARY
    : CORE_VALUES_LIBRARY.filter(v => v.category === selectedCategory);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Load from strategy_data table
      const { data: existingData } = await supabase
        .from('strategy_data')
        .select('vision_mission')
        .eq('user_id', user.id)
        .single();

      if (existingData?.vision_mission) {
        const vmData = existingData.vision_mission as VisionMissionData;
        
        // Ensure core_values has 8 slots
        const values = [...(vmData.core_values || [])];
        while (values.length < 8) values.push('');
        
        setFormData({
          ...vmData,
          core_values: values.slice(0, 8)
        });
        lastSavedDataRef.current = JSON.stringify(vmData);
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
    setErrorMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('strategy_data')
        .upsert({
          user_id: user.id,
          vision_mission: dataToSave,
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-teal mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vision and mission...</p>
        </div>
      </div>
    );
  }

  const completionPercent = getCompletionPercentage();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gradient-to-br from-yellow-100 to-brand-orange-100 rounded-lg">
                <Lightbulb className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Vision, Mission & Values</h1>
                <p className="mt-2 text-gray-600">
                  Define your business's North Star - why you exist and where you're going
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

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600 font-medium">Completion Progress</span>
              <span className="text-gray-900 font-semibold">{completionPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  completionPercent === 100 ? 'bg-green-500' :
                  completionPercent >= 75 ? 'bg-brand-teal-500' :
                  completionPercent >= 50 ? 'bg-yellow-500' :
                  'bg-gray-400'
                }`}
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            {completionPercent < 100 && (
              <p className="text-xs text-gray-500 mt-1">
                Complete all sections to finalize your strategic foundation
              </p>
            )}
            {completionPercent === 100 && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                All sections complete! Your vision, mission & values are defined.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Purpose Statement */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Purpose Statement</h2>
            <p className="text-sm text-gray-600 mb-3">
              Complete this sentence: <span className="font-medium">Our business exists to...</span>
            </p>
            <textarea
              value={formData.purpose_statement}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, purpose_statement: e.target.value }));
                handleFieldChange();
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent"
              rows={3}
              placeholder="e.g., help small businesses achieve sustainable growth through innovative solutions and strategic guidance..."
            />
          </div>

          {/* Mission Statement */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Mission Statement</h2>
            <p className="text-sm text-gray-600 mb-3">
              What do you do, who do you serve, and how do you create value?
            </p>
            <textarea
              value={formData.mission_statement}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, mission_statement: e.target.value }));
                handleFieldChange();
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent"
              rows={3}
              placeholder="e.g., We deliver world-class coaching and strategic planning tools to ambitious business owners, empowering them to build profitable, sustainable companies..."
            />
          </div>

          {/* Vision Statement */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">3-Year Vision Statement</h2>
            <p className="text-sm text-gray-600 mb-3">
              In 3 years, our business will be...
            </p>
            <textarea
              value={formData.vision_statement}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, vision_statement: e.target.value }));
                handleFieldChange();
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent"
              rows={3}
              placeholder="e.g., the leading provider of business coaching in our region, serving 500+ clients with a team of 20, generating $5M in annual revenue..."
            />
          </div>

          {/* Core Values */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Core Values</h2>
            <p className="text-sm text-gray-600 mb-4">
              List the principles that guide every decision (up to 8 values, minimum 3 recommended)
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {formData.core_values.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 w-6">{index + 1}.</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleCoreValueChange(index, e.target.value)}
                    placeholder={index < 3 ? 'Recommended' : 'Optional'}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-brand-teal-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <span className="font-medium">💡 Tip:</span> Great core values are memorable, actionable, and guide decision-making. 
                Examples: "Customer obsession", "Radical transparency", "Move fast, learn faster"
              </p>
            </div>
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
                alert('Vision, Mission & Values saved successfully!');
              }}
              className="px-8 py-3 bg-brand-teal text-white rounded-lg hover:bg-brand-teal-700 font-medium"
            >
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}