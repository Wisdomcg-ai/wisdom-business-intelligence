'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, ChevronLeft, Check, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BUSINESS_ENGINES, TOTAL_MAX_SCORE, getHealthStatus, mapSectionToEngineId } from '@/lib/assessment/constants';

interface Question {
  id: string;
  text: string;
  type: 'radio';
  options: { value: string; label: string; points: number }[];
  section: string;
  subsection?: string;
}

const questions: Question[] = [
  // ==========================================
  // ATTRACT ENGINE (4 questions, 40 points)
  // ==========================================

  {
    id: 'q1',
    text: 'How many qualified leads do you generate monthly?',
    type: 'radio',
    section: 'Attract Engine',
    subsection: 'Marketing & Lead Generation',
    options: [
      { value: 'under_20', label: 'Under 20 leads or don\'t track', points: 2 },
      { value: '20_50', label: '20-50 leads', points: 5 },
      { value: '50_100', label: '50-100 leads', points: 8 },
      { value: 'over_100', label: '100+ leads', points: 10 }
    ]
  },
  {
    id: 'q2',
    text: 'How many reliable marketing channels generate leads?',
    type: 'radio',
    section: 'Attract Engine',
    subsection: 'Marketing & Lead Generation',
    options: [
      { value: 'none', label: 'No consistent channels', points: 0 },
      { value: '1_2', label: '1-2 inconsistent sources', points: 3 },
      { value: '3_4', label: '3-4 regular sources', points: 7 },
      { value: '5_plus', label: '5+ systematic channels', points: 10 }
    ]
  },
  {
    id: 'q3',
    text: 'How sophisticated is your lead generation system?',
    type: 'radio',
    section: 'Attract Engine',
    subsection: 'Marketing & Lead Generation',
    options: [
      { value: 'adhoc', label: 'Ad hoc/inconsistent', points: 0 },
      { value: 'track_no_nurture', label: 'Track leads but no nurture system', points: 3 },
      { value: 'crm_nurture', label: 'Have CRM + email nurture sequences', points: 7 },
      { value: 'full_automation', label: 'Full marketing automation with attribution', points: 10 }
    ]
  },
  {
    id: 'q4',
    text: 'How clear is your target market and ideal customer?',
    type: 'radio',
    section: 'Attract Engine',
    subsection: 'Marketing & Lead Generation',
    options: [
      { value: 'anyone', label: 'Serve anyone who will pay', points: 0 },
      { value: 'general', label: 'General target market defined', points: 3 },
      { value: 'specific', label: 'Specific ideal customer profile', points: 7 },
      { value: 'laser_focused', label: 'Laser-focused with clear differentiation', points: 10 }
    ]
  },

  // ==========================================
  // CONVERT ENGINE (4 questions, 40 points)
  // ==========================================

  {
    id: 'q5',
    text: 'What\'s your lead-to-customer conversion rate?',
    type: 'radio',
    section: 'Convert Engine',
    subsection: 'Sales & Closing',
    options: [
      { value: 'under_15', label: 'Under 15% or don\'t track', points: 2 },
      { value: '15_25', label: '15-25%', points: 5 },
      { value: '25_40', label: '25-40%', points: 8 },
      { value: 'over_40', label: 'Over 40%', points: 10 }
    ]
  },
  {
    id: 'q6',
    text: 'How long is your average sales cycle?',
    type: 'radio',
    section: 'Convert Engine',
    subsection: 'Sales & Closing',
    options: [
      { value: 'dont_know', label: 'Don\'t know/varies wildly', points: 0 },
      { value: 'over_6months', label: 'Over 6 months (long, complex)', points: 3 },
      { value: '1_6months', label: '1-6 months (moderate)', points: 6 },
      { value: 'under_1month', label: 'Under 1 month (efficient)', points: 8 },
      { value: 'same_day', label: 'Same day/week (transactional)', points: 10 }
    ]
  },
  {
    id: 'q7',
    text: 'How effective is your sales process?',
    type: 'radio',
    section: 'Convert Engine',
    subsection: 'Sales & Closing',
    options: [
      { value: 'no_process', label: 'No formal sales process', points: 0 },
      { value: 'basic', label: 'Basic process, inconsistent follow-up', points: 3 },
      { value: 'documented', label: 'Documented process with objection handling', points: 7 },
      { value: 'optimized', label: 'Optimized process with upsells and tracking', points: 10 }
    ]
  },
  {
    id: 'q8',
    text: 'Do you have a sustainable competitive advantage?',
    type: 'radio',
    section: 'Convert Engine',
    subsection: 'Sales & Closing',
    options: [
      { value: 'price_only', label: 'Compete mainly on price', points: 0 },
      { value: 'some_differentiation', label: 'Some differentiation', points: 3 },
      { value: 'clear_value', label: 'Clear unique value proposition', points: 7 },
      { value: 'dominant', label: 'Dominant position with defensible moats', points: 10 }
    ]
  },

  // ==========================================
  // DELIVER ENGINE (4 questions, 40 points)
  // ==========================================

  {
    id: 'q9',
    text: 'What percentage of customers are delighted with your delivery?',
    type: 'radio',
    section: 'Deliver Engine',
    subsection: 'Client Experience & Results',
    options: [
      { value: 'under_60', label: 'Under 60% or don\'t know', points: 0 },
      { value: '60_75', label: '60-75%', points: 3 },
      { value: '75_90', label: '75-90%', points: 7 },
      { value: 'over_90', label: 'Over 90%', points: 10 }
    ]
  },
  {
    id: 'q10',
    text: 'How systematized is your customer experience?',
    type: 'radio',
    section: 'Deliver Engine',
    subsection: 'Client Experience & Results',
    options: [
      { value: 'wing_it', label: 'Wing it, reactive service', points: 0 },
      { value: 'basic_onboarding', label: 'Basic onboarding process', points: 3 },
      { value: 'mapped_journey', label: 'Mapped customer journey with touchpoints', points: 7 },
      { value: 'measure_improve', label: 'Systematically measure and improve NPS', points: 10 }
    ]
  },
  {
    id: 'q11',
    text: 'What percentage of your revenue comes from repeat customers?',
    type: 'radio',
    section: 'Deliver Engine',
    subsection: 'Client Experience & Results',
    options: [
      { value: 'dont_know', label: 'I don\'t know', points: 0 },
      { value: 'under_20', label: 'Under 20% (mostly transactional)', points: 2 },
      { value: '20_40', label: '20-40% (some repeat business)', points: 5 },
      { value: '40_60', label: '40-60% (good retention)', points: 8 },
      { value: 'over_60', label: 'Over 60% (strong loyalty)', points: 10 }
    ]
  },
  {
    id: 'q12',
    text: 'Do you systematically collect and act on customer feedback?',
    type: 'radio',
    section: 'Deliver Engine',
    subsection: 'Client Experience & Results',
    options: [
      { value: 'rarely', label: 'Rarely or never collect feedback', points: 0 },
      { value: 'occasional', label: 'Occasionally ask for feedback', points: 3 },
      { value: 'regular_some', label: 'Regular surveys, take some action', points: 7 },
      { value: 'systematic', label: 'Systematic NPS tracking with action plans', points: 10 }
    ]
  },

  // ==========================================
  // PEOPLE ENGINE (4 questions, 40 points)
  // ==========================================

  {
    id: 'q13',
    text: 'How effectively is your team structured and operating?',
    type: 'radio',
    section: 'People Engine',
    subsection: 'Team, Culture, Hiring',
    options: [
      { value: 'solo_struggling', label: 'Solo operator - struggling with capacity', points: 2 },
      { value: 'small_confusion', label: 'Small team - some role confusion', points: 4 },
      { value: 'clear_delegation', label: 'Clear roles with effective delegation', points: 7 },
      { value: 'well_structured', label: 'Well-structured with strong performance', points: 9 },
      { value: 'exceptional', label: 'Exceptional team with clear accountability', points: 10 }
    ]
  },
  {
    id: 'q14',
    text: 'How strong is your team culture?',
    type: 'radio',
    section: 'People Engine',
    subsection: 'Team, Culture, Hiring',
    options: [
      { value: 'struggling', label: 'Struggling with people issues', points: 0 },
      { value: 'adequate', label: 'Adequate team, developing culture', points: 3 },
      { value: 'good', label: 'Good team, positive culture', points: 7 },
      { value: 'exceptional', label: 'A-players with exceptional culture', points: 10 }
    ]
  },
  {
    id: 'q15',
    text: 'How strategic is your approach to talent?',
    type: 'radio',
    section: 'People Engine',
    subsection: 'Team, Culture, Hiring',
    options: [
      { value: 'reactive', label: 'Reactive hiring when desperate', points: 0 },
      { value: 'basic', label: 'Basic hiring process', points: 3 },
      { value: 'good', label: 'Good hiring with defined criteria', points: 7 },
      { value: 'systematic', label: 'Systematic recruitment of A-players', points: 10 }
    ]
  },
  {
    id: 'q16',
    text: 'How well do you develop and retain your team?',
    type: 'radio',
    section: 'People Engine',
    subsection: 'Team, Culture, Hiring',
    options: [
      { value: 'high_turnover', label: 'High turnover, no development programs', points: 0 },
      { value: 'some_training', label: 'Some training, moderate retention', points: 3 },
      { value: 'regular_training', label: 'Regular training, good retention', points: 7 },
      { value: 'systematic', label: 'Systematic development, great retention', points: 10 }
    ]
  },

  // ==========================================
  // SYSTEMS ENGINE (4 questions, 40 points)
  // ==========================================

  {
    id: 'q17',
    text: 'How comprehensive is your process documentation?',
    type: 'radio',
    section: 'Systems Engine',
    subsection: 'Operations, Process, Tech',
    options: [
      { value: 'in_heads', label: 'Most processes exist only in people\'s heads', points: 0 },
      { value: 'some_documented', label: 'Some processes documented', points: 3 },
      { value: 'most_documented', label: 'Most key processes documented', points: 7 },
      { value: 'all_optimized', label: 'All processes documented and optimized', points: 10 }
    ]
  },
  {
    id: 'q18',
    text: 'How systematic is your business execution?',
    type: 'radio',
    section: 'Systems Engine',
    subsection: 'Operations, Process, Tech',
    options: [
      { value: 'adhoc', label: 'Ad hoc, reactive approach', points: 0 },
      { value: 'some_systems', label: 'Some systems, inconsistent execution', points: 3 },
      { value: 'good_systems', label: 'Good systems, reliable execution', points: 7 },
      { value: 'exceptional', label: 'Exceptional systems and execution', points: 10 }
    ]
  },
  {
    id: 'q19',
    text: 'How effectively do you use technology and automation?',
    type: 'radio',
    section: 'Systems Engine',
    subsection: 'Operations, Process, Tech',
    options: [
      { value: 'minimal', label: 'Minimal tech, mostly manual processes', points: 0 },
      { value: 'basic', label: 'Basic tools, limited automation', points: 3 },
      { value: 'good', label: 'Good tech stack with some automation', points: 7 },
      { value: 'advanced', label: 'Advanced automation and AI integration', points: 10 }
    ]
  },
  {
    id: 'q20',
    text: 'How well do you track business performance with metrics?',
    type: 'radio',
    section: 'Systems Engine',
    subsection: 'Operations, Process, Tech',
    options: [
      { value: 'dont_track', label: 'Don\'t track metrics systematically', points: 0 },
      { value: 'monthly', label: 'Track basic metrics monthly', points: 3 },
      { value: 'weekly', label: 'Weekly dashboard review', points: 7 },
      { value: 'daily', label: 'Real-time dashboard reviewed daily', points: 10 }
    ]
  },

  // ==========================================
  // FINANCE ENGINE (3 questions, 30 points)
  // ==========================================

  {
    id: 'q21',
    text: 'How would you describe your cash flow situation?',
    type: 'radio',
    section: 'Finance Engine',
    subsection: 'Money, Metrics, Wealth',
    options: [
      { value: 'stressed', label: 'Constantly stressed about paying bills', points: 0 },
      { value: 'occasional_crunches', label: 'Occasional cash crunches, tight months', points: 3 },
      { value: 'stable', label: 'Generally stable, manageable fluctuations', points: 7 },
      { value: 'strong_reserves', label: 'Strong reserves, never worry about cash', points: 10 }
    ]
  },
  {
    id: 'q22',
    text: 'What\'s your revenue growth rate over the past 12 months?',
    type: 'radio',
    section: 'Finance Engine',
    subsection: 'Money, Metrics, Wealth',
    options: [
      { value: 'declining', label: 'Declining revenue', points: 0 },
      { value: 'flat', label: 'Flat or minimal growth (0-10%)', points: 3 },
      { value: 'moderate', label: 'Moderate growth (10-25%)', points: 6 },
      { value: 'strong', label: 'Strong growth (25-50%)', points: 8 },
      { value: 'rapid', label: 'Rapid growth (50%+)', points: 10 }
    ]
  },
  {
    id: 'q23',
    text: 'How sophisticated is your financial management?',
    type: 'radio',
    section: 'Finance Engine',
    subsection: 'Money, Metrics, Wealth',
    options: [
      { value: 'react_balance', label: 'React to bank balance, no forecasting', points: 0 },
      { value: 'track_basic', label: 'Track P&L monthly, basic budgeting', points: 3 },
      { value: 'forecast_variance', label: '13-week forecast, variance analysis', points: 7 },
      { value: 'rolling_profitability', label: 'Rolling forecasts, full financial visibility', points: 10 }
    ]
  },

  // ==========================================
  // LEADERSHIP ENGINE (3 questions, 30 points)
  // ==========================================

  {
    id: 'q24',
    text: 'How clear and compelling is your business vision?',
    type: 'radio',
    section: 'Leadership Engine',
    subsection: 'Vision, Strategy, You',
    options: [
      { value: 'very_unclear', label: 'Very unclear - no defined direction', points: 0 },
      { value: 'somewhat_clear', label: 'Somewhat clear - general idea only', points: 3 },
      { value: 'clear', label: 'Clear - team understands it', points: 7 },
      { value: 'crystal_clear', label: 'Crystal clear - guides all decisions', points: 10 }
    ]
  },
  {
    id: 'q25',
    text: 'How dependent is the business on you personally?',
    type: 'radio',
    section: 'Leadership Engine',
    subsection: 'Vision, Strategy, You',
    options: [
      { value: 'completely', label: 'Completely - stops without me', points: 0 },
      { value: 'very', label: 'Very - needs me for most decisions', points: 3 },
      { value: 'somewhat', label: 'Somewhat - can run for short periods', points: 7 },
      { value: 'minimal', label: 'Minimal - runs well without me for weeks', points: 10 }
    ]
  },
  {
    id: 'q26',
    text: 'Are you paying yourself a market-rate salary consistently?',
    type: 'radio',
    section: 'Leadership Engine',
    subsection: 'Vision, Strategy, You',
    options: [
      { value: 'no_rarely', label: 'No - rarely take money out', points: 0 },
      { value: 'sometimes', label: 'Sometimes - when cash flow allows', points: 3 },
      { value: 'yes_below', label: 'Yes - regular salary below market', points: 5 },
      { value: 'yes_full', label: 'Yes - full market-rate salary', points: 8 },
      { value: 'yes_plus_profit', label: 'Yes - salary plus profit distributions', points: 10 }
    ]
  },

  // ==========================================
  // TIME ENGINE (4 questions, 40 points)
  // ==========================================

  {
    id: 'q27',
    text: 'How many hours per week do you currently work?',
    type: 'radio',
    section: 'Time Engine',
    subsection: 'Freedom, Productivity, Leverage',
    options: [
      { value: '60_plus', label: '60+ hours per week', points: 0 },
      { value: '50_60', label: '50-60 hours per week', points: 3 },
      { value: '40_50', label: '40-50 hours per week', points: 7 },
      { value: 'under_40', label: 'Under 40 hours per week', points: 10 }
    ]
  },
  {
    id: 'q28',
    text: 'Can your business run successfully for 2+ weeks without you?',
    type: 'radio',
    section: 'Time Engine',
    subsection: 'Freedom, Productivity, Leverage',
    options: [
      { value: 'no_falls_apart', label: 'No - it falls apart without me', points: 0 },
      { value: 'barely', label: 'Barely - lots of issues arise', points: 3 },
      { value: 'mostly', label: 'Mostly - some check-ins needed', points: 7 },
      { value: 'yes_smoothly', label: 'Yes - runs smoothly without me', points: 10 }
    ]
  },
  {
    id: 'q29',
    text: 'What percentage of your time is working ON (strategy) vs IN (doing the work)?',
    type: 'radio',
    section: 'Time Engine',
    subsection: 'Freedom, Productivity, Leverage',
    options: [
      { value: '0_20_on', label: '0-20% ON strategy, 80-100% IN the work', points: 0 },
      { value: '20_40_on', label: '20-40% ON strategy, 60-80% IN the work', points: 4 },
      { value: '40_60_on', label: '40-60% ON strategy, 40-60% IN the work', points: 7 },
      { value: '60_plus_on', label: '60%+ ON strategy, less than 40% IN the work', points: 10 }
    ]
  },
  {
    id: 'q30',
    text: 'How predictable is your monthly revenue?',
    type: 'radio',
    section: 'Time Engine',
    subsection: 'Freedom, Productivity, Leverage',
    options: [
      { value: 'unpredictable', label: 'Completely unpredictable - varies wildly', points: 0 },
      { value: 'somewhat_50', label: 'Somewhat predictable - within 50%', points: 3 },
      { value: 'very_25', label: 'Very predictable - within 25%', points: 7 },
      { value: 'extremely_recurring', label: 'Extremely predictable - recurring revenue model', points: 10 }
    ]
  }
];

