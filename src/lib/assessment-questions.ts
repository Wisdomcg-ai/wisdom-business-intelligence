// src/lib/assessment-questions.ts

export type QuestionType = 'single-choice' | 'multi-choice' | 'yes-no' | 'text' | 'number';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  points?: number;
  section: string;
  subsection?: string;
}

export interface Section {
  id: string;
  title: string;
  subtitle: string;
  questions: Question[];
  maxPoints: number;
}

export const assessmentSections: Section[] = [
  {
    id: 'foundation',
    title: 'SECTION 1: BUSINESS FOUNDATION',
    subtitle: 'Understanding your current position and motivation',
    maxPoints: 40,
    questions: [
      {
        id: 'q1',
        text: "What's your current annual revenue?",
        type: 'single-choice',
        section: 'foundation',
        points: 10,
        options: [
          'Under $250K (Foundation Stage)',
          '$250K - $1M (Traction Stage)',
          '$1M - $3M (Scaling Stage)',
          '$3M - $5M (Optimization Stage)',
          '$5M - $10M (Leadership Stage)',
          '$10M+ (Mastery Stage)'
        ]
      },
      {
        id: 'q2',
        text: "What's your current profit margin?",
        type: 'single-choice',
        section: 'foundation',
        points: 10,
        options: [
          'Losing money',
          'Breaking even (0-5%)',
          'Small profit (5-10%)',
          'Healthy profit (10-15%)',
          'Strong profit (15-20%)',
          'Exceptional profit (20%+)'
        ]
      },
      {
        id: 'q3',
        text: 'Are you paying yourself a market-rate salary consistently?',
        type: 'single-choice',
        section: 'foundation',
        points: 5,
        options: [
          'No - rarely take money out',
          'Sometimes - when cash flow allows',
          'Yes - regular salary below market',
          'Yes - full market-rate salary',
          'Yes - salary plus profit distributions'
        ]
      },
      {
        id: 'q4',
        text: 'How many people work in your business?',
        type: 'single-choice',
        section: 'foundation',
        points: 0,
        options: [
          'Just me',
          '2-5 people',
          '6-15 people',
          '16-50 people',
          '50+ people'
        ]
      },
      {
        id: 'q5',
        text: 'How dependent is the business on you personally?',
        type: 'single-choice',
        section: 'foundation',
        points: 5,
        options: [
          'Completely - stops without me',
          'Very - needs me for most decisions',
          'Somewhat - can run for short periods',
          'Minimal - runs well without me'
        ]
      },
      {
        id: 'q6',
        text: 'How predictable is your monthly revenue?',
        type: 'single-choice',
        section: 'foundation',
        points: 10,
        options: [
          'Completely unpredictable - varies wildly',
          'Somewhat predictable - within 50%',
          'Very predictable - within 25%',
          'Extremely predictable - recurring revenue'
        ]
      }
    ]
  },
  {
    id: 'strategic-wheel',
    title: 'SECTION 2: STRATEGIC WHEEL',
    subtitle: 'The 6 components that drive business success',
    maxPoints: 60,
    questions: [
      {
        id: 'q7',
        text: 'How clear and compelling is your business vision?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'Vision & Purpose',
        points: 5,
        options: [
          'Very unclear - no defined direction',
          'Somewhat clear - general idea',
          'Clear - team understands it',
          'Crystal clear - guides all decisions'
        ]
      },
      {
        id: 'q8',
        text: 'Does your team understand and believe in your purpose?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'Vision & Purpose',
        points: 5,
        options: [
          'No understanding or buy-in',
          'Some understanding, limited buy-in',
          'Good understanding and buy-in',
          'Complete alignment and passion'
        ]
      },
      {
        id: 'q9',
        text: 'How well-defined is your target market and positioning?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'Strategy & Market',
        points: 4,
        options: [
          'Serve anyone who will pay',
          'General target market defined',
          'Specific ideal customer profile',
          'Laser-focused with clear differentiation'
        ]
      },
      {
        id: 'q10',
        text: 'Do you have a sustainable competitive advantage?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'Strategy & Market',
        points: 3,
        options: [
          'Compete mainly on price',
          'Some differentiation',
          'Clear unique value proposition',
          'Dominant market position'
        ]
      },
      {
        id: 'q11',
        text: 'How strong is your team and culture?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'People & Culture',
        points: 5,
        options: [
          'Struggling with people issues',
          'Adequate team, developing culture',
          'Good team, positive culture',
          'A-players with exceptional culture'
        ]
      },
      {
        id: 'q12',
        text: 'How systematic is your business execution?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'Systems & Execution',
        points: 5,
        options: [
          'Ad hoc, reactive approach',
          'Some systems, inconsistent execution',
          'Good systems, reliable execution',
          'Exceptional systems and execution'
        ]
      },
      {
        id: 'q13',
        text: 'How well do you track business performance?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'Money & Metrics',
        points: 5,
        options: [
          "Don't track metrics systematically",
          'Track basic metrics monthly',
          'Weekly dashboard review',
          'Real-time dashboard reviewed daily'
        ]
      },
      {
        id: 'q14',
        text: 'How aligned is your team around priorities?',
        type: 'single-choice',
        section: 'strategic-wheel',
        subsection: 'Communications & Alignment',
        points: 5,
        options: [
          'Little to no alignment',
          'Some alignment, poor communication',
          'Good alignment and communication',
          'Perfect alignment and rhythm'
        ]
      }
    ]
  },
  {
    id: 'priorities',
    title: 'SECTION 3: STRATEGIC PRIORITIES',
    subtitle: 'Your specific challenges and opportunities',
    maxPoints: 0,
    questions: [
      {
        id: 'q15',
        text: "What's the single biggest constraint holding your business back?",
        type: 'text',
        section: 'priorities',
        points: 0
      },
      {
        id: 'q16',
        text: "What's your biggest opportunity for growth right now?",
        type: 'text',
        section: 'priorities',
        points: 0
      },
      {
        id: 'q17',
        text: 'If you could fix ONE thing in the next 90 days for maximum impact, what would it be?',
        type: 'text',
        section: 'priorities',
        points: 0
      }
    ]
  }
];

