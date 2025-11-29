export const assessmentQuestions = [
  // SECTION 1: BUSINESS FOUNDATION (Questions 1-6)
  {
    id: 'q1',
    section: 'Business Foundation',
    sectionNumber: 1,
    number: 1,
    text: "What's your current annual revenue?",
    type: 'single-choice',
    options: [
      { value: 'under-250k', label: 'Under $250K (Foundation Stage)', score: 0 },
      { value: '250k-1m', label: '$250K - $1M (Traction Stage)', score: 2 },
      { value: '1m-3m', label: '$1M - $3M (Scaling Stage)', score: 4 },
      { value: '3m-5m', label: '$3M - $5M (Optimization Stage)', score: 6 },
      { value: '5m-10m', label: '$5M - $10M (Leadership Stage)', score: 8 },
      { value: '10m-plus', label: '$10M+ (Mastery Stage)', score: 10 },
    ]
  },
  {
    id: 'q2',
    section: 'Business Foundation',
    sectionNumber: 1,
    number: 2,
    text: "What's your current profit margin?",
    type: 'single-choice',
    options: [
      { value: 'losing', label: 'Losing money', score: 0 },
      { value: 'breakeven', label: 'Breaking even (0-5%)', score: 2 },
      { value: 'small', label: 'Small profit (5-10%)', score: 4 },
      { value: 'healthy', label: 'Healthy profit (10-15%)', score: 6 },
      { value: 'strong', label: 'Strong profit (15-20%)', score: 8 },
      { value: 'exceptional', label: 'Exceptional profit (20%+)', score: 10 },
    ]
  },
  {
    id: 'q3',
    section: 'Business Foundation',
    sectionNumber: 1,
    number: 3,
    text: "Are you paying yourself a market-rate salary consistently?",
    type: 'single-choice',
    options: [
      { value: 'no-rarely', label: 'No - rarely take money out', score: 0 },
      { value: 'sometimes', label: 'Sometimes - when cash flow allows', score: 1 },
      { value: 'yes-below', label: 'Yes - regular salary below market', score: 3 },
      { value: 'yes-full', label: 'Yes - full market-rate salary', score: 4 },
      { value: 'yes-plus', label: 'Yes - salary plus profit distributions', score: 5 },
    ]
  },
  // Add more questions here - I'll add a few more for demonstration
  {
    id: 'q4',
    section: 'Business Foundation',
    sectionNumber: 1,
    number: 4,
    text: "How many people work in your business?",
    type: 'single-choice',
    options: [
      { value: 'just-me', label: 'Just me', score: 0 },
      { value: '2-5', label: '2-5 people', score: 0 },
      { value: '6-15', label: '6-15 people', score: 0 },
      { value: '16-50', label: '16-50 people', score: 0 },
      { value: '50-plus', label: '50+ people', score: 0 },
    ]
  },
  // Continue with all 54 questions...
];

export const totalQuestions = assessmentQuestions.length;

export const sections = [
  { number: 1, name: 'Business Foundation', questionCount: 6 },
  { number: 2, name: 'Strategic Wheel Assessment', questionCount: 14 },
  { number: 3, name: 'Profitability Health Check', questionCount: 6 },
  { number: 4, name: 'Business Engines Assessment', questionCount: 23 },
  { number: 5, name: 'Success Disciplines Assessment', questionCount: 12 },
  { number: 6, name: 'Strategic Priorities & Goals', questionCount: 5 },
];
