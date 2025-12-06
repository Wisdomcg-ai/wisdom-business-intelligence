'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Target, Plus, User, AlertCircle, Lightbulb, X, ChevronDown, ChevronUp } from 'lucide-react';
import { TrendingUp, Package, Heart, Settings, Users, DollarSign, Brain } from 'lucide-react';
import { Building, CheckSquare, Square, Check, Zap, TrendingDown } from 'lucide-react';
import { useBusinessContext } from '@/hooks/useBusinessContext';

interface Initiative {
  id: string;
  title: string;
  category: string;
  selected_for_annual_plan: boolean;
  source_type?: string;
}

interface RoadmapCompletion {
  id: string;
  user_id: string;
  stage: string;
  category: string;
  item_text: string;
  completed: boolean;
  completed_at?: string;
}

interface AssessmentSuggestion {
  id: string;
  title: string;
  category: InitiativeCategory;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  section: string;
  score?: number;
}

interface Assessment {
  id: string;
  user_id: string;
  created_at: string;
  answers: Record<string, any>;
  section_scores: Record<string, number>;
  total_score: number;
  max_score: number;
  percentage: number;
  health_status: string;
  revenue_stage: string;
  top_strengths: string[];
  improvement_areas: string[];
  recommendations: string[];
}

interface AssessmentResults {
  sectionScores: Record<string, number>;
  totalScore: number;
  percentage: number;
  healthStatus: string;
  revenueStage: string;
  improvementAreas: string[];
  topStrengths: string[];
  recommendations: string[];
}

type InitiativeCategory = 'attract' | 'convert' | 'deliver' | 'delight' | 'systems' | 'people' | 'profit' | 'strategy';

const categoryInfo: Record<InitiativeCategory, { label: string }> = {
  attract: { label: 'Attract' },
  convert: { label: 'Convert' },
  deliver: { label: 'Deliver' },
  delight: { label: 'Delight' },
  systems: { label: 'Systems' },
  people: { label: 'People' },
  profit: { label: 'Profit' },
  strategy: { label: 'Strategy' }
};

const categoryIcons: Record<InitiativeCategory, React.ElementType> = {
  attract: Target,
  convert: TrendingUp,
  deliver: Package,
  delight: Heart,
  systems: Settings,
  people: Users,
  profit: DollarSign,
  strategy: Brain
};

// Revenue stages with roadmap items
const REVENUE_STAGES = [
  {
    id: 'foundation',
    name: 'Foundation',
    range: '$0-250K',
    min: 0,
    max: 250000,
    priorities: {
      attract: ['Define target market', 'Basic website', 'Choose 1-2 marketing channels'],
      convert: ['Create pricing strategy', 'Basic sales process', 'Quote templates'],
      deliver: ['Define service standards', 'Basic delivery process', 'Quality checklist'],
      delight: ['Customer feedback system', 'Response time goals', 'Testimonial collection'],
      systems: ['Document core processes', 'Basic workflows', 'File organization'],
      people: ['First hires', 'Core values', 'Basic training'],
      profit: ['Track cash flow', 'Basic bookkeeping', 'Expense tracking'],
      strategy: ['Business plan', 'Goal setting', 'Market research']
    }
  },
  {
    id: 'traction',
    name: 'Traction',
    range: '$250K-1M',
    min: 250000,
    max: 1000000,
    priorities: {
      attract: ['Marketing ROI tracking', '2-3 marketing strategies', 'Referral system'],
      convert: ['CRM implementation', 'Sales scripts', 'Pipeline management'],
      deliver: ['Service agreements', 'Customer onboarding', 'Process documentation'],
      delight: ['Satisfaction surveys', 'Customer success basics', 'Retention programs'],
      systems: ['Process standardization', 'Basic automation', 'KPI dashboards'],
      people: ['Team structure', 'Performance reviews', 'Training programs'],
      profit: ['Profit margin analysis', 'Monthly reports', 'Budget planning'],
      strategy: ['Strategic planning', 'Competitive analysis', 'Growth strategy']
    }
  },
  {
    id: 'scaling',
    name: 'Scaling',
    range: '$1M-3M',
    min: 1000000,
    max: 3000000,
    priorities: {
      attract: ['Marketing automation', 'Content strategy', 'SEO optimization'],
      convert: ['Sales team hiring', 'Advanced CRM', 'Territory planning'],
      deliver: ['Operations scaling', 'Technology integration', 'Quality management'],
      delight: ['Customer journey mapping', 'Loyalty programs', 'Proactive support'],
      systems: ['Process automation', 'Integration platforms', 'Real-time reporting'],
      people: ['Management layer', 'Leadership development', 'Career paths'],
      profit: ['Advanced reporting', 'Investment planning', 'Scenario planning'],
      strategy: ['Market expansion', 'Innovation pipeline', 'Strategic partnerships']
    }
  }
];

