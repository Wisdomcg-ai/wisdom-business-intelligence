'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Download,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  CheckCircle,
  Zap,
  Award,
  BarChart3,
  RefreshCw,
  Clock,
  ChevronRight,
  Minus,
  Sparkles
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BUSINESS_ENGINES, TOTAL_MAX_SCORE } from '@/lib/assessment/constants';
import PageHeader from '@/components/ui/PageHeader';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { useCoachView } from '@/hooks/useCoachView';

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

export default function AssessmentResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-navy-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your results...</p>
        </div>
      </div>
    }>
      <AssessmentResultsContent />
    </Suspense>
  );
}

// Radar Chart Component
function RadarChart({ sections, previousSections }: {
  sections: { name: string; score: number; max: number }[];
  previousSections?: { name: string; score: number; max: number }[] | null;
}) {
  // Balanced sizing: displaySize/viewBox ratio controls scale
  // overflow:visible allows labels to extend beyond SVG bounds
  const size = 500;
  const center = size / 2;
  const radius = 165; // Larger chart - labels can overflow
  const levels = 5;

  const angleStep = (2 * Math.PI) / sections.length;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle)
    };
  };

  const currentPoints = sections.map((s, i) =>
    getPoint(i, (s.score / s.max) * 100)
  );

  const previousPoints = previousSections?.map((s, i) =>
    getPoint(i, (s.score / s.max) * 100)
  );

  const currentPath = currentPoints.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ') + ' Z';

  const previousPath = previousPoints?.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ') + ' Z';

  // Helper to get text anchor based on position
  const getTextAnchor = (angle: number): 'start' | 'middle' | 'end' => {
    const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (normalizedAngle > Math.PI * 0.25 && normalizedAngle < Math.PI * 0.75) return 'start';
    if (normalizedAngle > Math.PI * 1.25 && normalizedAngle < Math.PI * 1.75) return 'end';
    return 'middle';
  };

  // Display size controls how big it renders, viewBox keeps label room
  const displaySize = 460;

  return (
    <svg width={displaySize} height={displaySize} viewBox={`0 0 ${size} ${size}`} className="mx-auto max-w-full" style={{ overflow: 'visible' }}>
      {/* Background levels */}
      {Array.from({ length: levels }).map((_, level) => {
        const levelRadius = ((level + 1) / levels) * radius;
        const levelPoints = sections.map((_, i) => {
          const angle = angleStep * i - Math.PI / 2;
          return {
            x: center + levelRadius * Math.cos(angle),
            y: center + levelRadius * Math.sin(angle)
          };
        });
        const path = levelPoints.map((p, i) =>
          `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
        ).join(' ') + ' Z';

        return (
          <path
            key={level}
            d={path}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="1"
            className="transition-all duration-500"
          />
        );
      })}

      {/* Axis lines */}
      {sections.map((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const endX = center + radius * Math.cos(angle);
        const endY = center + radius * Math.sin(angle);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={endX}
            y2={endY}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        );
      })}

      {/* Previous assessment area (if exists) */}
      {previousPath && (
        <path
          d={previousPath}
          fill="rgba(156, 163, 175, 0.2)"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="transition-all duration-1000"
        />
      )}

      {/* Current assessment area */}
      <path
        d={currentPath}
        fill="rgba(245, 130, 31, 0.2)"
        stroke="#F5821F"
        strokeWidth="3"
        className="transition-all duration-1000 animate-draw-path"
        style={{
          strokeDasharray: 1000,
          strokeDashoffset: 0,
          animation: 'drawPath 1.5s ease-out forwards'
        }}
      />

      {/* Data points */}
      {currentPoints.map((point, i) => (
        <circle
          key={i}
          cx={point.x}
          cy={point.y}
          r="6"
          fill="#F5821F"
          stroke="white"
          strokeWidth="2"
          className="transition-all duration-500"
          style={{
            animation: `popIn 0.3s ease-out ${i * 0.1}s forwards`,
            opacity: 0,
            transform: 'scale(0)'
          }}
        />
      ))}

      {/* Labels */}
      {sections.map((section, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const labelRadius = radius + 55; // Labels at ~150px from center in viewBox
        const x = center + labelRadius * Math.cos(angle);
        const y = center + labelRadius * Math.sin(angle);
        const percentage = Math.round((section.score / section.max) * 100);
        const textAnchor = getTextAnchor(angle + Math.PI / 2);

        // Adjust x position based on text anchor for better label visibility
        const xOffset = textAnchor === 'start' ? 5 : textAnchor === 'end' ? -5 : 0;

        return (
          <g key={section.name}>
            <text
              x={x + xOffset}
              y={y - 6}
              textAnchor={textAnchor}
              className="text-[15px] font-semibold fill-gray-800"
            >
              {section.name}
            </text>
            <text
              x={x + xOffset}
              y={y + 12}
              textAnchor={textAnchor}
              className="text-[15px] font-bold fill-brand-orange"
            >
              {percentage}%
            </text>
          </g>
        );
      })}

      <style jsx>{`
        @keyframes drawPath {
          from { stroke-dashoffset: 1000; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </svg>
  );
}

// Animated Counter Component
function AnimatedCounter({ value, duration = 1500 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    const incrementTime = duration / end;

    const timer = setInterval(() => {
      start += 1;
      setCount(start);
      if (start >= end) clearInterval(timer);
    }, incrementTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <span>{count}</span>;
}

function AssessmentResultsContent() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [previousAssessment, setPreviousAssessment] = useState<Assessment | null>(null);
  const [businessProfile, setBusinessProfile] = useState<{ annual_revenue: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showContent, setShowContent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const assessmentId = searchParams?.get('id');
  const { activeBusiness } = useBusinessContext();
  const { getPath } = useCoachView();

  useEffect(() => {
    if (assessmentId) {
      loadAssessment();
    } else {
      loadLatestAssessment();
    }
  }, [assessmentId]);

  useEffect(() => {
    if (assessment) {
      // Trigger animations after data loads
      setTimeout(() => setShowContent(true), 100);
    }
  }, [assessment]);

  async function loadLatestAssessment() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push(getPath('/auth/login'));
        return;
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id;

      const { data: assessments, error: dbError } = await supabase
        .from('assessments')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (dbError || !assessments || assessments.length === 0) {
        router.push(getPath('/assessment'));
        return;
      }

      router.replace(getPath(`/dashboard/assessment-results?id=${assessments[0].id}`));
    } catch (error) {
      console.error('Error loading latest assessment:', error);
      router.push(getPath('/dashboard'));
    }
  }

  async function loadAssessment() {
    try {
      const supabase = createClient();

      // Load current assessment
      const { data, error: dbError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        setError('Failed to load assessment results');
        setLoading(false);
        return;
      }

      setAssessment(data);

      // Load previous assessment and business profile for comparison
      if (data) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Use activeBusiness ownerId if viewing as coach, otherwise current user
          const targetUserId = activeBusiness?.ownerId || user.id;

          // Load previous assessment
          const { data: prevAssessments } = await supabase
            .from('assessments')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('status', 'completed')
            .lt('created_at', data.created_at)
            .order('created_at', { ascending: false })
            .limit(1);

          if (prevAssessments && prevAssessments.length > 0) {
            setPreviousAssessment(prevAssessments[0]);
          }

          // Load business profile for revenue stage comparison
          const { data: profile } = await supabase
            .from('business_profiles')
            .select('annual_revenue')
            .eq('user_id', targetUserId)
            .single();

          if (profile) {
            setBusinessProfile(profile);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to load assessment results');
    } finally {
      setLoading(false);
    }
  }

  // Get badge styles based on the unified stage system
  function getStageBadgeStyles(stageId: string): string {
    switch (stageId) {
      case 'mastery': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'scale': return 'bg-green-100 text-green-700 border-green-200';
      case 'growth': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'traction': return 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200';
      case 'foundation': return 'bg-brand-navy-100 text-brand-navy-700 border-brand-navy-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  }

  // Legacy function for backwards compatibility
  function getHealthStatusBadgeStyles(status: string): string {
    switch (status?.toUpperCase()) {
      case 'THRIVING': return getStageBadgeStyles('mastery');
      case 'STRONG': return getStageBadgeStyles('scale');
      case 'STABLE': return getStageBadgeStyles('growth');
      case 'BUILDING': return getStageBadgeStyles('traction');
      case 'STRUGGLING': return getStageBadgeStyles('traction');
      case 'URGENT': return getStageBadgeStyles('foundation');
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  }

  function getScoreRingColor(percentage: number): string {
    if (percentage >= 80) return 'stroke-green-500';
    if (percentage >= 60) return 'stroke-brand-orange';
    if (percentage >= 40) return 'stroke-yellow-500';
    return 'stroke-red-500';
  }

  // Get operations stage from assessment percentage (unified with roadmap stages)
  function getOperationsStage(percentage: number): { id: string; title: string; description: string; level: number } {
    if (percentage >= 85) {
      return {
        id: 'mastery',
        title: 'Mastery',
        description: 'Your business operations are world-class. Focus on optimization, innovation, and helping others reach this level.',
        level: 5
      };
    } else if (percentage >= 70) {
      return {
        id: 'scale',
        title: 'Scale',
        description: 'Strong operational foundation in place. Your systems can support significant growth and team expansion.',
        level: 4
      };
    } else if (percentage >= 50) {
      return {
        id: 'growth',
        title: 'Growth',
        description: 'Good progress across your engines. Focus on strengthening weaker areas to unlock your next level.',
        level: 3
      };
    } else if (percentage >= 30) {
      return {
        id: 'traction',
        title: 'Traction',
        description: 'Building momentum! You have foundations in place - now systematize and strengthen to support growth.',
        level: 2
      };
    } else {
      return {
        id: 'foundation',
        title: 'Foundation',
        description: 'You\'ve identified key areas to build. Focus on 2-3 high-impact engines to create momentum.',
        level: 1
      };
    }
  }

  // Get revenue stage from annual revenue (matches roadmap stages)
  function getRevenueStage(annualRevenue: number): { id: string; title: string; range: string; level: number } {
    if (annualRevenue >= 10000000) {
      return { id: 'mastery', title: 'Mastery', range: '$10M+', level: 5 };
    } else if (annualRevenue >= 5000000) {
      return { id: 'scale', title: 'Scale', range: '$5M-$10M', level: 4 };
    } else if (annualRevenue >= 1000000) {
      return { id: 'growth', title: 'Growth', range: '$1M-$5M', level: 3 };
    } else if (annualRevenue >= 500000) {
      return { id: 'traction', title: 'Traction', range: '$500K-$1M', level: 2 };
    } else {
      return { id: 'foundation', title: 'Foundation', range: '$0-$500K', level: 1 };
    }
  }

  // Compare operations score to revenue stage and provide coaching insight
  function getStageGapAnalysis(operationsLevel: number, revenueLevel: number): { type: 'ahead' | 'behind' | 'aligned'; message: string; recommendation: string } {
    const gap = operationsLevel - revenueLevel;

    if (gap >= 1) {
      return {
        type: 'ahead',
        message: 'Your operations are ahead of your revenue',
        recommendation: 'Great news! Your systems can support growth. Focus on revenue-generating activities and marketing to unlock your next level.'
      };
    } else if (gap <= -1) {
      return {
        type: 'behind',
        message: 'Your revenue has outpaced your operations',
        recommendation: 'Priority: Strengthen your foundations before pushing for more growth. Complete the builds in your current roadmap stage.'
      };
    } else {
      return {
        type: 'aligned',
        message: 'Your operations match your revenue stage',
        recommendation: 'You\'re on track! Continue building both your systems and revenue together.'
      };
    }
  }

  // Legacy function for backwards compatibility with health_status field
  function getHealthStatusText(status: string): { title: string; description: string } {
    switch (status?.toUpperCase()) {
      case 'THRIVING':
        return getOperationsStage(90);
      case 'STRONG':
        return getOperationsStage(75);
      case 'STABLE':
        return getOperationsStage(60);
      case 'BUILDING':
        return getOperationsStage(45);
      case 'STRUGGLING':
        return getOperationsStage(35);
      case 'URGENT':
        return getOperationsStage(15);
      default:
        return { title: 'Unknown', description: 'Assessment status not available' };
    }
  }

  function getSectionRecommendation(percentage: number): { text: string; type: 'success' | 'warning' | 'critical' } {
    if (percentage >= 80) {
      return { text: 'Excellent performance. Maintain this strength and look for optimization opportunities.', type: 'success' };
    } else if (percentage >= 60) {
      return { text: 'Good progress. Focus on refining and optimizing these areas.', type: 'warning' };
    } else if (percentage >= 40) {
      return { text: 'Priority improvement area. Create a focused action plan for this section.', type: 'warning' };
    } else {
      return { text: 'Critical gap identified. This should be a primary focus area.', type: 'critical' };
    }
  }

  function getTrend(current: number, previous: number | undefined): { direction: 'up' | 'down' | 'same'; value: number } {
    if (previous === undefined) return { direction: 'same', value: 0 };
    const diff = current - previous;
    if (diff > 0) return { direction: 'up', value: diff };
    if (diff < 0) return { direction: 'down', value: Math.abs(diff) };
    return { direction: 'same', value: 0 };
  }

  function downloadPDF() {
    if (!assessment) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Header
    doc.setFillColor(23, 34, 56);
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

    doc.setTextColor(0, 0, 0);
    let yPos = 50;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Overall Business Health', 14, yPos);

    yPos += 10;
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(14, yPos, pageWidth - 28, 25, 3, 3, 'F');

    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 130, 31);
    doc.text(`${assessment.percentage}%`, 30, yPos + 17);

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`${assessment.total_score}/${TOTAL_MAX_SCORE} points`, 70, yPos + 12);

    const pdfOperationsStage = getOperationsStage(assessment.percentage);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 130, 31);
    doc.text(pdfOperationsStage.title.toUpperCase(), 70, yPos + 21);

    doc.setTextColor(0, 0, 0);
    yPos += 35;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('8 Business Engines', 14, yPos);
    yPos += 5;

    const sections = BUSINESS_ENGINES.map(engine => ({
      name: engine.name,
      score: (assessment as any)[`${engine.id}_score`] || 0,
      max: engine.maxScore,
      description: engine.description
    }));

    const tableData = sections.map(section => {
      const percentage = Math.round((section.score / section.max) * 100);
      const status = percentage >= 80 ? 'Excellent' : percentage >= 60 ? 'Good' : percentage >= 40 ? 'Needs Work' : 'Critical';
      return [section.name, `${section.score}/${section.max}`, `${percentage}%`, status];
    });

    autoTable(doc, {
      startY: yPos + 5,
      head: [['Engine', 'Score', 'Percentage', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [23, 34, 56],
        textColor: [255, 255, 255],
        fontSize: 11,
        fontStyle: 'bold'
      },
      bodyStyles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 35, halign: 'center' },
        3: { cellWidth: 40, halign: 'center' }
      }
    });

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Generated by WisdomBi Business Coaching Platform', pageWidth / 2, pageHeight - 10, { align: 'center' });

    doc.save(`Business-Assessment-${dateStr.replace(/\s/g, '-')}.pdf`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-navy-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="min-h-screen bg-brand-navy-50 flex items-center justify-center">
        <div className="text-center max-w-md bg-white rounded-2xl p-8 shadow-lg">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Results</h2>
          <p className="text-gray-600 mb-6">{error || 'Assessment not found'}</p>
          <button
            onClick={() => router.push(getPath('/dashboard'))}
            className="px-6 py-3 bg-brand-orange text-white rounded-xl font-semibold hover:bg-brand-orange-600 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Use the unified stage system based on actual percentage
  const operationsStage = getOperationsStage(assessment.percentage);
  const revenueStage = businessProfile ? getRevenueStage(businessProfile.annual_revenue) : null;
  const gapAnalysis = revenueStage ? getStageGapAnalysis(operationsStage.level, revenueStage.level) : null;

  const sections = BUSINESS_ENGINES.map(engine => ({
    name: engine.name,
    score: (assessment as any)[`${engine.id}_score`] || 0,
    max: engine.maxScore,
    icon: engine.icon,
    colorClasses: engine.colorClasses,
    description: engine.description,
    longDescription: engine.longDescription
  }));

  const previousSections = previousAssessment ? BUSINESS_ENGINES.map(engine => ({
    name: engine.name,
    score: (previousAssessment as any)[`${engine.id}_score`] || 0,
    max: engine.maxScore
  })) : null;

  const topStrengths = [...sections].sort((a, b) => (b.score / b.max) - (a.score / a.max)).slice(0, 3);
  const topOpportunities = [...sections].sort((a, b) => (a.score / a.max) - (b.score / b.max)).slice(0, 3);

  const overallTrend = getTrend(assessment.percentage, previousAssessment?.percentage);

  return (
    <div className="min-h-screen bg-brand-navy-50">
      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slide-up { animation: slideUp 0.6s ease-out forwards; }
        .animate-scale-in { animation: scaleIn 0.5s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
      `}</style>

      <PageHeader
        variant="banner"
        title="Assessment Results"
        subtitle={`Completed ${new Date(assessment.created_at).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })}`}
        icon={BarChart3}
        backLink={{ href: getPath('/dashboard'), label: 'Back to Dashboard' }}
        badge={previousAssessment ? 'vs. Previous' : undefined}
        badgeColor="navy"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(getPath('/assessment/history'))}
              className="flex items-center gap-2 px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              <Clock className="w-4 h-4" />
              History
            </button>
            <button
              onClick={() => router.push(getPath('/assessment?new=true'))}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retake Assessment
            </button>
            <button
              onClick={downloadPDF}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-orange text-white rounded-xl hover:bg-brand-orange-600 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        }
      />

      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Top Stats Row */}
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 ${showContent ? 'animate-slide-up' : 'opacity-0'}`}>
          {/* Overall Score Card */}
          <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center mb-4">
                <svg className="w-44 h-44 transform -rotate-90">
                  <circle
                    cx="88"
                    cy="88"
                    r="76"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-gray-100"
                  />
                  <circle
                    cx="88"
                    cy="88"
                    r="76"
                    strokeWidth="12"
                    fill="none"
                    className={`${getScoreRingColor(assessment.percentage)} transition-all duration-1000`}
                    strokeDasharray={`${showContent ? (assessment.percentage / 100) * 478 : 0} 478`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 1.5s ease-out' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-gray-900">
                    {showContent ? <AnimatedCounter value={assessment.percentage} /> : 0}%
                  </div>
                  <div className="text-sm text-gray-500">Overall Score</div>
                </div>
              </div>

              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-semibold ${getStageBadgeStyles(operationsStage.id)}`}>
                <Award className="w-4 h-4" />
                {operationsStage.title}
              </div>

              {/* Trend Indicator */}
              {previousAssessment && (
                <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                  overallTrend.direction === 'up' ? 'bg-green-50 text-green-700' :
                  overallTrend.direction === 'down' ? 'bg-red-50 text-red-700' :
                  'bg-gray-50 text-gray-600'
                }`}>
                  {overallTrend.direction === 'up' && <TrendingUp className="w-4 h-4" />}
                  {overallTrend.direction === 'down' && <TrendingDown className="w-4 h-4" />}
                  {overallTrend.direction === 'same' && <Minus className="w-4 h-4" />}
                  {overallTrend.direction === 'up' && `+${overallTrend.value}% from last`}
                  {overallTrend.direction === 'down' && `-${overallTrend.value}% from last`}
                  {overallTrend.direction === 'same' && 'No change'}
                </div>
              )}

              <p className="text-sm text-gray-600 mt-4 leading-relaxed">
                {operationsStage.description}
              </p>

              {/* Gap Indicator - Revenue vs Operations */}
              {gapAnalysis && revenueStage && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className={`rounded-lg p-3 text-left ${
                    gapAnalysis.type === 'ahead' ? 'bg-green-50 border border-green-200' :
                    gapAnalysis.type === 'behind' ? 'bg-amber-50 border border-amber-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getStageBadgeStyles(operationsStage.id)}`}>
                          Operations: {operationsStage.title}
                        </span>
                        <span className="text-gray-400">vs</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getStageBadgeStyles(revenueStage.id)}`}>
                          Revenue: {revenueStage.title}
                        </span>
                      </div>
                    </div>
                    <p className={`text-xs font-medium mb-1 ${
                      gapAnalysis.type === 'ahead' ? 'text-green-700' :
                      gapAnalysis.type === 'behind' ? 'text-amber-700' :
                      'text-blue-700'
                    }`}>
                      {gapAnalysis.message}
                    </p>
                    <p className={`text-xs leading-relaxed ${
                      gapAnalysis.type === 'ahead' ? 'text-green-600' :
                      gapAnalysis.type === 'behind' ? 'text-amber-600' :
                      'text-blue-600'
                    }`}>
                      {gapAnalysis.recommendation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Radar Chart */}
          <div className={`lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${showContent ? 'animate-scale-in delay-200' : 'opacity-0'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="font-semibold text-gray-900">Performance Overview</h3>
              </div>
              {previousAssessment && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-brand-orange"></div>
                    <span className="text-gray-600">Current</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-dashed border-gray-400"></div>
                    <span className="text-gray-600">Previous</span>
                  </div>
                </div>
              )}
            </div>
            <RadarChart sections={sections} previousSections={previousSections} />
          </div>
        </div>

        {/* Strengths & Opportunities Row */}
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 ${showContent ? 'animate-slide-up delay-300' : 'opacity-0'}`}>
          {/* Top Strengths */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Top Strengths</h3>
            </div>
            <div className="space-y-3">
              {topStrengths.map((section) => {
                const percentage = Math.round((section.score / section.max) * 100);
                const Icon = section.icon;
                const prevSection = previousSections?.find(s => s.name === section.name);
                const trend = getTrend(section.score, prevSection?.score);

                return (
                  <div key={section.name} className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${section.colorClasses.bgLight}`}>
                        <Icon className={`w-4 h-4 ${section.colorClasses.text}`} />
                      </div>
                      <span className="font-medium text-gray-900">{section.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {trend.direction !== 'same' && (
                        <span className={`text-xs ${trend.direction === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                          {trend.direction === 'up' ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                        </span>
                      )}
                      <span className="font-bold text-green-600">{percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Opportunities */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                <Target className="w-4 h-4 text-brand-orange" />
              </div>
              <h3 className="font-semibold text-gray-900">Focus Areas</h3>
            </div>
            <div className="space-y-3">
              {topOpportunities.map((section) => {
                const percentage = Math.round((section.score / section.max) * 100);
                const Icon = section.icon;
                const prevSection = previousSections?.find(s => s.name === section.name);
                const trend = getTrend(section.score, prevSection?.score);

                return (
                  <div key={section.name} className="flex items-center justify-between p-3 bg-brand-orange-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${section.colorClasses.bgLight}`}>
                        <Icon className={`w-4 h-4 ${section.colorClasses.text}`} />
                      </div>
                      <span className="font-medium text-gray-900">{section.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {trend.direction !== 'same' && (
                        <span className={`text-xs ${trend.direction === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                          {trend.direction === 'up' ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                        </span>
                      )}
                      <span className="font-bold text-brand-orange">{percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 8 Business Engines Breakdown */}
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8 ${showContent ? 'animate-slide-up delay-400' : 'opacity-0'}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-navy rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">8 Business Engines</h2>
                <p className="text-sm text-gray-500">Detailed breakdown of each area</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section, index) => {
              const percentage = Math.round((section.score / section.max) * 100);
              const Icon = section.icon;
              const recommendation = getSectionRecommendation(percentage);
              const prevSection = previousSections?.find(s => s.name === section.name);
              const prevPercentage = prevSection ? Math.round((prevSection.score / prevSection.max) * 100) : undefined;
              const trend = getTrend(percentage, prevPercentage);

              return (
                <div
                  key={section.name}
                  className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all hover:border-brand-orange-200"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${section.colorClasses.bgLight}`}>
                        <Icon className={`w-5 h-5 ${section.colorClasses.text}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{section.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <div className="text-xl font-bold text-gray-900">{percentage}%</div>
                        {trend.direction !== 'same' && (
                          <div className={`flex items-center gap-0.5 text-xs font-medium ${
                            trend.direction === 'up' ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {trend.direction === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {trend.value}%
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Engine explanation */}
                  <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                    {section.longDescription}
                  </p>

                  <div className="mb-3 relative">
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      {/* Previous score indicator */}
                      {prevPercentage !== undefined && (
                        <div
                          className="absolute h-2.5 w-1 bg-gray-400 rounded-full z-10"
                          style={{ left: `${prevPercentage}%`, transform: 'translateX(-50%)' }}
                          title={`Previous: ${prevPercentage}%`}
                        />
                      )}
                      <div
                        className={`h-2.5 rounded-full transition-all duration-1000 ${
                          percentage >= 80 ? 'bg-green-500' :
                          percentage >= 60 ? 'bg-brand-orange' :
                          percentage >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: showContent ? `${percentage}%` : '0%' }}
                      />
                    </div>
                  </div>

                  <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${
                    recommendation.type === 'success' ? 'bg-green-50 text-green-700' :
                    recommendation.type === 'critical' ? 'bg-red-50 text-red-700' :
                    'bg-brand-orange-50 text-brand-orange-700'
                  }`}>
                    {recommendation.type === 'success' ? (
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    )}
                    <p>{recommendation.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Return to Dashboard */}
        <div className={`flex justify-center ${showContent ? 'animate-slide-up delay-500' : 'opacity-0'}`}>
          <button
            onClick={() => router.push(getPath('/dashboard'))}
            className="flex items-center gap-2 px-8 py-4 bg-brand-navy text-white rounded-xl font-semibold hover:bg-brand-navy-800 transition-colors shadow-lg"
          >
            Return to Dashboard
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
