'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
  ArrowLeft,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Target,
  Award,
  BarChart3,
  DollarSign,
  Brain,
  Clock,
  RefreshCw
} from 'lucide-react';

interface AssessmentResult {
  id: string;
  created_at: string;
  total_score: number;
  percentage: number;
  health_status: string;
  total_max: number;
  // 8 Engine scores
  attract_score: number;
  attract_max: number;
  convert_score: number;
  convert_max: number;
  deliver_score: number;
  deliver_max: number;
  people_score: number;
  people_max: number;
  systems_score: number;
  systems_max: number;
  finance_score: number;
  finance_max: number;
  leadership_score: number;
  leadership_max: number;
  time_score: number;
  time_max: number;
  answers: any;
}

export default function AssessmentResultsPage() {
  const params = useParams();
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

  useEffect(() => {
    loadAssessment();
  }, []);

  async function loadAssessment() {
    try {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;
      setAssessment(data);
    } catch (error) {
      console.error('Error loading assessment:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Not Found</h2>
          <p className="text-gray-600 mb-4">This assessment could not be loaded.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Use the percentage directly from the assessment, or calculate if missing
  const healthPercentage = assessment.percentage || Math.round((assessment.total_score / (assessment.total_max || 300)) * 100);

  const getHealthStatusDisplay = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'THRIVING': return { label: 'THRIVING', color: 'text-green-600', bg: 'bg-green-100' };
      case 'STRONG': return { label: 'STRONG', color: 'text-green-500', bg: 'bg-green-50' };
      case 'STABLE': return { label: 'STABLE', color: 'text-yellow-600', bg: 'bg-yellow-50' };
      case 'BUILDING': return { label: 'BUILDING', color: 'text-orange-600', bg: 'bg-orange-50' };
      case 'STRUGGLING': return { label: 'STRUGGLING', color: 'text-red-500', bg: 'bg-red-50' };
      default: return { label: 'URGENT', color: 'text-red-600', bg: 'bg-red-100' };
    }
  };

  const healthStatus = getHealthStatusDisplay(assessment.health_status);

  // Calculate time since assessment
  const getTimeSinceAssessment = () => {
    const assessmentDate = new Date(assessment.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - assessmentDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { text: 'Completed today', shouldRetake: false };
    if (diffDays === 1) return { text: 'Completed yesterday', shouldRetake: false };
    if (diffDays < 7) return { text: `Completed ${diffDays} days ago`, shouldRetake: false };
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return { text: `Completed ${weeks} week${weeks > 1 ? 's' : ''} ago`, shouldRetake: false };
    }
    if (diffDays < 90) {
      const months = Math.floor(diffDays / 30);
      return { text: `Completed ${months} month${months > 1 ? 's' : ''} ago`, shouldRetake: months >= 2 };
    }
    const months = Math.floor(diffDays / 30);
    return { text: `Completed ${months} months ago`, shouldRetake: true };
  };

  const timeSince = getTimeSinceAssessment();

  // 8 Business Engines configuration
  const engines = [
    { id: 'attract', name: 'Attract', subtitle: 'Marketing & Lead Gen', score: assessment.attract_score || 0, max: assessment.attract_max || 40, icon: Target, color: 'blue' },
    { id: 'convert', name: 'Convert', subtitle: 'Sales & Closing', score: assessment.convert_score || 0, max: assessment.convert_max || 40, icon: TrendingUp, color: 'green' },
    { id: 'deliver', name: 'Deliver', subtitle: 'Client Experience', score: assessment.deliver_score || 0, max: assessment.deliver_max || 40, icon: CheckCircle, color: 'purple' },
    { id: 'people', name: 'People', subtitle: 'Team & Culture', score: assessment.people_score || 0, max: assessment.people_max || 40, icon: Award, color: 'indigo' },
    { id: 'systems', name: 'Systems', subtitle: 'Operations & Tech', score: assessment.systems_score || 0, max: assessment.systems_max || 40, icon: BarChart3, color: 'slate' },
    { id: 'finance', name: 'Finance', subtitle: 'Money & Metrics', score: assessment.finance_score || 0, max: assessment.finance_max || 30, icon: DollarSign, color: 'emerald' },
    { id: 'leadership', name: 'Leadership', subtitle: 'Vision & Strategy', score: assessment.leadership_score || 0, max: assessment.leadership_max || 30, icon: Brain, color: 'amber' },
    { id: 'time', name: 'Time', subtitle: 'Freedom & Leverage', score: assessment.time_score || 0, max: assessment.time_max || 40, icon: Clock, color: 'cyan' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </button>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/assessment/history')}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                View History
              </button>
              <div className="text-sm text-gray-500">
                Completed: {new Date(assessment.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Time Since Assessment Banner */}
        {timeSince.shouldRetake && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center">
              <Clock className="w-5 h-5 text-amber-600 mr-3" />
              <div>
                <p className="text-amber-800 font-medium">{timeSince.text}</p>
                <p className="text-amber-600 text-sm">We recommend retaking the assessment quarterly to track your progress</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/assessment?new=true')}
              className="flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retake Now
            </button>
          </div>
        )}

        {/* Overall Score Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Your Business Assessment Results
            </h1>
            <p className="text-gray-600">
              Comprehensive analysis of your business health and opportunities
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Score Circle */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-48 h-48">
                <svg className="w-48 h-48 transform -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-gray-200"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${healthPercentage * 5.53} 553`}
                    className={healthStatus.color}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-gray-900">
                    {healthPercentage}%
                  </div>
                  <div className={`text-sm font-semibold px-3 py-1 rounded-full ${healthStatus.bg} ${healthStatus.color}`}>
                    {healthStatus.label}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-lg font-semibold text-gray-900">
                  Overall Business Health
                </p>
                <p className="text-sm text-gray-600">
                  {assessment.total_score || 0} out of {assessment.total_max || 300} points
                </p>
              </div>
            </div>

            {/* Detailed Breakdown - 8 Engines */}
            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">8 Business Engines</h3>
              {engines.map((engine) => {
                const percentage = engine.max > 0 ? Math.round((engine.score / engine.max) * 100) : 0;
                const Icon = engine.icon;

                return (
                  <div key={engine.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <Icon className="w-4 h-4 mr-2 text-gray-600" />
                        <div>
                          <span className="font-medium text-gray-900">{engine.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{engine.subtitle}</span>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ${
                        percentage >= 80 ? 'text-green-600' :
                        percentage >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          percentage >= 80 ? 'bg-green-500' :
                          percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {engine.score}/{engine.max} points
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recommendations Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center mb-6">
            <Target className="w-6 h-6 text-teal-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-900">Key Recommendations</h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Priority Areas */}
            <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
              <div className="flex items-center mb-3">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <h3 className="font-semibold text-red-900">Priority Areas</h3>
              </div>
              <ul className="text-sm text-red-800 space-y-2">
                {engines
                  .filter(engine => engine.max > 0 && (engine.score / engine.max) < 0.6)
                  .slice(0, 4)
                  .map(engine => (
                    <li key={engine.id} className="flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-2" />
                      Focus on {engine.name}
                    </li>
                  ))
                }
                {engines.filter(engine => engine.max > 0 && (engine.score / engine.max) < 0.6).length === 0 && (
                  <li className="text-red-600 italic">No critical areas!</li>
                )}
              </ul>
            </div>

            {/* Strengths */}
            <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
              <div className="flex items-center mb-3">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <h3 className="font-semibold text-green-900">Your Strengths</h3>
              </div>
              <ul className="text-sm text-green-800 space-y-2">
                {engines
                  .filter(engine => engine.max > 0 && (engine.score / engine.max) >= 0.8)
                  .slice(0, 4)
                  .map(engine => (
                    <li key={engine.id} className="flex items-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                      Strong {engine.name}
                    </li>
                  ))
                }
                {engines.filter(engine => engine.max > 0 && (engine.score / engine.max) >= 0.8).length === 0 && (
                  <li className="text-green-600 italic">Keep building!</li>
                )}
              </ul>
            </div>

            {/* Next Steps */}
            <div className="bg-teal-50 border-l-4 border-teal-500 p-6 rounded-lg">
              <div className="flex items-center mb-3">
                <TrendingUp className="w-5 h-5 text-teal-600 mr-2" />
                <h3 className="font-semibold text-teal-900">Next Steps</h3>
              </div>
              <ul className="text-sm text-teal-800 space-y-2">
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-teal-500 rounded-full mr-2" />
                  Set specific improvement goals
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-teal-500 rounded-full mr-2" />
                  Focus on priority areas first
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-teal-500 rounded-full mr-2" />
                  Schedule regular progress reviews
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-gradient-to-r from-teal-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Ready to Take Action?</h2>
            <p className="text-teal-100">
              Transform your assessment insights into actionable business improvements
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => router.push('/strategic-goals')}
              className="bg-white text-teal-600 font-semibold py-3 px-6 rounded-lg hover:bg-teal-50 transition-colors"
            >
              Set Strategic Goals
            </button>
            <button
              onClick={() => router.push('/assessment?new=true')}
              className="bg-teal-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-teal-800 transition-colors"
            >
              Retake Assessment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}