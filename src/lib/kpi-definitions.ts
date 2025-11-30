// /src/lib/kpi-definitions.ts

import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Target, 
  Clock,
  Heart,
  Package,
  ShoppingCart,
  Megaphone,
  Settings,
  BarChart3,
  Star,
  Zap,
  Shield,
  Award,
  Activity,
  AlertCircle,
  CheckCircle,
  Phone,
  MessageSquare,
  Percent,
  Calendar,
  Repeat,
  UserCheck,
  UserX,
  Timer,
  Gauge,
  CreditCard,
  Wallet,
  Receipt,
  FileText,
  Briefcase,
  Building,
  Truck,
  Wrench,
  Coffee,
  ShoppingBag,
  Monitor,
  LucideIcon
} from 'lucide-react'

// KPI Interface
export interface KPI {
  id: string
  name: string
  plainName: string // User-friendly name
  unit: string
  icon: LucideIcon
  function: BusinessFunction
  category: string
  description: string
  whyItMatters: string
  actionToTake: string
  formula?: string
  benchmarks: {
    poor: number | string
    average: number | string
    good: number | string
    excellent: number | string
  }
  industries: Industry[]
  stage: BusinessStage[]
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  tier: 'essential' | 'recommended' | 'advanced'
}

// Business Functions (Engines)
export type BusinessFunction = 
  | 'ATTRACT'   // Marketing & Lead Generation
  | 'CONVERT'   // Sales & Conversion
  | 'DELIVER'   // Operations & Delivery
  | 'DELIGHT'   // Customer Service & Retention
  | 'PEOPLE'    // Team & Culture
  | 'PROFIT'    // Financial Management
  | 'SYSTEMS'   // Efficiency & Productivity

// Industries
export type Industry = 
  | 'construction-trades'
  | 'health-wellness'
  | 'professional-services'
  | 'retail-ecommerce'
  | 'operations-logistics'
  | 'all' // Applies to all industries

// Business Stages
export type BusinessStage = 
  | 'FOUNDATION'     // 0-250K
  | 'TRACTION'       // 250K-1M
  | 'GROWTH'         // 1M-2.5M
  | 'SCALE'          // 2.5M-5M
  | 'OPTIMIZATION'   // 5M-10M
  | 'LEADERSHIP'     // 10M+

