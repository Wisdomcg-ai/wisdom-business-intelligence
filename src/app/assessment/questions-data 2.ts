export interface AssessmentQuestion {
  id: number;
  section: number;
  sectionName: string;
  question: string;
  type: 'single' | 'multiple' | 'yesno' | 'text' | 'number' | 'competitor';
  options?: string[];
  subQuestions?: {
    id: string;
    text: string;
  }[];
  required?: boolean;
}

export const assessmentQuestions: AssessmentQuestion[] = [
  // SECTION 1: BUSINESS FOUNDATION (6 questions)
  {
    id: 1,
    section: 1,
    sectionName: 'Business Foundation',
    question: "What's your current annual revenue?",
    type: 'single',
    required: true,
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
    id: 2,
    section: 1,
    sectionName: 'Business Foundation',
    question: "What's your current profit margin?",
    type: 'single',
    required: true,
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
    id: 3,
    section: 1,
    sectionName: 'Business Foundation',
    question: 'Are you paying yourself a market-rate salary consistently?',
    type: 'single',
    required: true,
    options: [
      'No - rarely take money out',
      'Sometimes - when cash flow allows',
      'Yes - regular salary below market',
      'Yes - full market-rate salary',
      'Yes - salary plus profit distributions'
    ]
  },
  {
    id: 4,
    section: 1,
    sectionName: 'Business Foundation',
    question: 'How many people work in your business?',
    type: 'single',
    required: true,
    options: [
      'Just me',
      '2-5 people',
      '6-15 people',
      '16-50 people',
      '50+ people'
    ]
  },
  {
    id: 5,
    section: 1,
    sectionName: 'Business Foundation',
    question: 'How dependent is the business on you personally?',
    type: 'single',
    required: true,
    options: [
      'Completely - stops without me',
      'Very - needs me for most decisions',
      'Somewhat - can run for short periods',
      'Minimal - runs well without me'
    ]
  },
  {
    id: 6,
    section: 1,
    sectionName: 'Business Foundation',
    question: 'How predictable is your monthly revenue?',
    type: 'single',
    required: true,
    options: [
      'Completely unpredictable - varies wildly',
      'Somewhat predictable - within 50%',
      'Very predictable - within 25%',
      'Extremely predictable - recurring revenue'
    ]
  },

  // SECTION 2: STRATEGIC WHEEL ASSESSMENT (14 questions)
  {
    id: 7,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How clear and compelling is your business vision?',
    type: 'single',
    required: true,
    options: [
      'Very unclear - no defined direction',
      'Somewhat clear - general idea',
      'Clear - team understands it',
      'Crystal clear - guides all decisions'
    ]
  },
  {
    id: 8,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'Does your team understand and believe in your purpose?',
    type: 'single',
    required: true,
    options: [
      'No understanding or buy-in',
      'Some understanding, limited buy-in',
      'Good understanding and buy-in',
      'Complete alignment and passion'
    ]
  },
  {
    id: 9,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How well-defined is your target market and positioning?',
    type: 'single',
    required: true,
    options: [
      'Serve anyone who will pay',
      'General target market defined',
      'Specific ideal customer profile',
      'Laser-focused with clear differentiation'
    ]
  },
  {
    id: 10,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'Do you have a sustainable competitive advantage?',
    type: 'single',
    required: true,
    options: [
      'Compete mainly on price',
      'Some differentiation',
      'Clear unique value proposition',
      'Dominant market position'
    ]
  },
  {
    id: 11,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'Have you clearly defined and do you actively use your Unique Selling Propositions (USPs)?',
    type: 'single',
    required: true,
    options: [
      "Don't know what makes us different",
      'Have some ideas but not clearly defined',
      'USPs defined but not consistently used in marketing',
      'Clear USPs used across all marketing materials',
      'Powerful USPs that immediately resonate with ideal clients'
    ]
  },
  {
    id: 12,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'Who are your top 3 competitors and what makes you different?',
    type: 'competitor',
    required: true
  },
  {
    id: 13,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How strong is your team and culture?',
    type: 'single',
    required: true,
    options: [
      'Struggling with people issues',
      'Adequate team, developing culture',
      'Good team, positive culture',
      'A-players with exceptional culture'
    ]
  },
  {
    id: 14,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How well-defined and lived are your core values?',
    type: 'single',
    required: true,
    options: [
      'No defined core values',
      "Values exist but aren't used",
      'Values guide some decisions',
      'Values drive all decisions and hiring'
    ]
  },
  {
    id: 15,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How systematic is your business execution?',
    type: 'single',
    required: true,
    options: [
      'Ad hoc, reactive approach',
      'Some systems, inconsistent execution',
      'Good systems, reliable execution',
      'Exceptional systems and execution'
    ]
  },
  {
    id: 16,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'Do you have effective meeting rhythms?',
    type: 'single',
    required: true,
    options: [
      'Irregular, unproductive meetings',
      'Some meetings, limited value',
      'Weekly team meetings with agendas',
      'Daily huddles, weekly tactical, monthly strategic'
    ]
  },
  {
    id: 17,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How well do you track business performance with a dashboard?',
    type: 'single',
    required: true,
    options: [
      "Don't track metrics systematically",
      'Track basic metrics monthly',
      'Weekly dashboard review',
      'Real-time dashboard reviewed daily'
    ]
  },
  {
    id: 18,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'Have you identified your "1 Number" that drives everything?',
    type: 'single',
    required: true,
    options: [
      'No idea what this means',
      'Track many metrics, no focus',
      'Have identified key metric',
      '"1 Number" drives all decisions'
    ]
  },
  {
    id: 19,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How aligned is your team around priorities?',
    type: 'single',
    required: true,
    options: [
      'Little to no alignment',
      'Some alignment, poor communication',
      'Good alignment and communication',
      'Perfect alignment and rhythm'
    ]
  },
  {
    id: 20,
    section: 2,
    sectionName: 'Strategic Wheel Assessment',
    question: 'How organized are your team communications?',
    type: 'single',
    required: true,
    options: [
      'Scattered across email, texts, calls, and apps - very inefficient',
      'Multiple channels but manageable',
      'Streamlined to 2-3 main channels',
      'One primary platform for all team communication'
    ]
  },

  // SECTION 3: PROFITABILITY HEALTH CHECK (6 questions)
  {
    id: 21,
    section: 3,
    sectionName: 'Profitability Health Check',
    question: 'What prevents you from achieving your target profit margin? (Check all that apply)',
    type: 'multiple',
    required: true,
    options: [
      'Prices are too low for the value delivered',
      'Costs are not well controlled',
      "Don't know true profit by product/service",
      'Too many discounts given',
      'Inefficient operations increase costs',
      'High customer acquisition costs',
      'Poor cash flow management',
      'Overhead too high for revenue'
    ]
  },
  {
    id: 22,
    section: 3,
    sectionName: 'Profitability Health Check',
    question: 'When did you last increase prices?',
    type: 'single',
    required: true,
    options: [
      'Never or over 2 years ago',
      '1-2 years ago',
      '6-12 months ago',
      'Within last 6 months'
    ]
  },
  {
    id: 23,
    section: 3,
    sectionName: 'Profitability Health Check',
    question: 'How confident are you in your pricing strategy?',
    type: 'single',
    required: true,
    options: [
      'Very unsure - often discount or apologize',
      'Somewhat confident - occasional doubts',
      'Confident - rarely questioned',
      'Very confident - optimal pricing achieved'
    ]
  },
  {
    id: 24,
    section: 3,
    sectionName: 'Profitability Health Check',
    question: 'How often do you review and audit your business expenses?',
    type: 'single',
    required: true,
    options: [
      'Never or only when cash is tight',
      'Annually',
      'Quarterly',
      'Monthly with action taken on findings'
    ]
  },
  {
    id: 25,
    section: 3,
    sectionName: 'Profitability Health Check',
    question: 'Do you regularly review and cancel unused subscriptions/services?',
    type: 'single',
    required: true,
    options: [
      "No - probably paying for things we don't use",
      'Occasionally when I notice something',
      'Annual review of all subscriptions',
      'Quarterly audit with immediate cancellations'
    ]
  },
  {
    id: 26,
    section: 3,
    sectionName: 'Profitability Health Check',
    question: 'When did you last negotiate with suppliers for better pricing (insurance, utilities, suppliers, etc.)?',
    type: 'single',
    required: true,
    options: [
      'Never or over 2 years ago',
      'Within the last 2 years',
      'Within the last year',
      'Within the last 6 months'
    ]
  },

  // SECTION 4: BUSINESS ENGINES ASSESSMENT (23 questions)
  // ATTRACT ENGINE
  {
    id: 27,
    section: 4,
    sectionName: 'Business Engines - Attract',
    question: 'How many qualified leads do you generate monthly?',
    type: 'single',
    required: true,
    options: [
      'Under 20 leads',
      '20-50 leads',
      '50-100 leads',
      '100+ leads'
    ]
  },
  {
    id: 28,
    section: 4,
    sectionName: 'Business Engines - Attract',
    question: 'How many reliable marketing channels generate leads?',
    type: 'single',
    required: true,
    options: [
      'No consistent channels',
      '1-2 inconsistent sources',
      '3-4 regular sources',
      '5+ systematic channels'
    ]
  },
  {
    id: 29,
    section: 4,
    sectionName: 'Business Engines - Attract',
    question: 'Do you have a documented marketing process (branding guidelines, content calendar, social media response procedures, etc.)?',
    type: 'single',
    required: true,
    options: [
      'No process at all',
      "Have a process but don't follow it",
      'Have a process and follow it sometimes',
      'Have a documented process and follow it consistently'
    ]
  },
  {
    id: 30,
    section: 4,
    sectionName: 'Business Engines - Attract',
    question: 'How systematic is your lead generation?',
    type: 'yesno',
    required: true,
    subQuestions: [
      { id: '30a', text: 'We have a referral system generating 30%+ of business' },
      { id: '30b', text: 'We email our database/leads regularly to nurture relationships' },
      { id: '30c', text: 'We track ROI for each marketing channel' },
      { id: '30d', text: 'We know our cost per lead and customer acquisition cost' }
    ]
  },

  // CONVERT ENGINE
  {
    id: 31,
    section: 4,
    sectionName: 'Business Engines - Convert',
    question: "What's your lead-to-customer conversion rate?",
    type: 'single',
    required: true,
    options: [
      "Under 15% or don't track",
      '15-25%',
      '25-40%',
      'Over 40%'
    ]
  },
  {
    id: 32,
    section: 4,
    sectionName: 'Business Engines - Convert',
    question: 'Do you have a documented sales process that you follow?',
    type: 'single',
    required: true,
    options: [
      'No process at all',
      "Have a process but don't follow it",
      'Have a process and follow it sometimes',
      'Have a process and follow it consistently'
    ]
  },
  {
    id: 33,
    section: 4,
    sectionName: 'Business Engines - Convert',
    question: 'How effective is your sales capability?',
    type: 'yesno',
    required: true,
    subQuestions: [
      { id: '33a', text: 'We follow up multiple times with interested prospects' },
      { id: '33b', text: "We contact prospects who didn't sign after receiving proposals" },
      { id: '33c', text: 'We have ready answers for common objections' },
      { id: '33d', text: 'We always ask for the business rather than waiting' }
    ]
  },
  {
    id: 34,
    section: 4,
    sectionName: 'Business Engines - Convert',
    question: 'Do you maximize transaction value?',
    type: 'yesno',
    required: true,
    subQuestions: [
      { id: '34a', text: 'We offer different price points (basic, standard, premium)' },
      { id: '34b', text: 'We regularly offer additional products/services to clients' },
      { id: '34c', text: 'We can confidently explain our pricing without apologizing' },
      { id: '34d', text: 'Our prices are based on value, not just costs' }
    ]
  },

  // DELIVER ENGINE - Customer Experience
  {
    id: 35,
    section: 4,
    sectionName: 'Business Engines - Deliver Customer',
    question: 'What percentage of customers are delighted with your delivery?',
    type: 'single',
    required: true,
    options: [
      'Under 60%',
      '60-75%',
      '75-90%',
      'Over 90%'
    ]
  },
  {
    id: 36,
    section: 4,
    sectionName: 'Business Engines - Deliver Customer',
    question: 'How do you know this? (What data supports your answer?)',
    type: 'text',
    required: true
  },
  {
    id: 37,
    section: 4,
    sectionName: 'Business Engines - Deliver Customer',
    question: 'Do you have a documented delivery process that you follow?',
    type: 'single',
    required: true,
    options: [
      'No process at all',
      "Have a process but don't follow it",
      'Have a process and follow it sometimes',
      'Have a documented process and follow it consistently'
    ]
  },
  {
    id: 38,
    section: 4,
    sectionName: 'Business Engines - Deliver Customer',
    question: 'How do you measure and track customer satisfaction?',
    type: 'single',
    required: true,
    options: [
      "Don't measure systematically",
      'Occasional informal feedback',
      'Regular satisfaction surveys',
      'Comprehensive feedback system with action plans'
    ]
  },
  {
    id: 39,
    section: 4,
    sectionName: 'Business Engines - Deliver Customer',
    question: 'How exceptional is your customer journey?',
    type: 'yesno',
    required: true,
    subQuestions: [
      { id: '39a', text: 'Our onboarding experience impresses new customers' },
      { id: '39b', text: "We've mapped every customer touchpoint" },
      { id: '39c', text: 'Customers can easily reach us when needed' },
      { id: '39d', text: 'We systematically review and improve the experience' }
    ]
  },

  // DELIVER ENGINE - People & Team
  {
    id: 40,
    section: 4,
    sectionName: 'Business Engines - People & Team',
    question: 'How strategic is your approach to talent?',
    type: 'single',
    required: true,
    options: [
      'Reactive hiring when desperate',
      'Basic hiring process',
      'Good hiring with defined criteria',
      'Systematic recruitment of A-players'
    ]
  },
  {
    id: 41,
    section: 4,
    sectionName: 'Business Engines - People & Team',
    question: 'Do you have a performance management system?',
    type: 'single',
    required: true,
    options: [
      'No formal performance management',
      'Occasional informal feedback',
      'Regular reviews without clear criteria',
      'Systematic reviews against core values and job KPIs'
    ]
  },
  {
    id: 42,
    section: 4,
    sectionName: 'Business Engines - People & Team',
    question: 'How effectively do you develop and leverage your team?',
    type: 'yesno',
    required: true,
    subQuestions: [
      { id: '42a', text: 'Every role has documented responsibilities and KPIs' },
      { id: '42b', text: 'We invest in team training and development' },
      { id: '42c', text: 'We strategically outsource non-core activities' },
      { id: '42d', text: 'Team is accountable for results' }
    ]
  },

  // DELIVER ENGINE - Systems & Process
  {
    id: 43,
    section: 4,
    sectionName: 'Business Engines - Systems & Process',
    question: 'How comprehensive is your process documentation (written, video, audio, or AI)?',
    type: 'single',
    required: true,
    options: [
      "Most processes exist only in people's heads",
      'Some processes documented',
      'Most key processes documented',
      'All processes documented and optimized'
    ]
  },
  {
    id: 44,
    section: 4,
    sectionName: 'Business Engines - Systems & Process',
    question: 'How often do you audit if systems are being followed?',
    type: 'single',
    required: true,
    options: [
      'Never audit compliance',
      'Only when problems arise',
      'Annual system audits',
      'Quarterly audits with improvements'
    ]
  },
  {
    id: 45,
    section: 4,
    sectionName: 'Business Engines - Systems & Process',
    question: 'How advanced is your operational infrastructure?',
    type: 'yesno',
    required: true,
    subQuestions: [
      { id: '45a', text: 'We have robust data backup and security systems' },
      { id: '45b', text: 'We have documented customer retention/delight processes' },
      { id: '45c', text: 'Our technology infrastructure is current and integrated' },
      { id: '45d', text: 'We measure process efficiency and cycle times' }
    ]
  },

  // FINANCE ENGINE
  {
    id: 46,
    section: 4,
    sectionName: 'Business Engines - Finance',
    question: 'Do you have a comprehensive P&L budget/forecast?',
    type: 'single',
    required: true,
    options: [
      'No budget or forecast',
      'Basic revenue/expense tracking',
      'Annual budget created',
      'Detailed budget with monthly variance analysis'
    ]
  },
  {
    id: 47,
    section: 4,
    sectionName: 'Business Engines - Finance',
    question: 'Do you maintain cash flow forecasts?',
    type: 'single',
    required: true,
    options: [
      'No cash flow forecasting',
      'Check bank balance when needed',
      'Monthly cash flow review',
      '13-week rolling cash flow forecast'
    ]
  },
  {
    id: 48,
    section: 4,
    sectionName: 'Business Engines - Finance',
    question: 'Which statement best describes your understanding of pricing?',
    type: 'single',
    required: true,
    options: [
      "I'm not sure of the difference between markup and margin",
      "I understand the difference but don't use it strategically",
      'I calculate both and understand their impact',
      'I optimize pricing using both markup and margin analysis'
    ]
  },
  {
    id: 49,
    section: 4,
    sectionName: 'Business Engines - Finance',
    question: 'How well do you manage profitability and working capital?',
    type: 'yesno',
    required: true,
    subQuestions: [
      { id: '49a', text: 'We maintain sufficient cash reserves (3+ months expenses)' },
      { id: '49b', text: 'We actively manage our cash conversion cycle' },
      { id: '49c', text: 'We know which products/services are most profitable' },
      { id: '49d', text: 'We have increased prices in the last 12 months' }
    ]
  },

  // SECTION 6: STRATEGIC PRIORITIES & GOALS (5 questions)
  {
    id: 50,
    section: 6,
    sectionName: 'Strategic Priorities & Goals',
    question: "What's the single biggest constraint holding your business back?",
    type: 'text',
    required: true
  },
  {
    id: 51,
    section: 6,
    sectionName: 'Strategic Priorities & Goals',
    question: "What's your biggest opportunity for growth right now?",
    type: 'text',
    required: true
  },
  {
    id: 52,
    section: 6,
    sectionName: 'Strategic Priorities & Goals',
    question: 'If you could fix ONE thing in the next 90 days for maximum impact, what would it be?',
    type: 'text',
    required: true
  },
  {
    id: 53,
    section: 6,
    sectionName: 'Strategic Priorities & Goals',
    question: 'Where do you need the most help to achieve your goals?',
    type: 'text',
    required: true
  },
  {
    id: 54,
    section: 6,
    sectionName: 'Strategic Priorities & Goals',
    question: 'What are your 12-month targets?',
    type: 'text',
    required: true
  }
];