// Scoring functions
export function calculateSectionScore(sectionId: string, responses: Record<string, any>): number {
  const section = assessmentSections.find(s => s.id === sectionId);
  if (!section) return 0;
  
  let score = 0;
  section.questions.forEach(question => {
    const response = responses[question.id];
    if (response !== undefined && question.points) {
      if (question.type === 'single-choice' && question.options) {
        const optionIndex = question.options.indexOf(response);
        if (optionIndex !== -1) {
          score += (optionIndex / (question.options.length - 1)) * question.points;
        }
      }
    }
  });
  
  return Math.round(score);
}

export function calculateTotalScore(responses: Record<string, any>): number {
  let total = 0;
  assessmentSections.forEach(section => {
    total += calculateSectionScore(section.id, responses);
  });
  return total;
}

export function getHealthStatus(totalScore: number): string {
  const percentage = (totalScore / 100) * 100; // Adjusted for current max score
  
  if (percentage >= 90) return 'THRIVING';
  if (percentage >= 80) return 'STRONG';
  if (percentage >= 70) return 'STABLE';
  if (percentage >= 60) return 'BUILDING';
  if (percentage >= 50) return 'STRUGGLING';
  return 'URGENT';
}

export function getHealthStatusColor(status: string): string {
  switch(status) {
    case 'THRIVING': return 'text-green-700 bg-green-100';
    case 'STRONG': return 'text-green-600 bg-green-50';
    case 'STABLE': return 'text-yellow-600 bg-yellow-50';
    case 'BUILDING': return 'text-orange-600 bg-orange-50';
    case 'STRUGGLING': return 'text-red-500 bg-red-50';
    case 'URGENT': return 'text-red-700 bg-red-100';
    default: return 'text-gray-600 bg-gray-50';
  }
}