export default function StrategicInitiatives() {
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [newInitiative, setNewInitiative] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<InitiativeCategory>('attract');
  const [filterCategory, setFilterCategory] = useState<InitiativeCategory | 'all' | 'selected'>('all');
  const [showInitiatives, setShowInitiatives] = useState(true);
  const [showRoadmap, setShowRoadmap] = useState(true);
  const [showAssessmentSuggestions, setShowAssessmentSuggestions] = useState(true);
  const [currentStage, setCurrentStage] = useState(REVENUE_STAGES[1]);
  const [roadmapCompletions, setRoadmapCompletions] = useState<RoadmapCompletion[]>([]);
  const [assessmentSuggestions, setAssessmentSuggestions] = useState<AssessmentSuggestion[]>([]);
  const [assessmentResults, setAssessmentResults] = useState<AssessmentResults | null>(null);
  const [latestAssessment, setLatestAssessment] = useState<Assessment | null>(null);
  const [twelveMonthTargets, setTwelveMonthTargets] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (!contextLoading) {
      loadData();
    }
  }, [contextLoading, activeBusiness?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        setError('Authentication error. Please log in again.');
        setLoading(false);
        return;
      }

      if (!user) {
        setLoading(false);
        return;
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      // Load business profile and determine revenue stage
      await loadBusinessProfile(targetUserId);

      // Load latest assessment and generate suggestions
      await loadLatestAssessment(targetUserId);

      // Load initiatives
      const { data: initiativesData, error: dbError } = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (dbError) {
        console.error('Database error:', dbError);
        setError('Error loading initiatives. Please refresh the page.');
      } else {
        setInitiatives(initiativesData || []);
      }

      // Load roadmap completions
      try {
        const { data: completionsData } = await supabase
          .from('roadmap_completions')
          .select('*')
          .eq('user_id', targetUserId);

        if (completionsData) {
          setRoadmapCompletions(completionsData);
        }
      } catch (completionError) {
        console.log('Roadmap completions not available yet (this is okay)');
      }

    } catch (error) {
      console.error('Error loading data:', error);
      setError('An unexpected error occurred. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const loadBusinessProfile = async (targetUserId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .single();

      let revenue = 500000; // default

      if (profileData?.annual_revenue) {
        revenue = profileData.annual_revenue;
      } else {
        // Fallback to localStorage
        const storedProfile = localStorage.getItem('businessProfile');
        if (storedProfile) {
          const profile = JSON.parse(storedProfile);
          revenue = profile.annual_revenue || profile.current_revenue || profile.currentRevenue || 500000;
        }
      }

      const stage = REVENUE_STAGES.find(s => revenue >= s.min && revenue < s.max) || REVENUE_STAGES[1];
      setCurrentStage(stage);
    } catch (error) {
      console.error('Error loading business profile:', error);
    }
  };

  const loadLatestAssessment = async (targetUserId: string) => {
    try {
      // Load latest assessment from Supabase
      const { data: assessmentData, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (assessmentData && !error) {
        setLatestAssessment(assessmentData);
        
        // Extract 12-month targets from assessment answers
        if (assessmentData.answers) {
          const targets = {
            currentRevenue: assessmentData.answers.currentRevenue || assessmentData.answers.current_revenue,
            targetRevenue: assessmentData.answers.targetRevenue || assessmentData.answers.target_revenue,
            currentProfit: assessmentData.answers.currentProfit || assessmentData.answers.current_profit,
            targetProfit: assessmentData.answers.targetProfit || assessmentData.answers.target_profit
          };
          
          if (targets.currentRevenue || targets.targetRevenue) {
            setTwelveMonthTargets(targets);
          }
        }
        
        // Convert to AssessmentResults format
        const results: AssessmentResults = {
          sectionScores: assessmentData.section_scores || {},
          totalScore: assessmentData.total_score || 0,
          percentage: assessmentData.percentage || 0,
          healthStatus: assessmentData.health_status || 'BUILDING',
          revenueStage: assessmentData.revenue_stage || 'Foundation',
          improvementAreas: assessmentData.improvement_areas || [],
          topStrengths: assessmentData.top_strengths || [],
          recommendations: assessmentData.recommendations || []
        };

        setAssessmentResults(results);
        const suggestions = generateAssessmentSuggestions(results);
        setAssessmentSuggestions(suggestions);
      } else {
        // Fallback to localStorage if no Supabase data
        await loadAssessmentFromLocalStorage();
      }
    } catch (error) {
      console.error('Error loading assessment from Supabase:', error);
      // Fallback to localStorage
      await loadAssessmentFromLocalStorage();
    }
  };

  const loadAssessmentFromLocalStorage = async () => {
    try {
      // Try to load from multiple possible localStorage keys
      const assessmentResults = localStorage.getItem('assessmentResults');
      const latestAssessment = localStorage.getItem('latestAssessment');
      const assessmentAnswers = localStorage.getItem('assessmentAnswers');

      let results: AssessmentResults | null = null;

      if (assessmentResults) {
        results = JSON.parse(assessmentResults);
      } else if (latestAssessment) {
        const assessment = JSON.parse(latestAssessment);
        results = assessment.results || assessment;
      } else if (assessmentAnswers) {
        // If we only have answers, generate basic results
        const answers = JSON.parse(assessmentAnswers);
        results = generateBasicAssessmentResults(answers);
      }

      if (results) {
        setAssessmentResults(results);
        const suggestions = generateAssessmentSuggestions(results);
        setAssessmentSuggestions(suggestions);
      }
    } catch (error) {
      console.log('No assessment results found in localStorage');
    }
  };

  const generateBasicAssessmentResults = (answers: Record<string, any>): AssessmentResults => {
    // Basic assessment analysis when we only have raw answers
    const foundationScore = calculateFoundationScore(answers);
    const strategicScore = calculateStrategicScore(answers);
    const enginesScore = calculateEnginesScore(answers);
    
    const totalScore = foundationScore + strategicScore + enginesScore;
    const percentage = Math.round((totalScore / 200) * 100); // Simplified max score
    
    return {
      sectionScores: {
        foundation: foundationScore,
        strategicWheel: strategicScore,
        engines: enginesScore,
      },
      totalScore,
      percentage,
      healthStatus: getHealthStatus(percentage),
      revenueStage: answers.revenue ? getRevenueStage(answers.revenue) : 'Foundation',
      improvementAreas: [],
      topStrengths: [],
      recommendations: []
    };
  };

  const calculateFoundationScore = (answers: Record<string, any>): number => {
    let score = 0;
    // Simplified foundation scoring
    if (answers.profitMargin && answers.profitMargin.includes('profit')) score += 20;
    if (answers.ownerSalary && answers.ownerSalary.includes('salary')) score += 15;
    if (answers.businessDependency && answers.businessDependency.includes('runs well')) score += 15;
    return Math.min(score, 50);
  };

  const calculateStrategicScore = (answers: Record<string, any>): number => {
    let score = 0;
    // Simplified strategic scoring based on common question patterns
    if (answers.visionClarity && answers.visionClarity.includes('clear')) score += 15;
    if (answers.teamCulture && answers.teamCulture.includes('good')) score += 15;
    if (answers.marketPosition && answers.marketPosition.includes('strong')) score += 15;
    return Math.min(score, 60);
  };

  const calculateEnginesScore = (answers: Record<string, any>): number => {
    let score = 0;
    // Simplified engines scoring
    if (answers.marketingROI && !answers.marketingROI.includes("Don't")) score += 20;
    if (answers.salesProcess && answers.salesProcess.includes('systematic')) score += 20;
    if (answers.customerSatisfaction && answers.customerSatisfaction.includes('Over 80%')) score += 20;
    return Math.min(score, 100);
  };

  const getHealthStatus = (percentage: number): string => {
    if (percentage >= 90) return 'THRIVING';
    if (percentage >= 80) return 'STRONG';
    if (percentage >= 70) return 'STABLE';
    if (percentage >= 60) return 'BUILDING';
    if (percentage >= 50) return 'STRUGGLING';
    return 'URGENT';
  };

  const getRevenueStage = (revenue: string): string => {
    const stageMap: Record<string, string> = {
      'Under $250K': 'Foundation',
      '$250K - $1M': 'Traction',
      '$1M - $3M': 'Scaling',
      '$3M - $5M': 'Optimization',
      '$5M - $10M': 'Leadership',
      '$10M+': 'Mastery'
    };
    return stageMap[revenue] || 'Foundation';
  };

  const generateAssessmentSuggestions = (results: AssessmentResults): AssessmentSuggestion[] => {
    const suggestions: AssessmentSuggestion[] = [];
    let suggestionId = 1;

    // Generate suggestions based on health status
    if (results.healthStatus === 'URGENT' || results.healthStatus === 'STRUGGLING') {
      suggestions.push({
        id: `urgent-${suggestionId++}`,
        title: 'Establish daily cash flow monitoring',
        category: 'profit',
        reason: `Your business health needs immediate attention`,
        priority: 'high',
        section: 'Foundation'
      });

      suggestions.push({
        id: `urgent-${suggestionId++}`,
        title: 'Create basic standard operating procedures',
        category: 'systems',
        reason: 'Standardizing core processes will reduce chaos',
        priority: 'high',
        section: 'Systems'
      });
    }

    // Generate suggestions based on section scores
    const sections = results.sectionScores;
    
    if (sections.foundation && sections.foundation < 30) {
      suggestions.push({
        id: `foundation-${suggestionId++}`,
        title: 'Implement monthly financial reviews',
        category: 'profit',
        reason: 'Foundation needs strengthening',
        priority: 'high',
        section: 'Foundation'
      });

      suggestions.push({
        id: `foundation-${suggestionId++}`,
        title: 'Reduce business dependency on owner',
        category: 'systems',
        reason: 'Build systems that work without you',
        priority: 'high',
        section: 'Foundation'
      });
    }

    if (sections.strategicWheel && sections.strategicWheel < 45) {
      suggestions.push({
        id: `strategic-${suggestionId++}`,
        title: 'Define clear 3-year vision',
        category: 'strategy',
        reason: 'Strategic direction needs clarity',
        priority: 'high',
        section: 'Strategic Wheel'
      });

      suggestions.push({
        id: `strategic-${suggestionId++}`,
        title: 'Implement weekly team alignment meetings',
        category: 'people',
        reason: 'Improve team communication and alignment',
        priority: 'medium',
        section: 'Strategic Wheel'
      });
    }

    if (sections.engines && sections.engines < 70) {
      suggestions.push({
        id: `engines-${suggestionId++}`,
        title: 'Implement marketing ROI tracking',
        category: 'attract',
        reason: 'Track what marketing activities work',
        priority: 'medium',
        section: 'Business Engines'
      });

      suggestions.push({
        id: `engines-${suggestionId++}`,
        title: 'Create systematic sales follow-up process',
        category: 'convert',
        reason: 'Consistent follow-up improves conversion',
        priority: 'medium',
        section: 'Business Engines'
      });
    }

    // Stage-specific suggestions
    if (results.revenueStage === 'Foundation') {
      suggestions.push({
        id: `stage-${suggestionId++}`,
        title: 'Validate product-market fit',
        category: 'strategy',
        reason: 'Foundation stage requires market validation',
        priority: 'high',
        section: 'Revenue Stage'
      });
    } else if (results.revenueStage === 'Traction') {
      suggestions.push({
        id: `stage-${suggestionId++}`,
        title: 'Hire first key employee',
        category: 'people',
        reason: 'Time to build your initial team',
        priority: 'medium',
        section: 'Revenue Stage'
      });
    }

    // Sort by priority and limit to top suggestions
    return suggestions
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, 6); // Limit to 6 suggestions
  };

  const addInitiative = async () => {
    if (!newInitiative.trim()) return;

    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('Please log in to add initiatives');
        return;
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      const initiative = {
        user_id: targetUserId,
        title: newInitiative.trim(),
        category: selectedCategory,
        priority: 'medium',
        source_type: 'user',
        selected_for_action: false,
        selected_for_annual_plan: false
      };

      const { data, error: insertError } = await supabase
        .from('strategic_initiatives')
        .insert(initiative)
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        setError('Failed to add initiative. Please try again.');
      } else if (data) {
        setInitiatives([data, ...initiatives]);
        setNewInitiative('');
      }
    } catch (error) {
      console.error('Error adding initiative:', error);
      setError('An unexpected error occurred. Please try again.');
    }
  };

  const addFromAssessment = async (suggestion: AssessmentSuggestion) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      const initiative = {
        user_id: targetUserId,
        title: suggestion.title,
        category: suggestion.category,
        priority: suggestion.priority,
        source_type: 'assessment',
        assessment_suggestion_id: suggestion.id,
        selected_for_action: false,
        selected_for_annual_plan: false
      };

      const { data, error } = await supabase
        .from('strategic_initiatives')
        .insert(initiative)
        .select()
        .single();

      if (!error && data) {
        setInitiatives([data, ...initiatives]);
      }
    } catch (error) {
      console.error('Error adding from assessment:', error);
    }
  };

  const addFromRoadmap = async (task: string, category: InitiativeCategory, stage: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      const initiative = {
        user_id: targetUserId,
        title: task,
        category: category,
        priority: 'medium',
        source_type: 'roadmap',
        roadmap_item_id: `${stage}_${category}_${task.toLowerCase().replace(/\s+/g, '_')}`,
        selected_for_action: false,
        selected_for_annual_plan: false
      };

      const { data, error } = await supabase
        .from('strategic_initiatives')
        .insert(initiative)
        .select()
        .single();

      if (!error && data) {
        setInitiatives([data, ...initiatives]);
      }
    } catch (error) {
      console.error('Error adding from roadmap:', error);
    }
  };

  const toggleRoadmapCompletion = async (stage: string, category: string, itemText: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      const existing = roadmapCompletions.find(
        r => r.stage === stage && r.category === category && r.item_text === itemText
      );

      if (existing) {
        const { error } = await supabase
          .from('roadmap_completions')
          .update({
            completed: !existing.completed,
            completed_at: !existing.completed ? new Date().toISOString() : null
          })
          .eq('id', existing.id);

        if (!error) {
          setRoadmapCompletions(prev => prev.map(r =>
            r.id === existing.id
              ? { ...r, completed: !r.completed, completed_at: !r.completed ? new Date().toISOString() : undefined }
              : r
          ));
        }
      } else {
        const { data, error } = await supabase
          .from('roadmap_completions')
          .insert({
            user_id: targetUserId,
            stage,
            category,
            item_text: itemText,
            completed: true,
            completed_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!error && data) {
          setRoadmapCompletions(prev => [...prev, data]);
        }
      }
    } catch (error) {
      console.error('Error toggling roadmap completion:', error);
    }
  };

  const toggleAnnualPlan = async (id: string) => {
    const initiative = initiatives.find(i => i.id === id);
    if (!initiative) return;

    const selectedCount = initiatives.filter(i => i.selected_for_annual_plan).length;
    if (!initiative.selected_for_annual_plan && selectedCount >= 15) return;

    try {
      const { error } = await supabase
        .from('strategic_initiatives')
        .update({ selected_for_annual_plan: !initiative.selected_for_annual_plan })
        .eq('id', id);

      if (!error) {
        setInitiatives(prev => prev.map(i => 
          i.id === id ? { ...i, selected_for_annual_plan: !i.selected_for_annual_plan } : i
        ));
      }
    } catch (error) {
      console.error('Error updating initiative:', error);
    }
  };

  const deleteInitiative = async (id: string) => {
    try {
      const { error } = await supabase
        .from('strategic_initiatives')
        .delete()
        .eq('id', id);

      if (!error) {
        setInitiatives(prev => prev.filter(i => i.id !== id));
      }
    } catch (error) {
      console.error('Error deleting initiative:', error);
    }
  };

  // Helper functions for roadmap
  const getRoadmapItemsToShow = () => {
    const currentStageIndex = REVENUE_STAGES.findIndex(s => s.id === currentStage.id);
    const stagesToShow = REVENUE_STAGES.slice(0, currentStageIndex + 1);
    
    const itemsToShow: any[] = [];
    
    stagesToShow.forEach(stage => {
      Object.entries(stage.priorities).forEach(([category, tasks]) => {
        (tasks as string[]).forEach(task => {
          const completion = roadmapCompletions.find(
            r => r.stage === stage.id && r.category === category && r.item_text === task
          );
          
          const exists = initiatives.some(i => 
            i.title.toLowerCase() === task.toLowerCase() && 
            i.category === category
          );

          itemsToShow.push({
            stage: stage.id,
            stageName: stage.name,
            category,
            task,
            completed: completion?.completed || false,
            exists,
            isCurrentStage: stage.id === currentStage.id
          });
        });
      });
    });

    return itemsToShow;
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'text-red-700 bg-red-100';
      case 'medium': return 'text-brand-orange-700 bg-brand-orange-100';
      case 'low': return 'text-brand-orange-700 bg-brand-orange-100';
    }
  };

  const filteredInitiatives = initiatives.filter(i => {
    if (filterCategory === 'all') return true;
    if (filterCategory === 'selected') return i.selected_for_annual_plan;
    return i.category === filterCategory;
  });

  const selectedCount = initiatives.filter(i => i.selected_for_annual_plan).length;
  const maxReached = selectedCount >= 15;
  const roadmapItems = getRoadmapItemsToShow();
  const incompleteRoadmapItems = roadmapItems.filter(item => !item.completed);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading initiatives...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Input Section - FIRST */}
      <div className="bg-gradient-to-br from-brand-orange-50 to-brand-orange-50 rounded-xl shadow-sm border border-brand-orange-100 p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-brand-orange-100 rounded-xl">
            <Target className="w-6 h-6 text-brand-orange" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              What do you need to implement/build/learn to achieve your 12-month targets?
            </h2>
            <div className="space-y-2">
              <p className="text-gray-600 leading-relaxed">
                Brain dump everything - systems, people, skills, processes, technology.
              </p>
              {twelveMonthTargets && (
                <div className="text-sm text-brand-orange-800 bg-brand-orange-100 rounded-lg p-3">
                  <strong>Your 12-month targets:</strong> 
                  {twelveMonthTargets.currentRevenue && twelveMonthTargets.targetRevenue && (
                    <span className="ml-2">
                      ${twelveMonthTargets.currentRevenue?.toLocaleString()} → ${twelveMonthTargets.targetRevenue?.toLocaleString()} revenue
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={newInitiative}
              onChange={(e) => setNewInitiative(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addInitiative()}
              placeholder="Type what you need to implement..."
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as InitiativeCategory)}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
            >
              {Object.entries(categoryInfo).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
            <button
              onClick={addInitiative}
              disabled={!newInitiative.trim()}
              className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 ${
                !newInitiative.trim()
                  ? 'bg-gray-300 text-gray-500'
                  : 'bg-brand-orange text-white hover:bg-brand-orange-600'
              }`}
            >
              <Plus className="w-5 h-5" />
              Add
            </button>
          </div>
          
          <div className="p-4 bg-brand-orange-50 rounded-lg border border-brand-orange-100">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-brand-orange mt-0.5" />
              <p className="text-sm text-brand-orange-800">
                <span className="font-bold">Pro tip:</span> Think capabilities - what systems, people, skills do you need to hit your targets?
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Foundation-First Roadmap - SECOND (Your Key IP) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setShowRoadmap(!showRoadmap)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Building className="w-5 h-5 text-brand-orange" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Foundation-First Roadmap</h3>
              <p className="text-sm text-gray-600">
                {currentStage.name} ({currentStage.range}) • {incompleteRoadmapItems.length} items remaining across all levels
              </p>
            </div>
          </div>
          {showRoadmap ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        
        {showRoadmap && (
          <div className="border-t border-gray-200 p-6">
            <div className="mb-4 p-3 bg-brand-orange-50 rounded-lg border border-brand-orange-200">
              <div className="flex items-center gap-2 text-brand-orange-700 text-sm">
                <AlertCircle className="w-4 h-4" />
                <strong>Foundation-First Approach:</strong> Complete lower levels before advancing. Showing all levels through {currentStage.name}.
              </div>
            </div>
            
            <div className="space-y-6">
              {REVENUE_STAGES.slice(0, REVENUE_STAGES.findIndex(s => s.id === currentStage.id) + 1).map((stage) => {
                const stageItems = roadmapItems.filter(item => item.stage === stage.id);
                const completedCount = stageItems.filter(item => item.completed).length;
                const totalCount = stageItems.length;
                const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                
                return (
                  <div key={stage.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className={`font-medium ${stage.id === currentStage.id ? 'text-brand-orange-700' : 'text-gray-700'}`}>
                        {stage.name} ({stage.range})
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">
                          {completedCount}/{totalCount} completed ({completionPercent}%)
                        </span>
                        <div className="w-20 h-2 bg-gray-200 rounded-full">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              completionPercent === 100 ? 'bg-green-500' : 
                              completionPercent > 50 ? 'bg-brand-orange-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${completionPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid gap-4">
                      {Object.entries(stage.priorities).map(([category, tasks]) => {
                        const Icon = categoryIcons[category as InitiativeCategory];
                        const info = categoryInfo[category as InitiativeCategory];
                        const categoryItems = stageItems.filter(item => item.category === category);
                        const categoryCompleted = categoryItems.filter(item => item.completed).length;
                        
                        return (
                          <div key={category} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-gray-600" />
                              <h5 className="font-medium text-gray-900">{info?.label}</h5>
                              <span className="text-xs text-gray-500">
                                ({categoryCompleted}/{categoryItems.length})
                              </span>
                            </div>
                            <div className="grid gap-2 pl-6">
                              {(tasks as string[]).map((task, idx) => {
                                const item = stageItems.find(si => si.task === task && si.category === category);
                                const completed = item?.completed || false;
                                const exists = item?.exists || false;
                                
                                return (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => toggleRoadmapCompletion(stage.id, category, task)}
                                        className="flex-shrink-0"
                                      >
                                        {completed ? (
                                          <CheckSquare className="w-5 h-5 text-green-600" />
                                        ) : (
                                          <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                                        )}
                                      </button>
                                      <span className={`text-sm ${completed ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                                        {task}
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      {exists && (
                                        <span className="text-xs text-brand-orange flex items-center gap-1">
                                          <Check className="w-3.5 h-3.5" />
                                          In List
                                        </span>
                                      )}
                                      {!exists && !completed && (
                                        <button
                                          onClick={() => addFromRoadmap(task, category as InitiativeCategory, stage.id)}
                                          className="text-xs px-3 py-1 bg-brand-orange text-white rounded hover:bg-brand-orange-600 transition-colors"
                                        >
                                          Add to List
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Assessment Suggestions - THIRD (Simplified, Blue Branded) */}
      {assessmentResults && assessmentSuggestions.length > 0 && (
        <div className="bg-gradient-to-br from-brand-orange-50 to-brand-orange-50 rounded-xl shadow-sm border border-brand-orange-100">
          <button
            onClick={() => setShowAssessmentSuggestions(!showAssessmentSuggestions)}
            className="w-full p-4 flex items-center justify-between hover:bg-brand-orange-50 transition-colors text-left rounded-t-xl"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-brand-orange" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Diagnostic-Based Suggestions</h3>
                <p className="text-sm text-gray-600">
                  {assessmentSuggestions.length} recommendations based on your assessment
                  {latestAssessment && (
                    <span className="ml-1">
                      • From {new Date(latestAssessment.created_at).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            {showAssessmentSuggestions ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          
          {showAssessmentSuggestions && (
            <div className="border-t border-brand-orange-200 p-6">
              <div className="space-y-3">
                {assessmentSuggestions.map((suggestion) => {
                  const Icon = categoryIcons[suggestion.category];
                  const info = categoryInfo[suggestion.category];
                  const exists = initiatives.some(i => i.title.toLowerCase() === suggestion.title.toLowerCase());
                  
                  return (
                    <div
                      key={suggestion.id}
                      className="flex items-start gap-4 p-4 bg-white rounded-lg border hover:border-brand-orange-200 transition-colors"
                    >
                      <div className="flex-shrink-0 p-2 bg-brand-orange-100 rounded-lg">
                        <Icon className="w-4 h-4 text-brand-orange" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-medium text-gray-900 text-sm">{suggestion.title}</h4>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${getPriorityColor(suggestion.priority)}`}>
                              {suggestion.priority.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-600 mb-2">{suggestion.reason}</p>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <Icon className="w-3 h-3" />
                              {info?.label}
                            </span>
                            <span>•</span>
                            <span>{suggestion.section}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {exists && (
                              <span className="text-xs text-brand-orange flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                In List
                              </span>
                            )}
                            {!exists && (
                              <button
                                onClick={() => addFromAssessment(suggestion)}
                                className="text-xs px-3 py-1 bg-brand-orange text-white rounded hover:bg-brand-orange-600 transition-colors"
                              >
                                Add to List
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-3 bg-brand-orange-50 rounded-lg border border-brand-orange-200">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-4 h-4 text-brand-orange mt-0.5" />
                  <p className="text-xs text-brand-orange-800">
                    <span className="font-bold">Assessment Insight:</span> These suggestions target your diagnostic weak spots for maximum impact.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 12-Month Focus Selection Interface */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Section Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Select Your 12-Month Focus ({selectedCount}/15)
              </h3>
              <p className="text-sm text-gray-600">
                Choose up to 15 initiatives to prioritize over the next 12 months to achieve your targets
              </p>
              {maxReached && (
                <div className="flex items-center gap-2 text-brand-orange-600 text-sm mt-2">
                  <AlertCircle className="w-4 h-4" />
                  Maximum reached - deselect one to add another
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter Options */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterCategory === 'all' ? 'bg-brand-orange-100 text-brand-orange-700' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              All ({initiatives.length})
            </button>
            <button
              onClick={() => setFilterCategory('selected')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterCategory === 'selected' ? 'bg-brand-orange-100 text-brand-orange-700' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              Selected Only ({selectedCount})
            </button>
            {Object.entries(categoryInfo).map(([key, info]) => {
              const Icon = categoryIcons[key as InitiativeCategory];
              const categoryCount = initiatives.filter(i => i.category === key).length;
              return (
                <button
                  key={key}
                  onClick={() => setFilterCategory(key as InitiativeCategory)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    filterCategory === key ? 'bg-brand-orange-100 text-brand-orange-700' : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {info.label} ({categoryCount})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Your Initiatives List - FOURTH */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setShowInitiatives(!showInitiatives)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-brand-orange" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Your Initiatives</h3>
              <p className="text-sm text-gray-600">
                {filteredInitiatives.length} initiatives
                {filterCategory === 'all' && ` • ${selectedCount}/15 selected for 12-month focus`}
                {filterCategory === 'selected' && ` selected for 12-month focus`}
                {filterCategory !== 'all' && filterCategory !== 'selected' && 
                  ` in ${categoryInfo[filterCategory as InitiativeCategory]?.label}`
                }
              </p>
            </div>
          </div>
          {showInitiatives ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        
        {showInitiatives && (
          <div className="border-t border-gray-200 p-6">
            {filteredInitiatives.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {filterCategory === 'all' && "No initiatives yet. Start adding what you need to implement!"}
                {filterCategory === 'selected' && "No initiatives selected yet. Start selecting your 12-month focus above."}
                {filterCategory !== 'all' && filterCategory !== 'selected' && 
                  `No initiatives in ${categoryInfo[filterCategory as InitiativeCategory]?.label}. Try another category or add one above.`
                }
              </div>
            ) : (
              <div className="space-y-2">
                {filteredInitiatives.map((initiative) => {
                  const Icon = categoryIcons[initiative.category as InitiativeCategory];
                  const info = categoryInfo[initiative.category as InitiativeCategory];
                  const isDisabled = !initiative.selected_for_annual_plan && maxReached;
                  const isSelected = initiative.selected_for_annual_plan;
                  
                  return (
                    <div
                      key={initiative.id}
                      className={`flex items-center gap-4 p-4 rounded-lg transition-colors border ${
                        isSelected 
                          ? 'bg-brand-orange-50 border-brand-orange-200' 
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      } ${isDisabled ? 'opacity-50' : ''}`}
                    >
                      <div className="flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAnnualPlan(initiative.id)}
                          disabled={isDisabled}
                          className="w-6 h-6 text-brand-orange rounded border-2 border-gray-300 focus:ring-brand-orange focus:ring-2 disabled:cursor-not-allowed"
                        />
                      </div>
                      
                      <div className="flex-1 text-gray-900 font-medium">
                        {initiative.title}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {Icon && <Icon className="w-3.5 h-3.5" />}
                          {info?.label || initiative.category}
                        </div>
                        
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          initiative.source_type === 'user' ? 'bg-green-100 text-green-700' :
                          initiative.source_type === 'assessment' ? 'bg-brand-orange-100 text-brand-orange-700' :
                          initiative.source_type === 'roadmap' ? 'bg-brand-orange-100 text-brand-orange-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          <User className="w-3 h-3" />
                          {initiative.source_type === 'user' ? 'You' : 
                           initiative.source_type === 'assessment' ? 'Assessment' :
                           initiative.source_type === 'roadmap' ? 'Roadmap' : 'You'}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => deleteInitiative(initiative.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}