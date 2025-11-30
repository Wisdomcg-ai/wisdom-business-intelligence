'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/database.types';
import { calculateDetailedScores, SectionScore, HealthStatus, AssessmentInsight } from '@/lib/assessment-analytics';
import { ArrowLeft, TrendingUp, TrendingDown, Target, Award, AlertTriangle, CheckCircle, XCircle, BarChart3, Download } from 'lucide-react';

type Assessment = Database['public']['Tables']['assessments']['Row'];

export default function AssessmentResultsPage() {
  const params = useParams();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [sections, setSections] = useState<SectionScore[]>([]);
  const [overall, setOverall] = useState<HealthStatus | null>(null);
  const [insights, setInsights] = useState<AssessmentInsight[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

  useEffect(() => {
    loadAssessmentResults();
  }, [params.id]);

  async function loadAssessmentResults() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Fetch assessment data
      const { data: assessmentData, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) {
        console.error('Error loading assessment:', error);
        return;
      }

      if (!assessmentData) {
        console.error('Assessment not found');
        return;
      }

      setAssessment(assessmentData);

      // Calculate detailed scores and insights
      const results = calculateDetailedScores(assessmentData);
      setSections(results.sections);
      setOverall(results.overall);
      setInsights(results.insights);

    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'THRIVING': 'text-emerald-600 bg-emerald-100 border-emerald-200',
      'STRONG': 'text-green-600 bg-green-100 border-green-200',
      'STABLE': 'text-yellow-600 bg-yellow-100 border-yellow-200',
      'BUILDING': 'text-orange-600 bg-orange-100 border-orange-200',
      'STRUGGLING': 'text-red-600 bg-red-100 border-red-200',
      'URGENT': 'text-red-700 bg-red-100 border-red-300',
      'excellent': 'text-emerald-600',
      'good': 'text-green-600',
      'needs-work': 'text-yellow-600',
      'critical': 'text-red-600'
    };
    return colors[status] || 'text-gray-600';
  }

  function getProgressBarColor(status: string): string {
    const colors: Record<string, string> = {
      'excellent': 'bg-emerald-500',
      'good': 'bg-green-500',
      'needs-work': 'bg-yellow-500',
      'critical': 'bg-red-500'
    };
    return colors[status] || 'bg-gray-500';
  }

  function getInsightIcon(type: string) {
    switch (type) {
      case 'strength':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'improvement':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'opportunity':
        return <Target className="w-5 h-5 text-teal-500" />;
      default:
        return <BarChart3 className="w-5 h-5 text-gray-500" />;
    }
  }

  function getPriorityBadge(priority: string) {
    const styles: Record<string, string> = {
      'high': 'bg-red-100 text-red-700',
      'medium': 'bg-yellow-100 text-yellow-700',
      'low': 'bg-green-100 text-green-700'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[priority] || 'bg-gray-100 text-gray-700'}`}>
        {priority.toUpperCase()}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analyzing your assessment results...</p>
        </div>
      </div>
    );
  }

  if (!assessment || !overall) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Assessment not found</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Dashboard
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">Assessment Results</h1>
            </div>
            <button className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overall Health Score Card */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-gray-900">Business Health Score</h2>
            <div className={`px-6 py-3 rounded-full border-2 font-bold text-lg ${getStatusColor(overall.status)}`}>
              {overall.status}
            </div>
          </div>

          <div className="flex items-center space-x-8">
            {/* Circular Score Display */}
            <div className="relative">
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
                  strokeDasharray={`${2 * Math.PI * 88}`}
                  strokeDashoffset={`${2 * Math.PI * 88 * (1 - overall.percentage / 100)}`}
                  className={`text-${overall.color}-500 transition-all duration-1000 ease-out`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-gray-900">{overall.percentage}%</span>
                <span className="text-sm text-gray-500">{overall.score}/{overall.maxScore}</span>
              </div>
            </div>

            {/* Score Description */}
            <div className="flex-1">
              <p className="text-lg text-gray-700 mb-4">{overall.description}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Assessment Date:</span>
                  <span className="font-medium">{new Date(assessment.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Business Stage:</span>
                  <span className="font-medium">{assessment.revenue_stage || 'Not specified'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Completion:</span>
                  <span className="font-medium">{assessment.completion_percentage}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section Scores */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {sections.map((section, index) => (
            <div key={index} className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{section.name}</h3>
                <span className={`text-2xl font-bold ${getStatusColor(section.status)}`}>
                  {section.percentage}%
                </span>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>Score: {section.score}/{section.maxScore}</span>
                  <span className={`font-medium ${getStatusColor(section.status)}`}>
                    {section.status.replace('-', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-1000 ease-out ${getProgressBarColor(section.status)}`}
                    style={{ width: `${section.percentage}%` }}
                  ></div>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                {section.percentage >= 80 && "Excellent performance! This is a key strength."}
                {section.percentage >= 60 && section.percentage < 80 && "Good progress. Some optimization opportunities exist."}
                {section.percentage >= 40 && section.percentage < 60 && "Needs attention. Focus here for improvement."}
                {section.percentage < 40 && "Critical area. Immediate action recommended."}
              </p>
            </div>
          ))}
        </div>

        {/* Insights Section */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Key Insights & Recommendations</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Strengths */}
            <div className="space-y-3">
              <h3 className="font-semibold text-green-600 flex items-center">
                <Award className="w-5 h-5 mr-2" />
                Strengths
              </h3>
              {insights.filter(i => i.type === 'strength').map((insight, index) => (
                <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start">
                    {getInsightIcon(insight.type)}
                    <div className="ml-3 flex-1">
                      <p className="font-medium text-gray-900">{insight.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Improvements */}
            <div className="space-y-3">
              <h3 className="font-semibold text-yellow-600 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Areas to Improve
              </h3>
              {insights.filter(i => i.type === 'improvement').map((insight, index) => (
                <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    {getInsightIcon(insight.type)}
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-gray-900">{insight.title}</p>
                        {getPriorityBadge(insight.priority)}
                      </div>
                      <p className="text-sm text-gray-600">{insight.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Opportunities */}
            <div className="space-y-3">
              <h3 className="font-semibold text-teal-600 flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Opportunities
              </h3>
              {insights.filter(i => i.type === 'opportunity').map((insight, index) => (
                <div key={index} className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                  <div className="flex items-start">
                    {getInsightIcon(insight.type)}
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-gray-900">{insight.title}</p>
                        {getPriorityBadge(insight.priority)}
                      </div>
                      <p className="text-sm text-gray-600">{insight.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Next Steps */}
          <div className="mt-8 pt-6 border-t">
            <h3 className="font-semibold text-gray-900 mb-4">Recommended Next Steps</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button className="flex items-center justify-center px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                <Target className="w-5 h-5 mr-2" />
                Set 90-Day Goals
              </button>
              <button className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
                <TrendingUp className="w-5 h-5 mr-2" />
                Create Action Plan
              </button>
              <button className="flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                <BarChart3 className="w-5 h-5 mr-2" />
                Schedule Coaching Session
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}