// Essential KPIs - The Quick Start 5
export const ESSENTIAL_KPIS: KPI[] = [
  {
    id: 'monthly-revenue',
    name: 'Monthly Revenue',
    plainName: 'Money Coming In Each Month',
    unit: '$',
    icon: DollarSign,
    function: 'PROFIT',
    category: 'Revenue',
    description: 'Total income generated in a month',
    whyItMatters: 'This is your business pulse - if it stops, everything stops',
    actionToTake: 'Track daily, review weekly. If trending down, immediately check your sales pipeline',
    formula: 'Sum of all sales in the month',
    benchmarks: {
      poor: '<$20K',
      average: '$20K-$50K',
      good: '$50K-$100K',
      excellent: '>$100K'
    },
    industries: ['all'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'monthly',
    tier: 'essential'
  },
  {
    id: 'gross-profit-margin',
    name: 'Gross Profit Margin',
    plainName: 'Money You Keep After Direct Costs',
    unit: '%',
    icon: Percent,
    function: 'PROFIT',
    category: 'Profitability',
    description: 'Percentage of revenue remaining after direct costs',
    whyItMatters: 'Shows if you\'re pricing correctly - low margins mean you\'re working hard for little reward',
    actionToTake: 'If below 50%, review pricing immediately. If below 30%, you have a crisis',
    formula: '((Revenue - Direct Costs) / Revenue) × 100',
    benchmarks: {
      poor: '<30%',
      average: '30-50%',
      good: '50-70%',
      excellent: '>70%'
    },
    industries: ['all'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'monthly',
    tier: 'essential'
  },
  {
    id: 'customer-count',
    name: 'Active Customer Count',
    plainName: 'Number of Paying Customers',
    unit: '#',
    icon: Users,
    function: 'DELIGHT',
    category: 'Customer',
    description: 'Total number of active paying customers',
    whyItMatters: 'More customers = more stability. One customer leaving shouldn\'t sink your business',
    actionToTake: 'Aim to add 10% more customers each month. If declining, check satisfaction scores',
    benchmarks: {
      poor: '<10',
      average: '10-50',
      good: '50-200',
      excellent: '>200'
    },
    industries: ['all'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'monthly',
    tier: 'essential'
  },
  {
    id: 'cash-on-hand',
    name: 'Cash on Hand',
    plainName: 'Money in the Bank Today',
    unit: 'days',
    icon: Wallet,
    function: 'PROFIT',
    category: 'Cash Flow',
    description: 'Number of days you can operate with current cash',
    whyItMatters: 'Cash is oxygen for your business - without it, you suffocate',
    actionToTake: 'Keep minimum 60 days. Below 30 days is danger zone - collect receivables NOW',
    formula: 'Cash Balance / (Monthly Expenses / 30)',
    benchmarks: {
      poor: '<30 days',
      average: '30-60 days',
      good: '60-90 days',
      excellent: '>90 days'
    },
    industries: ['all'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'weekly',
    tier: 'essential'
  },
  {
    id: 'lead-conversion-rate',
    name: 'Lead Conversion Rate',
    plainName: 'Leads That Become Customers',
    unit: '%',
    icon: Target,
    function: 'CONVERT',
    category: 'Sales',
    description: 'Percentage of leads that become paying customers',
    whyItMatters: 'Poor conversion wastes marketing money. Good conversion multiplies it',
    actionToTake: 'If below 20%, fix your sales process before spending more on marketing',
    formula: '(New Customers / Total Leads) × 100',
    benchmarks: {
      poor: '<10%',
      average: '10-20%',
      good: '20-35%',
      excellent: '>35%'
    },
    industries: ['all'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'essential'
  }
]

// Full KPI Library by Function
export const KPI_LIBRARY: KPI[] = [
  ...ESSENTIAL_KPIS,
  
  // ATTRACT - Marketing & Lead Generation
  {
    id: 'cost-per-lead',
    name: 'Cost Per Lead',
    plainName: 'Cost to Get Someone Interested',
    unit: '$',
    icon: Megaphone,
    function: 'ATTRACT',
    category: 'Marketing Efficiency',
    description: 'Average cost to generate one qualified lead',
    whyItMatters: 'High costs mean you\'re burning money. Low costs might mean poor quality',
    actionToTake: 'Compare across channels. Cut expensive channels that don\'t convert',
    formula: 'Total Marketing Spend / Number of Leads',
    benchmarks: {
      poor: '>$100',
      average: '$50-$100',
      good: '$20-$50',
      excellent: '<$20'
    },
    industries: ['all'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'recommended'
  },
  {
    id: 'website-conversion',
    name: 'Website Conversion Rate',
    plainName: 'Website Visitors Who Take Action',
    unit: '%',
    icon: Monitor,
    function: 'ATTRACT',
    category: 'Digital Marketing',
    description: 'Percentage of website visitors who become leads',
    whyItMatters: 'Your website works 24/7. If it\'s not converting, it\'s wasting traffic',
    actionToTake: 'Below 2%? Fix your website before buying more ads',
    formula: '(Leads from Website / Total Visitors) × 100',
    benchmarks: {
      poor: '<1%',
      average: '1-2%',
      good: '2-5%',
      excellent: '>5%'
    },
    industries: ['all'],
    stage: ['TRACTION', 'GROWTH', 'SCALE', 'OPTIMIZATION'],
    frequency: 'weekly',
    tier: 'recommended'
  },
  {
    id: 'marketing-roi',
    name: 'Marketing ROI',
    plainName: 'Return on Marketing Spend',
    unit: 'x',
    icon: TrendingUp,
    function: 'ATTRACT',
    category: 'Marketing Performance',
    description: 'Revenue generated per dollar spent on marketing',
    whyItMatters: 'Shows if marketing is an investment or an expense',
    actionToTake: 'Below 3x? Review your targeting. Above 10x? Spend more!',
    formula: '(Revenue from Marketing - Marketing Cost) / Marketing Cost',
    benchmarks: {
      poor: '<2x',
      average: '2-4x',
      good: '4-8x',
      excellent: '>8x'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'quarterly',
    tier: 'recommended'
  },

  // CONVERT - Sales & Conversion
  {
    id: 'sales-cycle-length',
    name: 'Sales Cycle Length',
    plainName: 'Time from Lead to Customer',
    unit: 'days',
    icon: Clock,
    function: 'CONVERT',
    category: 'Sales Efficiency',
    description: 'Average time to convert a lead to customer',
    whyItMatters: 'Longer cycles mean slower growth and tied-up resources',
    actionToTake: 'Map your sales process. Remove unnecessary steps. Add urgency',
    formula: 'Average days from first contact to close',
    benchmarks: {
      poor: '>30 days',
      average: '15-30 days',
      good: '7-15 days',
      excellent: '<7 days'
    },
    industries: ['all'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'recommended'
  },
  {
    id: 'average-transaction-value',
    name: 'Average Transaction Value',
    plainName: 'Average Sale Amount',
    unit: '$',
    icon: ShoppingCart,
    function: 'CONVERT',
    category: 'Sales Performance',
    description: 'Average revenue per transaction',
    whyItMatters: 'Easier to grow by selling more to existing customers than finding new ones',
    actionToTake: 'Add upsells, bundles, or premium options to increase',
    formula: 'Total Revenue / Number of Transactions',
    benchmarks: {
      poor: '<$100',
      average: '$100-$500',
      good: '$500-$2000',
      excellent: '>$2000'
    },
    industries: ['retail-ecommerce', 'professional-services'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'monthly',
    tier: 'recommended'
  },
  {
    id: 'quote-to-close',
    name: 'Quote to Close Rate',
    plainName: 'Quotes That Become Sales',
    unit: '%',
    icon: FileText,
    function: 'CONVERT',
    category: 'Sales Conversion',
    description: 'Percentage of quotes that result in sales',
    whyItMatters: 'Low rates mean you\'re wasting time quoting or pricing wrong',
    actionToTake: 'Below 30%? Review pricing and follow-up process',
    formula: '(Closed Deals / Quotes Sent) × 100',
    benchmarks: {
      poor: '<20%',
      average: '20-35%',
      good: '35-50%',
      excellent: '>50%'
    },
    industries: ['construction-trades', 'professional-services'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'recommended'
  },

  // DELIVER - Operations & Delivery
  {
    id: 'on-time-delivery',
    name: 'On-Time Delivery Rate',
    plainName: 'Jobs Finished on Schedule',
    unit: '%',
    icon: CheckCircle,
    function: 'DELIVER',
    category: 'Operations Performance',
    description: 'Percentage of projects delivered on time',
    whyItMatters: 'Late delivery kills reputation and creates costly problems',
    actionToTake: 'Below 90%? Review capacity planning and project estimation',
    formula: '(On-Time Deliveries / Total Deliveries) × 100',
    benchmarks: {
      poor: '<80%',
      average: '80-90%',
      good: '90-95%',
      excellent: '>95%'
    },
    industries: ['construction-trades', 'operations-logistics'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    tier: 'recommended'
  },
  {
    id: 'capacity-utilization',
    name: 'Capacity Utilization',
    plainName: 'How Busy Your Team Is',
    unit: '%',
    icon: Gauge,
    function: 'DELIVER',
    category: 'Resource Management',
    description: 'Percentage of available capacity being used',
    whyItMatters: 'Too low wastes money. Too high causes burnout and mistakes',
    actionToTake: 'Target 80-85%. Above 90%? Hire. Below 70%? Increase sales',
    formula: '(Hours Worked / Available Hours) × 100',
    benchmarks: {
      poor: '<60% or >95%',
      average: '60-70% or 90-95%',
      good: '70-80% or 85-90%',
      excellent: '80-85%'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION'],
    frequency: 'weekly',
    tier: 'advanced'
  },
  {
    id: 'error-rate',
    name: 'Error/Defect Rate',
    plainName: 'Mistakes That Need Fixing',
    unit: '%',
    icon: AlertCircle,
    function: 'DELIVER',
    category: 'Quality',
    description: 'Percentage of work requiring rework',
    whyItMatters: 'Mistakes cost double - once to do wrong, once to fix',
    actionToTake: 'Above 5%? Implement quality checklists and training',
    formula: '(Jobs with Errors / Total Jobs) × 100',
    benchmarks: {
      poor: '>10%',
      average: '5-10%',
      good: '2-5%',
      excellent: '<2%'
    },
    industries: ['construction-trades', 'health-wellness'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'recommended'
  },

  // DELIGHT - Customer Service & Retention
  {
    id: 'customer-lifetime-value',
    name: 'Customer Lifetime Value',
    plainName: 'Total Value of a Customer',
    unit: '$',
    icon: Heart,
    function: 'DELIGHT',
    category: 'Customer Value',
    description: 'Total revenue from a customer over their lifetime',
    whyItMatters: 'Higher values mean you can spend more to acquire customers',
    actionToTake: 'Increase through retention, upsells, and referrals',
    formula: 'Average Transaction Value × Purchase Frequency × Customer Lifespan',
    benchmarks: {
      poor: '<$500',
      average: '$500-$2000',
      good: '$2000-$10000',
      excellent: '>$10000'
    },
    industries: ['all'],
    stage: ['TRACTION', 'GROWTH', 'SCALE', 'OPTIMIZATION'],
    frequency: 'quarterly',
    tier: 'recommended'
  },
  {
    id: 'net-promoter-score',
    name: 'Net Promoter Score',
    plainName: 'Customer Happiness Score',
    unit: 'score',
    icon: Star,
    function: 'DELIGHT',
    category: 'Customer Satisfaction',
    description: 'Likelihood customers will recommend you',
    whyItMatters: 'Happy customers buy more and bring friends',
    actionToTake: 'Below 30? Fix service issues. Above 70? Ask for referrals',
    formula: '% Promoters - % Detractors',
    benchmarks: {
      poor: '<0',
      average: '0-30',
      good: '30-70',
      excellent: '>70'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'quarterly',
    tier: 'recommended'
  },
  {
    id: 'customer-churn-rate',
    name: 'Customer Churn Rate',
    plainName: 'Customers Who Stop Buying',
    unit: '%',
    icon: UserX,
    function: 'DELIGHT',
    category: 'Customer Retention',
    description: 'Percentage of customers lost per period',
    whyItMatters: 'Keeping customers is 5x cheaper than finding new ones',
    actionToTake: 'Above 10%? Survey lost customers immediately',
    formula: '(Customers Lost / Total Customers) × 100',
    benchmarks: {
      poor: '>15%',
      average: '10-15%',
      good: '5-10%',
      excellent: '<5%'
    },
    industries: ['all'],
    stage: ['TRACTION', 'GROWTH', 'SCALE', 'OPTIMIZATION'],
    frequency: 'monthly',
    tier: 'recommended'
  },
  {
    id: 'first-response-time',
    name: 'First Response Time',
    plainName: 'Speed to Answer Customers',
    unit: 'hours',
    icon: MessageSquare,
    function: 'DELIGHT',
    category: 'Customer Service',
    description: 'Time to first response to customer inquiry',
    whyItMatters: 'Fast response = happy customers = more sales',
    actionToTake: 'Above 2 hours? Set up auto-responses and service standards',
    formula: 'Average time from inquiry to first response',
    benchmarks: {
      poor: '>24 hours',
      average: '4-24 hours',
      good: '1-4 hours',
      excellent: '<1 hour'
    },
    industries: ['all'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    tier: 'recommended'
  },

  // PEOPLE - Team & Culture
  {
    id: 'employee-productivity',
    name: 'Revenue Per Employee',
    plainName: 'Revenue Each Person Generates',
    unit: '$',
    icon: Users,
    function: 'PEOPLE',
    category: 'Team Efficiency',
    description: 'Average revenue generated per team member',
    whyItMatters: 'Shows if your team is efficient or if you\'re overstaffed',
    actionToTake: 'Below industry average? Review processes and training',
    formula: 'Total Revenue / Number of Employees',
    benchmarks: {
      poor: '<$100K',
      average: '$100K-$150K',
      good: '$150K-$250K',
      excellent: '>$250K'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'quarterly',
    tier: 'advanced'
  },
  {
    id: 'employee-retention',
    name: 'Employee Retention Rate',
    plainName: 'Team Members Who Stay',
    unit: '%',
    icon: UserCheck,
    function: 'PEOPLE',
    category: 'Team Retention',
    description: 'Percentage of employees retained annually',
    whyItMatters: 'Turnover costs 50-200% of salary to replace someone',
    actionToTake: 'Below 85%? Review culture, compensation, and management',
    formula: '(Employees Retained / Total Employees) × 100',
    benchmarks: {
      poor: '<70%',
      average: '70-85%',
      good: '85-95%',
      excellent: '>95%'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'yearly',
    tier: 'advanced'
  },
  {
    id: 'training-hours',
    name: 'Training Hours Per Employee',
    plainName: 'Time Invested in Team Growth',
    unit: 'hours',
    icon: Award,
    function: 'PEOPLE',
    category: 'Team Development',
    description: 'Average training hours per employee per year',
    whyItMatters: 'Skilled teams deliver better results and stay longer',
    actionToTake: 'Below 20 hours? Implement monthly training sessions',
    formula: 'Total Training Hours / Number of Employees',
    benchmarks: {
      poor: '<10 hours',
      average: '10-20 hours',
      good: '20-40 hours',
      excellent: '>40 hours'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'quarterly',
    tier: 'advanced'
  },

  // PROFIT - Financial Management
  {
    id: 'net-profit-margin',
    name: 'Net Profit Margin',
    plainName: 'Money Left After All Costs',
    unit: '%',
    icon: DollarSign,
    function: 'PROFIT',
    category: 'Profitability',
    description: 'Percentage of revenue that becomes profit',
    whyItMatters: 'This is why you\'re in business - no profit, no point',
    actionToTake: 'Below 10%? Cut costs or raise prices immediately',
    formula: '(Net Profit / Revenue) × 100',
    benchmarks: {
      poor: '<5%',
      average: '5-10%',
      good: '10-20%',
      excellent: '>20%'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'monthly',
    tier: 'essential'
  },
  {
    id: 'accounts-receivable-days',
    name: 'Accounts Receivable Days',
    plainName: 'Days to Get Paid',
    unit: 'days',
    icon: Receipt,
    function: 'PROFIT',
    category: 'Cash Flow',
    description: 'Average days to collect payment',
    whyItMatters: 'Late payments kill cash flow and businesses',
    actionToTake: 'Above 30 days? Tighten credit terms and follow up aggressively',
    formula: '(Accounts Receivable / Daily Revenue)',
    benchmarks: {
      poor: '>45 days',
      average: '30-45 days',
      good: '15-30 days',
      excellent: '<15 days'
    },
    industries: ['all'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    tier: 'recommended'
  },
  {
    id: 'break-even-point',
    name: 'Break-Even Point',
    plainName: 'Sales Needed to Cover Costs',
    unit: '$',
    icon: Target,
    function: 'PROFIT',
    category: 'Financial Planning',
    description: 'Revenue needed to cover all costs',
    whyItMatters: 'Know exactly how much you need to sell to survive',
    actionToTake: 'Calculate monthly. Always stay 20% above this number',
    formula: 'Fixed Costs / (1 - Variable Cost %)',
    benchmarks: {
      poor: '>80% of capacity',
      average: '60-80% of capacity',
      good: '40-60% of capacity',
      excellent: '<40% of capacity'
    },
    industries: ['all'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'monthly',
    tier: 'recommended'
  },

  // SYSTEMS - Efficiency & Productivity
  {
    id: 'process-efficiency',
    name: 'Process Efficiency Rate',
    plainName: 'Work Done Right First Time',
    unit: '%',
    icon: Settings,
    function: 'SYSTEMS',
    category: 'Process Optimization',
    description: 'Percentage of work completed without rework',
    whyItMatters: 'Efficient processes save time and money',
    actionToTake: 'Below 85%? Document and standardize your processes',
    formula: '(Work Without Rework / Total Work) × 100',
    benchmarks: {
      poor: '<70%',
      average: '70-85%',
      good: '85-95%',
      excellent: '>95%'
    },
    industries: ['all'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION'],
    frequency: 'monthly',
    tier: 'advanced'
  },
  {
    id: 'automation-rate',
    name: 'Automation Rate',
    plainName: 'Work Done by Systems',
    unit: '%',
    icon: Zap,
    function: 'SYSTEMS',
    category: 'Technology',
    description: 'Percentage of repetitive tasks automated',
    whyItMatters: 'Automation frees your team for valuable work',
    actionToTake: 'Below 30%? List repetitive tasks and find automation tools',
    formula: '(Automated Tasks / Total Repetitive Tasks) × 100',
    benchmarks: {
      poor: '<10%',
      average: '10-30%',
      good: '30-50%',
      excellent: '>50%'
    },
    industries: ['all'],
    stage: ['SCALE', 'OPTIMIZATION', 'LEADERSHIP'],
    frequency: 'quarterly',
    tier: 'advanced'
  },

  // Industry-Specific KPIs

  // Construction & Trades Specific
  {
    id: 'job-completion-rate',
    name: 'Job Completion Rate',
    plainName: 'Jobs Finished This Month',
    unit: '#',
    icon: Wrench,
    function: 'DELIVER',
    category: 'Operations',
    description: 'Number of jobs completed per month',
    whyItMatters: 'More completions = more cash flow and happy customers',
    actionToTake: 'Track weekly. If declining, check bottlenecks in your process',
    benchmarks: {
      poor: '<5',
      average: '5-15',
      good: '15-30',
      excellent: '>30'
    },
    industries: ['construction-trades'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'weekly',
    tier: 'recommended'
  },
  {
    id: 'callback-rate',
    name: 'Callback Rate',
    plainName: 'Jobs Needing Return Visits',
    unit: '%',
    icon: Phone,
    function: 'DELIVER',
    category: 'Quality',
    description: 'Percentage of jobs requiring callbacks',
    whyItMatters: 'Callbacks eat profit and damage reputation',
    actionToTake: 'Above 5%? Implement quality checklists and training',
    formula: '(Jobs with Callbacks / Total Jobs) × 100',
    benchmarks: {
      poor: '>10%',
      average: '5-10%',
      good: '2-5%',
      excellent: '<2%'
    },
    industries: ['construction-trades'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'recommended'
  },

  // Health & Wellness Specific
  {
    id: 'client-attendance-rate',
    name: 'Client Attendance Rate',
    plainName: 'Clients Who Show Up',
    unit: '%',
    icon: Calendar,
    function: 'DELIVER',
    category: 'Service Delivery',
    description: 'Percentage of booked appointments attended',
    whyItMatters: 'No-shows waste time and lose money',
    actionToTake: 'Below 85%? Add reminders and cancellation policies',
    formula: '(Attended Appointments / Booked Appointments) × 100',
    benchmarks: {
      poor: '<70%',
      average: '70-85%',
      good: '85-95%',
      excellent: '>95%'
    },
    industries: ['health-wellness'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'weekly',
    tier: 'recommended'
  },
  {
    id: 'member-retention',
    name: 'Member Retention Rate',
    plainName: 'Members Who Keep Paying',
    unit: '%',
    icon: Repeat,
    function: 'DELIGHT',
    category: 'Retention',
    description: 'Percentage of members retained monthly',
    whyItMatters: 'Recurring revenue is the holy grail of business',
    actionToTake: 'Below 90%? Survey leaving members and improve experience',
    formula: '(Members Retained / Total Members) × 100',
    benchmarks: {
      poor: '<80%',
      average: '80-90%',
      good: '90-95%',
      excellent: '>95%'
    },
    industries: ['health-wellness'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'essential'
  },

  // Professional Services Specific
  {
    id: 'billable-utilization',
    name: 'Billable Utilization',
    plainName: 'Time You Can Charge For',
    unit: '%',
    icon: Timer,
    function: 'DELIVER',
    category: 'Efficiency',
    description: 'Percentage of time that\'s billable',
    whyItMatters: 'Non-billable time is lost revenue',
    actionToTake: 'Below 70%? Review admin processes and delegation',
    formula: '(Billable Hours / Total Working Hours) × 100',
    benchmarks: {
      poor: '<50%',
      average: '50-70%',
      good: '70-85%',
      excellent: '>85%'
    },
    industries: ['professional-services'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'weekly',
    tier: 'essential'
  },
  {
    id: 'project-profitability',
    name: 'Project Profitability',
    plainName: 'Profit Per Project',
    unit: '%',
    icon: Briefcase,
    function: 'PROFIT',
    category: 'Project Management',
    description: 'Average profit margin per project',
    whyItMatters: 'Some projects make money, others lose it - know which',
    actionToTake: 'Below 30%? Review scoping and pricing immediately',
    formula: '((Project Revenue - Project Costs) / Project Revenue) × 100',
    benchmarks: {
      poor: '<20%',
      average: '20-35%',
      good: '35-50%',
      excellent: '>50%'
    },
    industries: ['professional-services'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'recommended'
  },

  // Retail & E-commerce Specific
  {
    id: 'inventory-turnover',
    name: 'Inventory Turnover',
    plainName: 'How Fast Stock Sells',
    unit: 'x/year',
    icon: Package,
    function: 'DELIVER',
    category: 'Inventory',
    description: 'Times inventory is sold and replaced yearly',
    whyItMatters: 'Slow turnover ties up cash in dead stock',
    actionToTake: 'Below 6x? Clear old stock and buy faster-moving items',
    formula: 'Cost of Goods Sold / Average Inventory',
    benchmarks: {
      poor: '<4x',
      average: '4-6x',
      good: '6-12x',
      excellent: '>12x'
    },
    industries: ['retail-ecommerce'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    tier: 'recommended'
  },
  {
    id: 'cart-abandonment',
    name: 'Cart Abandonment Rate',
    plainName: 'People Who Don\'t Complete Purchase',
    unit: '%',
    icon: ShoppingCart,
    function: 'CONVERT',
    category: 'E-commerce',
    description: 'Percentage who add to cart but don\'t buy',
    whyItMatters: 'High abandonment = lost sales at the finish line',
    actionToTake: 'Above 70%? Simplify checkout and add trust signals',
    formula: '(Abandoned Carts / Total Carts) × 100',
    benchmarks: {
      poor: '>80%',
      average: '70-80%',
      good: '60-70%',
      excellent: '<60%'
    },
    industries: ['retail-ecommerce'],
    stage: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'weekly',
    tier: 'recommended'
  },

  // Operations & Logistics Specific
  {
    id: 'delivery-accuracy',
    name: 'Delivery Accuracy',
    plainName: 'Deliveries Without Issues',
    unit: '%',
    icon: Truck,
    function: 'DELIVER',
    category: 'Logistics',
    description: 'Percentage of accurate, damage-free deliveries',
    whyItMatters: 'Mistakes cost money and lose customers',
    actionToTake: 'Below 98%? Review packing and handling procedures',
    formula: '(Accurate Deliveries / Total Deliveries) × 100',
    benchmarks: {
      poor: '<95%',
      average: '95-98%',
      good: '98-99.5%',
      excellent: '>99.5%'
    },
    industries: ['operations-logistics'],
    stage: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'daily',
    tier: 'essential'
  },
  {
    id: 'fleet-utilization',
    name: 'Fleet Utilization',
    plainName: 'Vehicle/Equipment Usage',
    unit: '%',
    icon: Truck,
    function: 'SYSTEMS',
    category: 'Asset Management',
    description: 'Percentage of fleet capacity in use',
    whyItMatters: 'Idle vehicles are expensive paperweights',
    actionToTake: 'Below 75%? Review routes or consider reducing fleet',
    formula: '(Active Vehicle Hours / Available Vehicle Hours) × 100',
    benchmarks: {
      poor: '<60%',
      average: '60-75%',
      good: '75-85%',
      excellent: '>85%'
    },
    industries: ['operations-logistics'],
    stage: ['GROWTH', 'SCALE', 'OPTIMIZATION'],
    frequency: 'weekly',
    tier: 'recommended'
  }
]

// Helper functions
export function getKPIsByFunction(func: BusinessFunction): KPI[] {
  return KPI_LIBRARY.filter(kpi => kpi.function === func)
}

export function getKPIsByIndustry(industry: Industry): KPI[] {
  return KPI_LIBRARY.filter(kpi => 
    kpi.industries.includes('all') || kpi.industries.includes(industry)
  )
}

export function getKPIsByStage(stage: BusinessStage): KPI[] {
  return KPI_LIBRARY.filter(kpi => kpi.stage.includes(stage))
}

export function getKPIsByTier(tier: 'essential' | 'recommended' | 'advanced'): KPI[] {
  return KPI_LIBRARY.filter(kpi => kpi.tier === tier)
}

// Function metadata for UI display
export const BUSINESS_FUNCTIONS = [
  {
    id: 'ATTRACT',
    name: 'Attract',
    description: 'Marketing & Lead Generation',
    icon: Megaphone,
    color: 'purple'
  },
  {
    id: 'CONVERT',
    name: 'Convert',
    description: 'Sales & Conversion',
    icon: ShoppingCart,
    color: 'blue'
  },
  {
    id: 'DELIVER',
    name: 'Deliver',
    description: 'Operations & Delivery',
    icon: Package,
    color: 'green'
  },
  {
    id: 'DELIGHT',
    name: 'Delight',
    description: 'Customer Service & Retention',
    icon: Heart,
    color: 'red'
  },
  {
    id: 'PEOPLE',
    name: 'People',
    description: 'Team & Culture',
    icon: Users,
    color: 'orange'
  },
  {
    id: 'PROFIT',
    name: 'Profit',
    description: 'Financial Management',
    icon: DollarSign,
    color: 'emerald'
  },
  {
    id: 'SYSTEMS',
    name: 'Systems',
    description: 'Efficiency & Productivity',
    icon: Settings,
    color: 'gray'
  }
]

// Industry mapping helper
export function mapBusinessIndustryToKPIIndustry(businessIndustry: string | null): Industry {
  if (!businessIndustry) return 'all'
  
  const normalized = businessIndustry.toLowerCase()
  
  // Construction & Trades
  if (normalized.includes('construction') || 
      normalized.includes('building') ||
      normalized.includes('trade') || 
      normalized.includes('electric') || 
      normalized.includes('plumb') || 
      normalized.includes('hvac') ||
      normalized.includes('pool') ||
      normalized.includes('asphalt') ||
      normalized.includes('equipment')) {
    return 'construction-trades'
  }
  
  // Health & Wellness
  if (normalized.includes('health') || 
      normalized.includes('wellness') ||
      normalized.includes('gym') ||
      normalized.includes('fitness') ||
      normalized.includes('PT') ||
      normalized.includes('physio') ||
      normalized.includes('ndis') ||
      normalized.includes('psychology') ||
      normalized.includes('aged care') ||
      normalized.includes('care')) {
    return 'health-wellness'
  }
  
  // Professional Services
  if (normalized.includes('professional') || 
      normalized.includes('bookkeep') ||
      normalized.includes('account') ||
      normalized.includes('marketing') ||
      normalized.includes('agency') ||
      normalized.includes('recruit') ||
      normalized.includes('engineer') ||
      normalized.includes('consult') ||
      normalized.includes('coach') ||
      normalized.includes('strata') ||
      normalized.includes('legal') ||
      normalized.includes('finance')) {
    return 'professional-services'
  }
  
  // Retail & E-commerce
  if (normalized.includes('retail') || 
      normalized.includes('ecommerce') ||
      normalized.includes('e-commerce') ||
      normalized.includes('shop') ||
      normalized.includes('store') ||
      normalized.includes('apparel') ||
      normalized.includes('coffee') ||
      normalized.includes('art') ||
      normalized.includes('decor')) {
    return 'retail-ecommerce'
  }
  
  // Operations & Logistics
  if (normalized.includes('transport') || 
      normalized.includes('logistics') ||
      normalized.includes('freight') ||
      normalized.includes('delivery') ||
      normalized.includes('signage') ||
      normalized.includes('warehouse')) {
    return 'operations-logistics'
  }
  
  return 'all'
}

// Stage mapping helper
export function mapRevenueToStage(revenue: string): BusinessStage {
  const revenueMap: { [key: string]: BusinessStage } = {
    '0-250K': 'FOUNDATION',
    '250K-1M': 'TRACTION',
    '1M-2.5M': 'GROWTH',
    '2.5M-5M': 'SCALE',
    '5M-10M': 'OPTIMIZATION',
    '10M+': 'LEADERSHIP'
  }
  
  return revenueMap[revenue] || 'FOUNDATION'
}
// All types and constants are exported at declaration above
// No additional exports needed