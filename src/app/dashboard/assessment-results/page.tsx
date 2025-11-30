'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, TrendingUp, Target, AlertCircle, CheckCircle, Zap, Award } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BUSINESS_ENGINES, TOTAL_MAX_SCORE, getHealthStatus, getScoreColorClass, getScoreBgColorClass } from '@/lib/assessment/constants';

interface Assessment {
  id: string;
  created_at: string;
  total_score: number;
  percentage: number;
  health_status: string;
  attract_score: number;
  convert_score: number;
  deliver_score: number;
  people_score: number;
  systems_score: number;
  finance_score: number;
  leadership_score: number;
  time_score: number;
  answers: Record<string, any>;
}

// Wrapper component to handle Suspense for useSearchParams
export default function AssessmentResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your results...</p>
        </div>
      </div>
    }>
      <AssessmentResultsContent />
    </Suspense>
  );
}

function AssessmentResultsContent() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const assessmentId = searchParams?.get('id');

  // Complete onboarding and go to dashboard
  async function completeOnboardingAndContinue() {
    setCompletingOnboarding(true);
    try {
      const supabase = createClient();

      // Clear onboarding step (marks onboarding as complete)
      await supabase.auth.updateUser({
        data: {
          onboarding_step: null,
          onboarding_completed: true
        }
      });

      router.push('/dashboard');
    } catch (err) {
      console.error('Error completing onboarding:', err);
      // Still redirect even if metadata update fails
      router.push('/dashboard');
    }
  }

  useEffect(() => {
    if (assessmentId) {
      loadAssessment();
    } else {
      setError('No assessment ID provided');
      setLoading(false);
    }
  }, [assessmentId]);

  async function loadAssessment() {
    try {
      const supabase = createClient();
      
      const { data, error: dbError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        setError('Failed to load assessment results');
      } else {
        setAssessment(data);
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to load assessment results');
    } finally {
      setLoading(false);
    }
  }

  function getHealthStatusColor(status: string): string {
    switch (status?.toUpperCase()) {
      case 'THRIVING': return 'bg-emerald-500';
      case 'STRONG': return 'bg-green-500';
      case 'STABLE': return 'bg-yellow-500';
      case 'BUILDING': return 'bg-orange-500';
      case 'STRUGGLING': return 'bg-red-400';
      case 'URGENT': return 'bg-red-600';
      default: return 'bg-gray-500';
    }
  }

  // Traffic light color for the score circle based on percentage
  function getTrafficLightColor(percentage: number): string {
    if (percentage >= 70) return 'text-green-500';
    if (percentage >= 50) return 'text-yellow-500';
    return 'text-red-500';
  }

  function getHealthStatusText(status: string): { title: string; description: string } {
    switch (status?.toUpperCase()) {
      case 'THRIVING':
        return {
          title: 'Thriving',
          description: 'Your business is firing on all cylinders! Let\'s focus on maintaining excellence and scaling strategically.'
        };
      case 'STRONG':
        return {
          title: 'Strong',
          description: 'Solid foundation in place. We\'ll work together to optimize key areas and accelerate growth.'
        };
      case 'STABLE':
        return {
          title: 'Stable',
          description: 'Good progress with clear improvement opportunities. Let\'s prioritize the highest-impact areas.'
        };
      case 'BUILDING':
        return {
          title: 'Building',
          description: 'Foundation developing. We\'ll focus on strengthening critical business fundamentals together.'
        };
      case 'STRUGGLING':
        return {
          title: 'Struggling',
          description: 'Significant gaps identified. Let\'s create an action plan to address the most critical areas first.'
        };
      case 'URGENT':
        return {
          title: 'Urgent',
          description: 'Critical issues identified. We\'ll work closely together to stabilize and strengthen your foundation.'
        };
      default:
        return { title: 'Unknown', description: 'Assessment status not available' };
    }
  }

  function getSectionRecommendations(section: string, score: number, max: number): string[] {
    const percentage = (score / max) * 100;

    if (percentage >= 80) {
      return [`Excellent! Let's maintain this strength and look for optimization opportunities.`];
    } else if (percentage >= 60) {
      return [`Good progress. We'll focus on refining and optimizing these areas.`];
    } else if (percentage >= 40) {
      return [`Priority improvement area. We'll create a focused action plan for this section.`];
    } else {
      return [`Critical gap. This will be a primary focus in our coaching sessions.`];
    }
  }

  function downloadPDF() {
    if (!assessment) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Header - Title and Logo Area
    doc.setFillColor(37, 99, 235); // Blue
    doc.rect(0, 0, pageWidth, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Business Assessment Report', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const dateStr = new Date(assessment.created_at).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    doc.text(`Completed: ${dateStr}`, pageWidth / 2, 25, { align: 'center' });

    // Reset text color for body
    doc.setTextColor(0, 0, 0);
    let yPos = 50;

    // Overall Score Section
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Overall Business Health', 14, yPos);

    yPos += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    // Score box
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(14, yPos, pageWidth - 28, 25, 3, 3, 'F');

    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(`${assessment.percentage}%`, 30, yPos + 17);

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`${assessment.total_score}/${TOTAL_MAX_SCORE} points`, 70, yPos + 12);

    // Health status
    const healthStatus = getHealthStatusText(assessment.health_status);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const statusColor = getHealthStatusColorRGB(assessment.health_status);
    doc.setTextColor(statusColor.r, statusColor.g, statusColor.b);
    doc.text(healthStatus.title.toUpperCase(), 70, yPos + 21);

    doc.setTextColor(0, 0, 0);
    yPos += 35;

    // 8 Business Engines Breakdown
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('8 Business Engines', 14, yPos);
    yPos += 5;

    // Build sections array from BUSINESS_ENGINES constant
    const sections = BUSINESS_ENGINES.map(engine => ({
      name: engine.name,
      score: (assessment as any)[`${engine.id}_score`] || 0,
      max: engine.maxScore,
      description: engine.description
    }));

    // Create table data
    const tableData = sections.map(section => {
      const percentage = Math.round((section.score / section.max) * 100);
      const status = percentage >= 80 ? 'Excellent' : percentage >= 60 ? 'Good' : percentage >= 40 ? 'Needs Work' : 'Critical';
      return [
        section.name,
        `${section.score}/${section.max}`,
        `${percentage}%`,
        status
      ];
    });

    autoTable(doc, {
      startY: yPos + 5,
      head: [['Engine', 'Score', 'Percentage', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontSize: 11,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 10
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 35, halign: 'center' },
        3: { cellWidth: 40, halign: 'center' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Detailed Recommendations
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Assessment', 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    sections.forEach((section, index) => {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 20;
      }

      const percentage = Math.round((section.score / section.max) * 100);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(section.name, 14, yPos);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(section.description, 14, yPos + 5);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      const recommendation = getSectionRecommendations(section.name, section.score, section.max)[0];
      const splitText = doc.splitTextToSize(recommendation, pageWidth - 28);
      doc.text(splitText, 14, yPos + 11);

      yPos += 20;
    });

    // Next Steps
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    } else {
      yPos += 5;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Your Next Steps', 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const nextSteps = [
      '1. Review & Discuss: We\'ll review these results together in your next coaching session and identify quick wins.',
      '2. Prioritize Actions: We\'ll create a focused 90-day action plan targeting your highest-impact opportunities.',
      '3. Track Progress: Use the platform tools to implement changes and measure improvement over time.'
    ];

    nextSteps.forEach(step => {
      const splitText = doc.splitTextToSize(step, pageWidth - 28);
      doc.text(splitText, 14, yPos);
      yPos += 8;
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Generated by Business Coaching Platform', pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Save the PDF
    doc.save(`Business-Assessment-${dateStr.replace(/\s/g, '-')}.pdf`);
  }

  function getHealthStatusColorRGB(status: string): { r: number; g: number; b: number } {
    switch (status?.toUpperCase()) {
      case 'THRIVING': return { r: 16, g: 185, b: 129 };
      case 'STRONG': return { r: 34, g: 197, b: 94 };
      case 'STABLE': return { r: 234, g: 179, b: 8 };
      case 'BUILDING': return { r: 249, g: 115, b: 22 };
      case 'STRUGGLING': return { r: 239, g: 68, b: 68 };
      case 'URGENT': return { r: 220, g: 38, b: 38 };
      default: return { r: 107, g: 114, b: 128 };
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Results</h2>
          <p className="text-gray-600 mb-6">{error || 'Assessment not found'}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const healthStatus = getHealthStatusText(assessment.health_status);

  // Build sections array dynamically from BUSINESS_ENGINES constant
  const sections = BUSINESS_ENGINES.map(engine => ({
    name: engine.name,
    score: (assessment as any)[`${engine.id}_score`] || 0,
    max: engine.maxScore,
    icon: engine.icon,
    colorClasses: engine.colorClasses,
    description: engine.description
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/assessment/history')}
                className="text-teal-600 hover:text-teal-700 font-medium text-sm"
              >
                View History
              </button>
              <button
                onClick={() => router.push('/assessment?new=true')}
                className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              >
                Retake Assessment
              </button>
              <button
                onClick={downloadPDF}
                className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Your Business Assessment Results
            </h1>
            <p className="text-gray-600">
              Completed on {new Date(assessment.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>

          {/* Overall Score Circle */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-8">
            <div className="relative">
              <svg className="w-64 h-64 transform -rotate-90">
                <circle
                  cx="128"
                  cy="128"
                  r="112"
                  stroke="currentColor"
                  strokeWidth="16"
                  fill="none"
                  className="text-gray-200"
                />
                <circle
                  cx="128"
                  cy="128"
                  r="112"
                  stroke="currentColor"
                  strokeWidth="16"
                  fill="none"
                  className={getTrafficLightColor(assessment.percentage)}
                  strokeDasharray={`${(assessment.percentage / 100) * 704} 704`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-6xl font-bold text-gray-900">{assessment.percentage}%</div>
              </div>
            </div>

            <div className="text-center md:text-left max-w-md">
              <div className={`inline-flex items-center px-4 py-2 rounded-full text-white font-semibold mb-4 ${getHealthStatusColor(assessment.health_status)}`}>
                <Award className="w-5 h-5 mr-2" />
                {healthStatus.title}
              </div>
              <p className="text-gray-700 text-lg leading-relaxed">
                {healthStatus.description}
              </p>
            </div>
          </div>
        </div>

        {/* 8 Business Engines Breakdown */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <TrendingUp className="w-6 h-6 mr-3 text-teal-600" />
            8 Business Engines
          </h2>

          <div className="space-y-6">
            {sections.map((section) => {
              const percentage = Math.round((section.score / section.max) * 100);
              const Icon = section.icon;

              return (
                <div key={section.name} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg ${section.colorClasses.bgLight}`}>
                        <Icon className={`w-6 h-6 ${section.colorClasses.text}`} />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{section.name}</h3>
                        <p className="text-gray-600 text-sm mt-1">{section.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{section.score}/{section.max}</div>
                      <div className={`text-sm font-medium ${getScoreColorClass(percentage)}`}>
                        {percentage}%
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${getScoreBgColorClass(percentage)}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    {percentage >= 80 ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    )}
                    <p>{getSectionRecommendations(section.name, section.score, section.max)[0]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-gradient-to-r from-teal-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Your Next Steps</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Review & Discuss</h3>
                <p className="text-teal-100">We'll review these results together in your next coaching session and identify quick wins.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Prioritize Actions</h3>
                <p className="text-teal-100">We'll create a focused 90-day action plan targeting your highest-impact opportunities.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Track Progress</h3>
                <p className="text-teal-100">Use the platform tools to implement changes and measure improvement over time.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/20">
            <button
              onClick={completeOnboardingAndContinue}
              disabled={completingOnboarding}
              className="w-full md:w-auto px-8 py-3 bg-white text-teal-600 rounded-lg font-semibold hover:bg-teal-50 transition-colors disabled:opacity-70"
            >
              {completingOnboarding ? 'Loading...' : 'Continue to Dashboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}