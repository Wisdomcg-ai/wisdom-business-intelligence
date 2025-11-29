// src/lib/kpi/data/functions/people.ts

/**
 * PEOPLE Function - Team, Culture & HR KPIs
 * Focus: Team productivity, retention, satisfaction, and organizational health
 * Total: 24 KPIs (was 25, removed 1 duplicate from essential.ts)
 * All IDs prefixed with 'people-' to prevent conflicts
 * 
 * ✅ FIXED: Removed people-revenue-per-employee (duplicate in essential.ts)
 * ✅ VERIFIED: Uses 'function' (not businessFunction)
 * ✅ VERIFIED: Uses string literals for tier, industries, stages
 */

import { KPIDefinition } from '../../types'
import {
  Users,
  UserCheck,
  UserPlus,
  UserMinus,
  Award,
  Target,
  TrendingUp,
  TrendingDown,
  Heart,
  Smile,
  Frown,
  Clock,
  Calendar,
  DollarSign,
  Activity,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Zap,
  Timer,
  Briefcase,
  Shield,
  BookOpen,
  Star
} from 'lucide-react'

export const peopleKPIs: KPIDefinition[] = [
  // ==================== PRODUCTIVITY & EFFICIENCY ====================
  // NOTE: people-revenue-per-employee removed - it's in essential.ts

  {
    id: 'people-billable-utilization',
    name: 'Billable Utilization Rate',
    plainName: 'Time You Can Charge Clients For',
    function: 'PEOPLE',
    category: 'Productivity',
    tier: 'essential',
    industries: [
      'professional-services',
      'health-wellness',
      'all'
    ],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of work hours that are billable to clients',
    whyItMatters: 'Non-billable time is lost revenue - this is your moneymaker metric for service businesses',
    actionToTake: 'Target 70-85% for sustainable growth. Below 60%? Review admin processes and delegation',
    formula: '(Billable Hours / Total Available Hours) × 100',
    benchmarks: {
      poor: 50,
      average: 65,
      good: 75,
      excellent: 85
    },
    icon: Timer,
    tags: ['billable-hours', 'utilization', 'efficiency', 'professional-services'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-capacity-utilization',
    name: 'Capacity Utilization',
    plainName: 'How Busy Your Team Is',
    function: 'PEOPLE',
    category: 'Productivity',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of total team capacity being used',
    whyItMatters: 'Too low wastes money. Too high causes burnout and mistakes. Sweet spot is 75-85%',
    actionToTake: 'Above 90%? Hire or risk burnout. Below 65%? Increase sales or reduce team size',
    formula: '(Hours Worked / Total Available Hours) × 100',
    benchmarks: {
      poor: 50,
      average: 70,
      good: 80,
      excellent: 85
    },
    icon: Activity,
    tags: ['capacity', 'utilization', 'workload', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-profit-per-employee',
    name: 'Profit Per Employee',
    plainName: 'Profit Each Team Member Generates',
    function: 'PEOPLE',
    category: 'Productivity',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'quarterly',
    description: 'Net profit generated per employee annually',
    whyItMatters: 'Ultimate productivity measure - shows how profitable each team member is after all costs',
    actionToTake: 'Target $25K-$50K per employee. Track trend over time to measure efficiency improvements',
    formula: 'Net Profit / Number of Employees',
    benchmarks: {
      poor: 10000,
      average: 20000,
      good: 35000,
      excellent: 60000
    },
    icon: TrendingUp,
    tags: ['profitability', 'productivity', 'profit-per-head', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== RETENTION & TURNOVER ====================
  {
    id: 'people-employee-retention-rate',
    name: 'Employee Retention Rate',
    plainName: 'Team Members Who Stay',
    function: 'PEOPLE',
    category: 'Retention',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'annually',
    description: 'Percentage of employees who stay with the company over a year',
    whyItMatters: 'Replacing an employee costs 50-200% of their salary - retention saves massive money and protects culture',
    actionToTake: 'Target 85%+ retention. Below 75%? Review culture, compensation, and management practices',
    formula: '((Total Employees - Employees Left) / Total Employees) × 100',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 90,
      excellent: 95
    },
    icon: UserCheck,
    tags: ['retention', 'turnover', 'culture', 'loyalty'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-employee-turnover-rate',
    name: 'Employee Turnover Rate',
    plainName: 'Team Members Who Leave',
    function: 'PEOPLE',
    category: 'Retention',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of employees who leave the company annually',
    whyItMatters: 'High turnover destroys morale, knowledge, and profits - every departure costs you dearly',
    actionToTake: 'Above 15%? Conduct exit interviews immediately and fix root causes',
    formula: '(Number of Departures / Average Number of Employees) × 100',
    benchmarks: {
      poor: 30,
      average: 20,
      good: 10,
      excellent: 5
    },
    icon: UserMinus,
    tags: ['turnover', 'attrition', 'departures', 'retention'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-voluntary-turnover-rate',
    name: 'Voluntary Turnover Rate',
    plainName: 'People Who Quit',
    function: 'PEOPLE',
    category: 'Retention',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of employees who choose to leave (resignations only)',
    whyItMatters: 'Voluntary departures signal problems with culture, pay, or leadership - fix these before you lose more',
    actionToTake: 'Above 10%? This is a red flag. Interview leavers and staying employees to understand why',
    formula: '(Voluntary Departures / Total Employees) × 100',
    benchmarks: {
      poor: 20,
      average: 12,
      good: 7,
      excellent: 3
    },
    icon: TrendingDown,
    tags: ['voluntary-turnover', 'resignations', 'retention', 'culture'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-regretted-attrition',
    name: 'Regretted Attrition',
    plainName: 'Good People You Lost',
    function: 'PEOPLE',
    category: 'Retention',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of departures you wished you could have prevented',
    whyItMatters: 'Losing star performers hurts deeply - track this to protect your best people',
    actionToTake: 'Any regretted loss is too many. Do stay interviews with top performers quarterly',
    formula: '(Regretted Departures / Total Departures) × 100',
    benchmarks: {
      poor: 50,
      average: 30,
      good: 15,
      excellent: 5
    },
    icon: AlertCircle,
    tags: ['regretted-attrition', 'key-talent', 'retention', 'risk'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-time-to-productivity',
    name: 'Time to Productivity',
    plainName: 'Days Until New Hire Is Effective',
    function: 'PEOPLE',
    category: 'Retention',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'days',
    frequency: 'quarterly',
    description: 'Average days for new employees to reach full productivity',
    whyItMatters: 'Faster onboarding means faster ROI on new hires and better retention',
    actionToTake: 'Above 90 days? Improve onboarding process, documentation, and buddy system',
    formula: 'Average days from start date to full productivity',
    benchmarks: {
      poor: 120,
      average: 90,
      good: 60,
      excellent: 30
    },
    icon: Zap,
    tags: ['onboarding', 'productivity', 'training', 'time-to-value'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== SATISFACTION & ENGAGEMENT ====================
  {
    id: 'people-employee-satisfaction-score',
    name: 'Employee Satisfaction Score',
    plainName: 'How Happy Your Team Is',
    function: 'PEOPLE',
    category: 'Engagement',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'quarterly',
    description: 'Average employee satisfaction rating from surveys (1-10 scale)',
    whyItMatters: 'Happy employees stay longer, work harder, and deliver better customer service',
    actionToTake: 'Below 7? Take immediate action - survey for specific issues and address them publicly',
    formula: 'Average score from employee satisfaction surveys',
    benchmarks: {
      poor: 5,
      average: 6.5,
      good: 8,
      excellent: 9
    },
    icon: Smile,
    tags: ['satisfaction', 'happiness', 'morale', 'engagement'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-employee-net-promoter-score',
    name: 'Employee Net Promoter Score (eNPS)',
    plainName: 'Would Team Recommend Working Here',
    function: 'PEOPLE',
    category: 'Engagement',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'quarterly',
    description: 'Likelihood employees would recommend your company as a place to work (-100 to +100)',
    whyItMatters: 'Your team are your best recruiters (or worst) - positive eNPS drives referrals and brand',
    actionToTake: 'Target +20 or higher. Below 0? Major culture problems need immediate attention',
    formula: '(% Promoters - % Detractors)',
    benchmarks: {
      poor: -10,
      average: 10,
      good: 30,
      excellent: 50
    },
    icon: Star,
    tags: ['enps', 'employee-advocacy', 'culture', 'employer-brand'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-employee-engagement-score',
    name: 'Employee Engagement Score',
    plainName: 'How Committed Team Members Are',
    function: 'PEOPLE',
    category: 'Engagement',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of employees who are actively engaged (measured via survey)',
    whyItMatters: 'Engaged employees are 17% more productive and far less likely to leave',
    actionToTake: 'Target 70%+ engaged. Below 50%? Review management practices and career development',
    formula: '(Engaged Employees / Total Employees) × 100',
    benchmarks: {
      poor: 40,
      average: 55,
      good: 70,
      excellent: 85
    },
    icon: Heart,
    tags: ['engagement', 'commitment', 'motivation', 'culture'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== DEVELOPMENT & TRAINING ====================
  {
    id: 'people-training-hours-per-employee',
    name: 'Training Hours Per Employee',
    plainName: 'Time Invested in Team Growth',
    function: 'PEOPLE',
    category: 'Development',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'annually',
    description: 'Average training and development hours per employee per year',
    whyItMatters: 'Training builds capability, shows you care, and improves retention - it\'s an investment not a cost',
    actionToTake: 'Target 40+ hours annually. Below 20? Your team is falling behind competitors',
    formula: 'Total Training Hours / Number of Employees',
    benchmarks: {
      poor: 10,
      average: 25,
      good: 45,
      excellent: 80
    },
    icon: BookOpen,
    tags: ['training', 'development', 'learning', 'skills'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-internal-promotion-rate',
    name: 'Internal Promotion Rate',
    plainName: 'Team Members Promoted',
    function: 'PEOPLE',
    category: 'Development',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'annually',
    description: 'Percentage of open positions filled internally rather than external hires',
    whyItMatters: 'Internal promotions save money, boost morale, and show career paths exist',
    actionToTake: 'Target 40-60% internal fill rate. Below 30%? Develop succession planning',
    formula: '(Internal Promotions / Total Promotions) × 100',
    benchmarks: {
      poor: 20,
      average: 40,
      good: 60,
      excellent: 75
    },
    icon: TrendingUp,
    tags: ['promotions', 'career-development', 'succession', 'growth'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-training-roi',
    name: 'Training Return on Investment',
    plainName: 'Value From Training Investment',
    function: 'PEOPLE',
    category: 'Development',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'ratio',
    frequency: 'annually',
    description: 'Return on investment from training programs',
    whyItMatters: 'Proves training value - track productivity gains, error reduction, and retention improvements',
    actionToTake: 'Target 3:1 ROI minimum. Measure before/after performance metrics to prove value',
    formula: '(Value of Improvements / Training Costs)',
    benchmarks: {
      poor: 1.5,
      average: 2.5,
      good: 4.0,
      excellent: 6.0
    },
    icon: Award,
    tags: ['training-roi', 'learning-impact', 'development', 'value'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== ATTENDANCE & TIME ====================
  {
    id: 'people-absenteeism-rate',
    name: 'Absenteeism Rate',
    plainName: 'Days Team Members Are Absent',
    function: 'PEOPLE',
    category: 'Attendance',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of scheduled work days lost to unplanned absence',
    whyItMatters: 'High absenteeism signals health issues, burnout, or disengagement - and it costs money',
    actionToTake: 'Above 3%? Investigate causes - could be workload, morale, or health issues',
    formula: '(Days Absent / Total Scheduled Days) × 100',
    benchmarks: {
      poor: 5,
      average: 3,
      good: 2,
      excellent: 1
    },
    icon: AlertCircle,
    tags: ['absenteeism', 'sick-days', 'attendance', 'wellbeing'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-overtime-hours',
    name: 'Overtime Hours Percentage',
    plainName: 'Extra Hours Worked',
    function: 'PEOPLE',
    category: 'Attendance',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Overtime hours as percentage of regular hours',
    whyItMatters: 'Excessive overtime leads to burnout, errors, and turnover - it\'s a warning sign',
    actionToTake: 'Above 10%? Hire additional staff or improve processes - long-term overtime is unsustainable',
    formula: '(Overtime Hours / Regular Hours) × 100',
    benchmarks: {
      poor: 20,
      average: 12,
      good: 7,
      excellent: 3
    },
    icon: Clock,
    tags: ['overtime', 'workload', 'burnout', 'capacity'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-average-tenure',
    name: 'Average Employee Tenure',
    plainName: 'How Long People Stay',
    function: 'PEOPLE',
    category: 'Retention',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'years',
    frequency: 'quarterly',
    description: 'Average number of years employees stay with the company',
    whyItMatters: 'Longer tenure means better culture, knowledge retention, and lower hiring costs',
    actionToTake: 'Target 3+ years. Below 2 years? Review onboarding, culture, and career development',
    formula: 'Sum of all employee tenures / Number of employees',
    benchmarks: {
      poor: 1,
      average: 2.5,
      good: 4,
      excellent: 7
    },
    icon: Calendar,
    tags: ['tenure', 'longevity', 'retention', 'loyalty'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== HIRING & RECRUITMENT ====================
  {
    id: 'people-time-to-hire',
    name: 'Time to Hire',
    plainName: 'Days to Fill a Position',
    function: 'PEOPLE',
    category: 'Recruitment',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'days',
    frequency: 'quarterly',
    description: 'Average days from posting a job to accepting an offer',
    whyItMatters: 'Slow hiring costs revenue - every vacant day is lost productivity and potential sales',
    actionToTake: 'Above 60 days? Streamline process, improve job descriptions, or use recruiters',
    formula: 'Average days from job posting to offer acceptance',
    benchmarks: {
      poor: 90,
      average: 60,
      good: 40,
      excellent: 25
    },
    icon: Clock,
    tags: ['hiring', 'recruitment', 'time-to-fill', 'talent-acquisition'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-cost-per-hire',
    name: 'Cost Per Hire',
    plainName: 'Cost to Recruit Each Person',
    function: 'PEOPLE',
    category: 'Recruitment',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'quarterly',
    description: 'Total cost of recruiting and hiring each new employee',
    whyItMatters: 'Understanding recruitment costs helps budget growth and choose best hiring channels',
    actionToTake: 'Track by source - referrals usually cheapest, agencies most expensive',
    formula: 'Total Recruitment Costs / Number of Hires',
    benchmarks: {
      poor: 8000,
      average: 5000,
      good: 3000,
      excellent: 1500
    },
    icon: DollarSign,
    tags: ['cost-per-hire', 'recruitment-cost', 'hiring', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-offer-acceptance-rate',
    name: 'Offer Acceptance Rate',
    plainName: 'Job Offers That Get Accepted',
    function: 'PEOPLE',
    category: 'Recruitment',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of job offers that are accepted',
    whyItMatters: 'Low acceptance rate means compensation, role, or company reputation issues',
    actionToTake: 'Below 80%? Review salary benchmarks, role clarity, and interview process quality',
    formula: '(Offers Accepted / Total Offers Made) × 100',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 95
    },
    icon: CheckCircle,
    tags: ['offer-acceptance', 'recruitment', 'hiring', 'talent-attraction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-quality-of-hire',
    name: 'Quality of Hire',
    plainName: 'How Well New Hires Perform',
    function: 'PEOPLE',
    category: 'Recruitment',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'annually',
    description: 'Percentage of new hires who meet or exceed performance expectations after 12 months',
    whyItMatters: 'The ultimate measure of hiring effectiveness - are you choosing the right people?',
    actionToTake: 'Below 75%? Review interview process, job descriptions, and hiring criteria',
    formula: '(Successful Hires / Total Hires) × 100',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 95
    },
    icon: Target,
    tags: ['quality-of-hire', 'hiring-effectiveness', 'performance', 'selection'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== COMPENSATION & BENEFITS ====================
  {
    id: 'people-compensation-ratio',
    name: 'Compensation Ratio',
    plainName: 'Pay vs Market Average',
    function: 'PEOPLE',
    category: 'Compensation',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'ratio',
    frequency: 'annually',
    description: 'Company\'s average compensation compared to market average',
    whyItMatters: 'Paying below market loses talent. Paying too much hurts profits. Find the sweet spot',
    actionToTake: 'Target 0.9-1.1 ratio. Below 0.85? Risk losing people. Above 1.2? Overpaying',
    formula: 'Average Company Compensation / Market Average Compensation',
    benchmarks: {
      poor: 0.75,
      average: 0.9,
      good: 1.0,
      excellent: 1.1
    },
    icon: DollarSign,
    tags: ['compensation', 'salary', 'market-rate', 'pay'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'people-total-compensation-cost',
    name: 'Total Labor Cost Percentage',
    plainName: 'Team Costs as % of Revenue',
    function: 'PEOPLE',
    category: 'Compensation',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Total compensation and benefits as percentage of revenue',
    whyItMatters: 'Your biggest expense needs monitoring - too high kills profit, too low means you\'re understaffed',
    actionToTake: 'Target 30-40% for service businesses. Above 50%? Pricing or efficiency issue',
    formula: '(Total Labor Costs / Revenue) × 100',
    benchmarks: {
      poor: 60,
      average: 45,
      good: 35,
      excellent: 25
    },
    icon: BarChart3,
    tags: ['labor-cost', 'compensation', 'payroll', 'overhead'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== PERFORMANCE MANAGEMENT ====================
  {
    id: 'people-performance-review-completion',
    name: 'Performance Review Completion Rate',
    plainName: 'Reviews Completed On Time',
    function: 'PEOPLE',
    category: 'Performance',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of scheduled performance reviews completed on time',
    whyItMatters: 'Regular feedback drives performance and retention - skipped reviews signal management weakness',
    actionToTake: 'Target 100%. Below 90%? Hold managers accountable and simplify review process',
    formula: '(Reviews Completed / Reviews Scheduled) × 100',
    benchmarks: {
      poor: 70,
      average: 85,
      good: 95,
      excellent: 100
    },
    icon: CheckCircle,
    tags: ['performance-reviews', 'feedback', 'management', 'development'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]