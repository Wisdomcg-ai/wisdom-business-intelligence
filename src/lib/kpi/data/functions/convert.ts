// src/lib/kpi/data/functions/convert.ts

/**
 * CONVERT Function - Sales & Conversion KPIs
 * Focus: Sales performance, conversion optimization, pipeline management, and deal closing
 * Total: 25 KPIs across lead conversion, sales process, and revenue generation
 * All IDs prefixed with 'convert-' to prevent conflicts
 */

import { KPIDefinition } from '../../types'
import {
  Target,
  TrendingUp,
  DollarSign,
  Clock,
  BarChart3,
  Award,
  Users,
  CheckCircle,
  XCircle,
  FileText,
  Percent,
  Zap,
  Activity,
  TrendingDown,
  Calendar,
  Phone,
  Mail,
  MessageSquare,
  Briefcase,
  PieChart,
  ArrowRight,
  UserCheck,
  ShoppingCart,
  Layers,
  Repeat
} from 'lucide-react'

export const CONVERT_KPIS: KPIDefinition[] = [
  // ==================== CONVERSION RATES ====================
  {
    id: 'convert-lead-to-customer-conversion-rate',
    name: 'Lead to Customer Conversion Rate',
    plainName: 'Percentage of Leads That Become Customers',
    function: 'CONVERT',
    category: 'Conversion',
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
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of leads that convert into paying customers',
    whyItMatters: 'Your conversion rate multiplies the value of every marketing dollar - doubling conversion doubles revenue without more leads',
    actionToTake: 'Target 20-30% for service businesses. Below 15%? Fix your sales process before spending more on marketing',
    formula: '(New Customers / Total Leads) × 100',
    benchmarks: {
      poor: 10,
      average: 20,
      good: 30,
      excellent: 45
    },
    icon: Target,
    tags: ['conversion', 'sales', 'close-rate', 'effectiveness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-proposal-win-rate',
    name: 'Proposal Win Rate',
    plainName: 'Percentage of Proposals That Win',
    function: 'CONVERT',
    category: 'Conversion',
    tier: 'essential',
    industries: [
      'professional-services',
      'construction-trades',
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
    frequency: 'monthly',
    description: 'Percentage of proposals that result in won deals',
    whyItMatters: 'Low win rates mean you\'re wasting time on proposals for prospects who won\'t buy - qualifying is as important as closing',
    actionToTake: 'Target 40-60%. Below 30%? Qualify harder or improve proposals. Above 70%? You might be pricing too low',
    formula: '(Won Proposals / Total Proposals Sent) × 100',
    benchmarks: {
      poor: 20,
      average: 35,
      good: 50,
      excellent: 70
    },
    icon: Award,
    tags: ['win-rate', 'proposals', 'closing', 'effectiveness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-quote-to-close-rate',
    name: 'Quote to Close Rate',
    plainName: 'Quotes That Become Sales',
    function: 'CONVERT',
    category: 'Conversion',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'retail-ecommerce',
      'professional-services',
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
    description: 'Percentage of quotes that convert to closed sales',
    whyItMatters: 'Quote creation takes time - low close rates indicate pricing issues or poor qualification',
    actionToTake: 'Target 30-50%. Track by salesperson and deal size to identify patterns',
    formula: '(Closed Deals / Quotes Sent) × 100',
    benchmarks: {
      poor: 15,
      average: 30,
      good: 45,
      excellent: 65
    },
    icon: FileText,
    tags: ['quotes', 'conversion', 'closing', 'sales-efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-opportunity-to-close-rate',
    name: 'Opportunity to Close Rate',
    plainName: 'Sales Opportunities That Close',
    function: 'CONVERT',
    category: 'Conversion',
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
    description: 'Percentage of qualified opportunities that become customers',
    whyItMatters: 'Shows sales team effectiveness after marketing hands off qualified leads',
    actionToTake: 'Target 25-40%. Analyze lost deals to find patterns - price, timing, fit, or competition?',
    formula: '(Closed Won Opportunities / Total Opportunities) × 100',
    benchmarks: {
      poor: 15,
      average: 25,
      good: 35,
      excellent: 50
    },
    icon: Percent,
    tags: ['opportunities', 'win-rate', 'pipeline-conversion', 'sales-effectiveness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== SALES CYCLE & VELOCITY ====================
  {
    id: 'convert-sales-cycle-length',
    name: 'Sales Cycle Length',
    plainName: 'Days from Lead to Customer',
    function: 'CONVERT',
    category: 'Sales Velocity',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'days',
    frequency: 'monthly',
    description: 'Average days from first contact to closed deal',
    whyItMatters: 'Shorter cycles mean faster revenue and lower customer acquisition costs - time kills deals',
    actionToTake: 'Map your sales process, eliminate unnecessary steps, and add urgency. Target 30% reduction year-over-year',
    formula: 'Average(Close Date - First Contact Date) for all deals',
    benchmarks: {
      poor: 90,
      average: 45,
      good: 21,
      excellent: 7
    },
    icon: Clock,
    tags: ['sales-cycle', 'velocity', 'time-to-close', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-pipeline-velocity',
    name: 'Pipeline Velocity',
    plainName: 'Speed of Revenue Through Pipeline',
    function: 'CONVERT',
    category: 'Sales Velocity',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'monthly',
    description: 'Rate at which pipeline converts to revenue (opportunities × win rate × deal size / sales cycle length)',
    whyItMatters: 'The ultimate sales efficiency metric - shows how fast your pipeline generates cash',
    actionToTake: 'Increase by: more opportunities, higher win rate, larger deals, or shorter cycle. Focus on biggest bottleneck',
    formula: '(Number of Opportunities × Win Rate × Average Deal Size) / Sales Cycle Length in Days',
    benchmarks: {
      poor: 5000,
      average: 15000,
      good: 35000,
      excellent: 75000
    },
    icon: Activity,
    tags: ['velocity', 'pipeline-speed', 'sales-efficiency', 'revenue-rate'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-average-deal-size',
    name: 'Average Deal Size',
    plainName: 'Average Revenue Per Sale',
    function: 'CONVERT',
    category: 'Deal Metrics',
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
    unit: 'currency',
    frequency: 'monthly',
    description: 'Average revenue per closed deal',
    whyItMatters: 'Larger deals mean more revenue per sale - easier to scale than finding more customers',
    actionToTake: 'Increase through upsells, bundles, annual prepay, or targeting larger customers. Track trend monthly',
    formula: 'Total Revenue / Number of Closed Deals',
    benchmarks: {
      poor: 1000,
      average: 5000,
      good: 15000,
      excellent: 50000
    },
    icon: DollarSign,
    tags: ['deal-size', 'transaction-value', 'revenue', 'average-sale'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-time-to-first-meeting',
    name: 'Time to First Meeting',
    plainName: 'Speed to Schedule Sales Call',
    function: 'CONVERT',
    category: 'Sales Velocity',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'weekly',
    description: 'Average time from lead creation to first sales meeting scheduled',
    whyItMatters: 'Speed matters - leads contacted within 1 hour are 7x more likely to convert than those contacted after 2 hours',
    actionToTake: 'Target under 24 hours. Automate scheduling, respond fast, and make booking friction-free',
    formula: 'Average(First Meeting Scheduled - Lead Created Time)',
    benchmarks: {
      poor: 120,
      average: 48,
      good: 24,
      excellent: 4
    },
    icon: Calendar,
    tags: ['response-time', 'scheduling', 'speed-to-lead', 'first-meeting'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== PIPELINE MANAGEMENT ====================
  {
    id: 'convert-pipeline-value',
    name: 'Total Pipeline Value',
    plainName: 'Dollar Value of All Open Opportunities',
    function: 'CONVERT',
    category: 'Pipeline',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'weekly',
    description: 'Total potential revenue from all open opportunities',
    whyItMatters: 'Pipeline is your future revenue - healthy pipeline should be 3-5x your monthly revenue target',
    actionToTake: 'Track weekly. Pipeline should grow 10-20% monthly during growth phase',
    formula: 'Sum of (Opportunity Value × Probability to Close) for all open opportunities',
    benchmarks: {
      poor: 50000,
      average: 150000,
      good: 500000,
      excellent: 1500000
    },
    icon: BarChart3,
    tags: ['pipeline', 'forecast', 'opportunities', 'future-revenue'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-pipeline-coverage',
    name: 'Pipeline Coverage Ratio',
    plainName: 'Pipeline Value vs Revenue Target',
    function: 'CONVERT',
    category: 'Pipeline',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'ratio',
    frequency: 'monthly',
    description: 'Pipeline value divided by revenue target for the period',
    whyItMatters: 'Predicts if you\'ll hit targets - need 3-5x coverage to account for deals that don\'t close',
    actionToTake: 'Target 3-5x. Below 3x? Generate more leads urgently. Above 6x? Focus on closing not generating',
    formula: 'Total Pipeline Value / Monthly Revenue Target',
    benchmarks: {
      poor: 1.5,
      average: 3,
      good: 4.5,
      excellent: 6
    },
    icon: Layers,
    tags: ['coverage', 'pipeline-health', 'forecast', 'capacity'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-pipeline-stage-conversion',
    name: 'Pipeline Stage Conversion Rates',
    plainName: 'Conversion Between Sales Stages',
    function: 'CONVERT',
    category: 'Pipeline',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of opportunities moving from one stage to the next',
    whyItMatters: 'Identifies pipeline bottlenecks - where deals get stuck reveals what to fix',
    actionToTake: 'Map conversion at each stage. Any stage below 50% is a bottleneck needing process improvement',
    formula: '(Opportunities Advanced to Next Stage / Opportunities in Stage) × 100',
    benchmarks: {
      poor: 30,
      average: 50,
      good: 65,
      excellent: 80
    },
    icon: ArrowRight,
    tags: ['stage-conversion', 'pipeline-health', 'bottlenecks', 'process'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-weighted-pipeline',
    name: 'Weighted Pipeline Value',
    plainName: 'Probability-Adjusted Pipeline',
    function: 'CONVERT',
    category: 'Pipeline',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'weekly',
    description: 'Pipeline value adjusted by probability of closing',
    whyItMatters: 'More accurate forecast than raw pipeline - accounts for realistic close probability',
    actionToTake: 'Compare to target. Weighted pipeline should be 1.5-2x monthly target for healthy forecast',
    formula: 'Sum of (Deal Value × Stage Probability) for all opportunities',
    benchmarks: {
      poor: 25000,
      average: 75000,
      good: 200000,
      excellent: 500000
    },
    icon: PieChart,
    tags: ['forecast', 'weighted-pipeline', 'probability', 'accuracy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== SALES ACTIVITY METRICS ====================
  {
    id: 'convert-sales-calls-per-day',
    name: 'Sales Calls Per Day',
    plainName: 'Number of Sales Conversations Daily',
    function: 'CONVERT',
    category: 'Sales Activity',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'daily',
    description: 'Number of sales calls or meetings conducted per day',
    whyItMatters: 'Sales is a numbers game - consistent activity drives consistent results',
    actionToTake: 'Target 10-20 calls per day for new business. Track daily to maintain momentum',
    formula: 'Count of calls/meetings per sales day',
    benchmarks: {
      poor: 3,
      average: 8,
      good: 15,
      excellent: 25
    },
    icon: Phone,
    tags: ['activity', 'calls', 'outreach', 'volume'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-proposals-sent',
    name: 'Proposals Sent Per Month',
    plainName: 'Number of Proposals Delivered',
    function: 'CONVERT',
    category: 'Sales Activity',
    tier: 'recommended',
    industries: [
      'professional-services',
      'construction-trades',
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
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of formal proposals or quotes sent to prospects',
    whyItMatters: 'Leading indicator of future sales - more proposals means more potential revenue',
    actionToTake: 'Set monthly targets. Combine with win rate to predict revenue',
    formula: 'Count of proposals sent per month',
    benchmarks: {
      poor: 5,
      average: 15,
      good: 30,
      excellent: 60
    },
    icon: FileText,
    tags: ['proposals', 'activity', 'volume', 'pipeline'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-follow-up-rate',
    name: 'Follow-Up Rate',
    plainName: 'Percentage of Leads Followed Up',
    function: 'CONVERT',
    category: 'Sales Activity',
    tier: 'recommended',
    industries: ['all'],
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
    description: 'Percentage of leads that receive proper follow-up contact',
    whyItMatters: '80% of sales require 5+ follow-ups, but 44% of salespeople give up after one - follow-up wins deals',
    actionToTake: 'Target 100% with at least 5 touchpoints. Automate reminders to ensure no lead falls through cracks',
    formula: '(Leads with Follow-Up / Total Leads) × 100',
    benchmarks: {
      poor: 40,
      average: 65,
      good: 85,
      excellent: 95
    },
    icon: Repeat,
    tags: ['follow-up', 'persistence', 'activity', 'discipline'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== WIN/LOSS ANALYSIS ====================
  {
    id: 'convert-win-rate-by-lead-source',
    name: 'Win Rate by Lead Source',
    plainName: 'Conversion Rate Per Marketing Channel',
    function: 'CONVERT',
    category: 'Win/Loss Analysis',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Win rate segmented by where the lead originated',
    whyItMatters: 'Not all leads are equal - referrals convert 5x better than cold calls. Focus on channels that convert',
    actionToTake: 'Track win rate by source. Invest more in high-converting channels even if cost per lead is higher',
    formula: '(Wins from Source / Total Opportunities from Source) × 100',
    benchmarks: {
      poor: 15,
      average: 25,
      good: 40,
      excellent: 60
    },
    icon: Target,
    tags: ['win-rate', 'source-analysis', 'attribution', 'channel-performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-loss-reason-analysis',
    name: 'Primary Loss Reasons',
    plainName: 'Why Deals Are Lost',
    function: 'CONVERT',
    category: 'Win/Loss Analysis',
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
    description: 'Distribution of reasons why deals are lost (price, timing, competition, fit)',
    whyItMatters: 'Understanding why you lose helps you win more - pattern recognition reveals what to fix',
    actionToTake: 'Track loss reasons for every deal. If 50%+ are price, you have a value communication problem not a pricing problem',
    formula: 'Categorize and count all lost deal reasons',
    benchmarks: {
      poor: 0,
      average: 60,
      good: 80,
      excellent: 95
    },
    icon: XCircle,
    tags: ['loss-analysis', 'win-loss', 'improvement', 'objections'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-competitive-win-rate',
    name: 'Competitive Win Rate',
    plainName: 'Win Rate vs Specific Competitors',
    function: 'CONVERT',
    category: 'Win/Loss Analysis',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Win rate when competing against specific competitors',
    whyItMatters: 'Reveals competitive positioning strength - who you beat and who beats you shows where to improve',
    actionToTake: 'Track wins vs top 3 competitors. Develop battle cards for competitors you lose to frequently',
    formula: '(Wins vs Competitor / Total Competitive Deals) × 100',
    benchmarks: {
      poor: 25,
      average: 40,
      good: 55,
      excellent: 70
    },
    icon: Award,
    tags: ['competitive', 'win-rate', 'market-position', 'battle-cards'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== SALES TEAM PERFORMANCE ====================
  {
    id: 'convert-quota-attainment',
    name: 'Quota Attainment',
    plainName: 'Percentage of Sales Target Hit',
    function: 'CONVERT',
    category: 'Sales Performance',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of sales quota achieved by individual or team',
    whyItMatters: 'Consistent quota attainment indicates healthy sales organization - missing quota shows problems',
    actionToTake: 'Target 80%+ of team hitting 100%+ quota. Below 70%? Quota may be unrealistic or team needs training',
    formula: '(Actual Sales / Sales Quota) × 100',
    benchmarks: {
      poor: 60,
      average: 80,
      good: 100,
      excellent: 125
    },
    icon: Target,
    tags: ['quota', 'attainment', 'performance', 'target'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-sales-per-rep',
    name: 'Revenue Per Sales Rep',
    plainName: 'Sales Each Rep Generates',
    function: 'CONVERT',
    category: 'Sales Performance',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'monthly',
    description: 'Average revenue generated per sales team member',
    whyItMatters: 'Shows sales team productivity - benchmarks hiring decisions and identifies top performers',
    actionToTake: 'Target $50K-$100K monthly per rep. Wide variance indicates coaching opportunities',
    formula: 'Total Sales Revenue / Number of Sales Reps',
    benchmarks: {
      poor: 25000,
      average: 60000,
      good: 100000,
      excellent: 200000
    },
    icon: Users,
    tags: ['productivity', 'sales-rep', 'performance', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-sales-rep-ramp-time',
    name: 'Sales Rep Ramp Time',
    plainName: 'Time for New Rep to Hit Quota',
    function: 'CONVERT',
    category: 'Sales Performance',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'months',
    frequency: 'quarterly',
    description: 'Average months for new sales hire to reach full productivity',
    whyItMatters: 'Faster ramp time means better onboarding and faster ROI on new hires',
    actionToTake: 'Target 3-6 months. Create structured onboarding, shadow top performers, and provide clear playbooks',
    formula: 'Average months from hire date to first quota achievement',
    benchmarks: {
      poor: 12,
      average: 6,
      good: 4,
      excellent: 2
    },
    icon: TrendingUp,
    tags: ['ramp-time', 'onboarding', 'productivity', 'hiring'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== FORECAST ACCURACY ====================
  {
    id: 'convert-forecast-accuracy',
    name: 'Sales Forecast Accuracy',
    plainName: 'How Close Forecast Is to Actual',
    function: 'CONVERT',
    category: 'Forecasting',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Accuracy of sales forecast vs actual results',
    whyItMatters: 'Accurate forecasts enable better planning, hiring, and cash management',
    actionToTake: 'Target 90%+ accuracy. Track over time to improve forecasting methodology',
    formula: '100 - (|Forecast - Actual| / Forecast) × 100',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 90,
      excellent: 95
    },
    icon: BarChart3,
    tags: ['forecast', 'accuracy', 'planning', 'prediction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-deal-slippage-rate',
    name: 'Deal Slippage Rate',
    plainName: 'Deals Pushed to Next Period',
    function: 'CONVERT',
    category: 'Forecasting',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of forecasted deals that slip to future periods',
    whyItMatters: 'High slippage indicates over-optimistic forecasting or poor deal qualification',
    actionToTake: 'Target under 20%. Improve qualification and forecast only high-probability deals',
    formula: '(Deals Pushed / Forecasted Deals) × 100',
    benchmarks: {
      poor: 40,
      average: 25,
      good: 15,
      excellent: 5
    },
    icon: Calendar,
    tags: ['slippage', 'forecast', 'timing', 'qualification'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== UPSELL & EXPANSION ====================
  {
    id: 'convert-upsell-rate',
    name: 'Upsell Rate',
    plainName: 'Existing Customers Who Buy More',
    function: 'CONVERT',
    category: 'Expansion',
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
    description: 'Percentage of existing customers who purchase additional products/services',
    whyItMatters: 'Upselling is 68% cheaper than acquiring new customers and indicates product-market fit',
    actionToTake: 'Target 20-30% annually. Create upgrade paths and systematically offer expansions',
    formula: '(Customers Who Upsold / Total Customers) × 100',
    benchmarks: {
      poor: 5,
      average: 15,
      good: 25,
      excellent: 40
    },
    icon: TrendingUp,
    tags: ['upsell', 'expansion', 'growth', 'retention'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-cross-sell-rate',
    name: 'Cross-Sell Rate',
    plainName: 'Customers Buying Multiple Products',
    function: 'CONVERT',
    category: 'Expansion',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'professional-services',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of customers purchasing from multiple product/service lines',
    whyItMatters: 'Cross-buyers have higher lifetime value and lower churn - they\'re more embedded in your ecosystem',
    actionToTake: 'Create natural product bundles and complementary offerings. Train sales on cross-sell opportunities',
    formula: '(Customers with 2+ Products / Total Customers) × 100',
    benchmarks: {
      poor: 10,
      average: 20,
      good: 35,
      excellent: 50
    },
    icon: ShoppingCart,
    tags: ['cross-sell', 'product-mix', 'revenue-expansion', 'bundles'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-expansion-revenue-rate',
    name: 'Net Revenue Retention',
    plainName: 'Revenue Growth from Existing Customers',
    function: 'CONVERT',
    category: 'Expansion',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Revenue from existing customers including upsells minus churn',
    whyItMatters: 'Above 100% means you grow even without new customers - the holy grail of SaaS and subscription businesses',
    actionToTake: 'Target 110%+. Best companies achieve 120-150% through expansion exceeding churn',
    formula: '((Starting MRR + Expansion - Churn) / Starting MRR) × 100',
    benchmarks: {
      poor: 85,
      average: 95,
      good: 110,
      excellent: 130
    },
    icon: Award,
    tags: ['nrr', 'expansion', 'retention', 'growth-efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]