// Section 5 Success Disciplines - embedded within the flow
export const successDisciplines = [
  {
    name: 'Decision-Making Frameworks',
    questions: [
      'I have clear criteria for different types of decisions',
      'I make small decisions quickly without overthinking',
      'I know which decisions need deep analysis vs quick action',
      'I rarely procrastinate on important decisions',
      'I have defined decision-making authority levels'
    ]
  },
  {
    name: 'Technology & AI Integration',
    questions: [
      'We use technology effectively for marketing automation',
      'We track and manage all customer interactions systematically',
      'We use AI for content creation or customer service',
      'We use AI for data analysis or insights',
      'We regularly evaluate new technology opportunities'
    ]
  },
  {
    name: 'Growth Mindset & Learning',
    questions: [
      'I dedicate time weekly to learning new business skills',
      'I read business books or listen to podcasts regularly',
      'Our team has learning and development plans',
      'We document and share lessons from wins and failures',
      'We have a culture of continuous improvement'
    ]
  },
  {
    name: 'Leadership Development',
    questions: [
      'Others naturally follow my vision and direction',
      "I'm developing other leaders in the business",
      'I delegate effectively and empower my team',
      'I regularly assess and improve my leadership skills',
      'I spend time working ON the business, not just IN it'
    ]
  },
  {
    name: 'Personal Mastery',
    questions: [
      'I have a morning ritual including planning and goals review',
      'I can maintain deep focus for 2+ hours on important work',
      'I take at least 30 minutes daily for exercise/physical activity',
      'I plan each day in advance with specific outcomes',
      'I consistently maintain high energy throughout the workday'
    ]
  },
  {
    name: 'Operational Excellence',
    questions: [
      'We have standard operating procedures that everyone follows',
      'Our business could operate effectively without me for 6 weeks',
      'We regularly review and optimize our systems',
      'We measure and improve operational efficiency metrics',
      'We have quality control systems in place'
    ]
  },
  {
    name: 'Resource Optimization',
    questions: [
      'We maximize utilization of physical assets and space',
      'Our people are deployed in their highest-value roles',
      "We've eliminated or outsourced non-core activities",
      'We regularly review and optimize all resource allocation',
      'We track ROI on all major investments and decisions'
    ]
  },
  {
    name: 'Financial Acumen',
    questions: [
      'I review financial metrics weekly',
      'I understand my profit per customer/job/unit sold',
      'We track budget vs actual with variance analysis',
      'I make decisions based on financial impact',
      'We actively manage cash flow to avoid surprises'
    ]
  },
  {
    name: 'Accountability & Performance Management',
    questions: [
      'Every team member has clear KPIs and scorecards',
      'We conduct regular performance reviews',
      'People consistently do what they say they will do',
      'I hold myself accountable to my commitments',
      'We have a culture of ownership and responsibility'
    ]
  },
  {
    name: 'Customer Experience',
    questions: [
      'Customers are delighted and become advocates (referrals/reviews)',
      'We systematically gather and act on customer feedback',
      'We maintain strong relationships beyond the initial transaction',
      'We exceed expectations at every touchpoint',
      'We have a customer success process, not just customer service'
    ]
  },
  {
    name: 'Resilience & Renewal',
    questions: [
      'I have scheduled breaks and renewal time',
      'I work less than 50 hours per week consistently',
      "I've scheduled time off in the next 12 months",
      'I bounce back quickly from setbacks',
      'I maintain work-life integration that energizes me'
    ]
  },
  {
    name: 'Time Management & Effectiveness',
    questions: [
      'I use a prioritization system (urgent/important matrix or similar)',
      'I maintain and work from organized to-do lists daily',
      'I calendar-block my most important activities',
      'I have a "Stop Doing List" to eliminate low-value activities',
      'I protect my time by saying no to non-essential requests'
    ]
  }
];