export default function AssessmentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading assessment...</p>
        </div>
      </div>
    }>
      <AssessmentContent />
    </Suspense>
  );
}

function AssessmentContent() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const isNewAssessment = searchParams?.get('new') === 'true';

  // Load saved draft and check for existing assessments
  useEffect(() => {
    async function initialize() {
      // If this is a new assessment (retake), just load draft and continue
      if (isNewAssessment) {
        const savedDraft = localStorage.getItem('assessment_draft');
        const savedIndex = localStorage.getItem('assessment_question_index');

        if (savedDraft) {
          try {
            const parsedAnswers = JSON.parse(savedDraft);
            setAnswers(parsedAnswers);
            if (savedIndex) {
              setCurrentQuestionIndex(parseInt(savedIndex));
            }
          } catch (e) {
            console.error('Error loading draft:', e);
          }
        }
        setIsLoading(false);
        return;
      }

      // Check for existing completed assessments - redirect if found
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: assessments } = await supabase
            .from('assessments')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1);

          if (assessments && assessments.length > 0) {
            // User has a completed assessment - redirect to results
            router.push(`/dashboard/assessment-results?id=${assessments[0].id}`);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking assessments:', err);
      }

      // No existing assessment - load any saved draft and show the form
      const savedDraft = localStorage.getItem('assessment_draft');
      const savedIndex = localStorage.getItem('assessment_question_index');

      if (savedDraft) {
        try {
          const parsedAnswers = JSON.parse(savedDraft);
          setAnswers(parsedAnswers);
          if (savedIndex) {
            setCurrentQuestionIndex(parseInt(savedIndex));
          }
        } catch (e) {
          console.error('Error loading draft:', e);
        }
      }

      setIsLoading(false);
    }

    initialize();
  }, [isNewAssessment, router]);

  // Save draft to localStorage whenever answers change
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      localStorage.setItem('assessment_draft', JSON.stringify(answers));
      localStorage.setItem('assessment_question_index', currentQuestionIndex.toString());
    }
  }, [answers, currentQuestionIndex]);

  // Protect against browser back/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(answers).length > 0 && Object.keys(answers).length < questions.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answers]);

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  const sections = BUSINESS_ENGINES.map(engine => engine.name);
  const currentSection = currentQuestion.section;
  const currentSectionIndex = sections.indexOf(currentSection);

  // Check if all questions are answered
  function areAllQuestionsAnswered(): boolean {
    return questions.every(q => answers[q.id]);
  }

  // Get unanswered questions count
  function getUnansweredCount(): number {
    return questions.filter(q => !answers[q.id]).length;
  }

  const goToNext = useCallback(() => {
    if (answers[currentQuestion.id] && currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  }, [answers, currentQuestion.id, currentQuestionIndex]);

  const goToPrevious = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  }, [currentQuestionIndex]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && answers[currentQuestion.id]) {
        if (currentQuestionIndex < questions.length - 1) {
          goToNext();
        } else if (areAllQuestionsAnswered()) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [currentQuestionIndex, answers, currentQuestion, goToNext]);

  function handleAnswer(value: string, points: number) {
    setAnswers({
      ...answers,
      [currentQuestion.id]: {
        value,
        points,
        question: currentQuestion.text
      }
    });
  }

  function isCurrentQuestionAnswered(): boolean {
    return !!answers[currentQuestion.id];
  }

  function handleExit() {
    setShowExitModal(true);
  }

  function confirmExit() {
    // Keep draft in localStorage for resume later
    router.push('/business-profile');
  }

  function clearDraftAndExit() {
    localStorage.removeItem('assessment_draft');
    localStorage.removeItem('assessment_question_index');
    router.push('/business-profile');
  }

  function calculateSectionScores() {
    // Initialize scores for all engines
    const sectionScores: Record<string, number> = {};
    BUSINESS_ENGINES.forEach(engine => {
      sectionScores[engine.id] = 0;
    });

    // Calculate scores
    Object.entries(answers).forEach(([questionId, answer]) => {
      const question = questions.find(q => q.id === questionId);

      if (question) {
        const points = answer.points || 0;
        const engineId = mapSectionToEngineId(question.section);

        if (engineId && sectionScores[engineId] !== undefined) {
          sectionScores[engineId] += points;
        }
      }
    });

    return sectionScores;
  }

  async function handleSubmit() {
    // Validate all questions are answered
    if (!areAllQuestionsAnswered()) {
      const unansweredCount = getUnansweredCount();
      setError(`Please answer all questions. ${unansweredCount} question${unansweredCount > 1 ? 's' : ''} remaining.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        setError('Please log in to save your assessment');
        setIsSubmitting(false);
        return;
      }

      // Use current user ID for the assessment
      const targetUserId = user.id;

      // Calculate scores
      const sectionScores = calculateSectionScores();
      const totalScore = Object.values(sectionScores).reduce((sum, score) => sum + score, 0);
      const percentage = Math.round((totalScore / TOTAL_MAX_SCORE) * 100);

      // Determine health status using shared function
      const healthStatus = getHealthStatus(percentage);

      // Build engine score data dynamically
      const engineScoreData: any = {
        user_id: targetUserId,
        answers: answers,
        total_score: Math.round(totalScore),
        percentage: percentage,
        health_status: healthStatus,
        total_max: TOTAL_MAX_SCORE,
        completed_at: new Date().toISOString(),
        status: 'completed'
      };

      // Add each engine score dynamically
      BUSINESS_ENGINES.forEach(engine => {
        engineScoreData[`${engine.id}_score`] = Math.round(sectionScores[engine.id] || 0);
        engineScoreData[`${engine.id}_max`] = engine.maxScore;
      });

      // Save to Supabase with 8 engine scores
      const { data: assessment, error: dbError } = await supabase
        .from('assessments')
        .insert(engineScoreData)
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        setError('Failed to save assessment: ' + dbError.message);
        setIsSubmitting(false);
        return;
      }

      console.log('✅ Assessment saved:', assessment.id);

      // Clear draft from localStorage
      localStorage.removeItem('assessment_draft');
      localStorage.removeItem('assessment_question_index');

      // Redirect to dashboard - middleware will now allow access
      router.push('/dashboard');

    } catch (error) {
      console.error('Error submitting assessment:', error);
      setError('Failed to save assessment. Please try again.');
      setIsSubmitting(false);
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading assessment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Business Assessment</h1>
              <p className="text-sm text-gray-600 mt-1">
                30 questions • 12-15 minutes
                {Object.keys(answers).length > 0 && (
                  <span className="ml-2 text-teal-600 font-medium">
                    • {Object.keys(answers).length}/30 answered
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/assessment/history')}
                className="text-teal-600 hover:text-teal-700 px-3 py-1 rounded-lg hover:bg-teal-50 text-sm font-medium"
              >
                View History
              </button>
              <button
                onClick={handleExit}
                className="text-gray-500 hover:text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-100"
              >
                Exit
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600">
                Section {currentSectionIndex + 1} of {sections.length}: <span className="font-medium">{currentSection}</span>
              </span>
              <span className="text-gray-900 font-medium">
                {currentQuestionIndex + 1} of {questions.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-teal-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-center text-xs text-gray-500 mt-1">
              <span>{Math.round(progress)}% Complete</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-teal-600 px-8 py-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/90 text-sm font-medium">
                {currentQuestion.subsection || currentSection}
              </span>
              <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm">
                {currentQuestionIndex + 1}/{questions.length}
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              {currentQuestion.text}
            </h2>
          </div>

          <div className="p-8">
            <div className="space-y-3">
              {currentQuestion.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleAnswer(option.value, option.points)}
                  className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 group ${
                    answers[currentQuestion.id]?.value === option.value
                      ? 'border-teal-500 bg-teal-50 shadow-lg transform scale-[1.02]'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <div className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center transition-all ${
                      answers[currentQuestion.id]?.value === option.value
                        ? 'border-teal-500 bg-teal-500'
                        : 'border-gray-400 group-hover:border-gray-500'
                    }`}>
                      {answers[currentQuestion.id]?.value === option.value && (
                        <div className="w-3 h-3 bg-white rounded-full" />
                      )}
                    </div>
                    <span className={`text-lg ${
                      answers[currentQuestion.id]?.value === option.value
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-700'
                    }`}>
                      {option.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-red-700">{error}</p>
              </div>
            )}
          </div>

          <div className="px-8 py-6 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <button
                onClick={goToPrevious}
                disabled={currentQuestionIndex === 0}
                className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all ${
                  currentQuestionIndex === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:shadow'
                }`}
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Previous
              </button>

              <span className="text-sm text-gray-500">
                Press <kbd className="px-2 py-1 bg-white rounded border border-gray-300 text-xs">Enter</kbd> to continue
              </span>

              {currentQuestionIndex === questions.length - 1 ? (
                <div className="flex flex-col items-end gap-2">
                  {!areAllQuestionsAnswered() && (
                    <span className="text-sm text-orange-600 font-medium">
                      {getUnansweredCount()} question{getUnansweredCount() > 1 ? 's' : ''} remaining
                    </span>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={!areAllQuestionsAnswered() || isSubmitting}
                    className={`flex items-center px-8 py-3 rounded-lg font-medium transition-all ${
                      !areAllQuestionsAnswered() || isSubmitting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-teal-600 text-white hover:bg-teal-700 hover:shadow-lg transform hover:-translate-y-0.5'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Complete Assessment
                        <Check className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={goToNext}
                  disabled={!isCurrentQuestionAnswered()}
                  className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all ${
                    !isCurrentQuestionAnswered()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-teal-600 text-white hover:bg-teal-700 hover:shadow-lg transform hover:-translate-y-0.5'
                  }`}
                >
                  Next
                  <ChevronRight className="w-5 h-5 ml-2" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Exit Confirmation Modal */}
      {showExitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Exit Assessment?
                </h3>
                <p className="text-gray-600">
                  {Object.keys(answers).length > 0
                    ? `You've answered ${Object.keys(answers).length} out of 30 questions. Your progress will be saved and you can continue later.`
                    : 'Are you sure you want to exit?'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowExitModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Continue Assessment
              </button>
              <button
                onClick={confirmExit}
                className="flex-1 px-4 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
              >
                Save & Exit
              </button>
            </div>

            {Object.keys(answers).length > 0 && (
              <button
                onClick={clearDraftAndExit}
                className="w-full mt-3 px-4 py-2 text-red-600 text-sm hover:bg-red-50 rounded-lg transition-colors"
              >
                Discard Progress & Exit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}