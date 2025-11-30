// src/lib/kpi/data/essential.ts

/**
 * ESSENTIAL KPIs - The Core 10 Metrics Every Business Must Track
 * These are the foundational KPIs that apply to all businesses regardless of industry or stage
 * IDs now prefixed with function name (profit-, attract-, convert-, delight-, people-, systems-)
 *
 * ✅ FIXED: All IDs now match their function property prefix
 * Use this for: Quick Start recommendations, Dashboard defaults, First-time users
 */

import { KPIDefinition } from '../types'
import {
  DollarSign,
  TrendingUp,
  Users,
  Target,
  Heart,
  ShoppingCart,
  UserCheck,
  Percent,
  Activity,
  Zap
} from 'lucide-react'

export const essentialKPIs: KPIDefinition[] = [
  // ==================== FINANCIAL HEALTH ====================
  {
    id: 'profit-monthly-revenue',
    name: 'Monthly Revenue',
    plainName: 'Money Coming In Each Month',
    function: 'PROFIT',
    category: 'Revenue Growth',
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
    description: 'Total income generated in a month from all sources',
    whyItMatters: 'This is your business pulse - if it stops growing, everything stops. Track this daily to spot trends early',
    actionToTake: 'Track daily, review weekly. If trending down, immediately check your sales pipeline and marketing activities',
    formula: 'Sum of all sales in the month',
    benchmarks: {
      poor: 20000,
      average: 50000,
      good: 100000,
      excellent: 200000
    },
    icon: DollarSign,
    tags: ['revenue', 'financial', 'essential', 'growth'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'profit-gross-profit-margin',
    name: 'Gross Profit Margin',
    plainName: 'Money You Keep After Direct Costs',
    function: 'PROFIT',
    category: 'Profitability',
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
    frequency: 'monthly',
    description: 'The percentage of revenue left after paying for what it costs to deliver your product or service (COGS)',
    whyItMatters: 'Shows if you\'re pricing right and controlling direct costs. Higher margins mean more money for growth and profit. Below 30% and you\'re in danger',
    actionToTake: 'If below 30%, review pricing or find ways to reduce direct costs. Aim for 40%+ for healthy growth',
    formula: '(Revenue - Cost of Goods Sold) / Revenue × 100',
    benchmarks: {
      poor: 20,
      average: 35,
      good: 50,
      excellent: 65
    },
    icon: Percent,
    tags: ['margin', 'profitability', 'essential', 'pricing'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'profit-net-profit-margin',
    name: 'Net Profit Margin',
    plainName: 'Money You Keep After Everything',
    function: 'PROFIT',
    category: 'Profitability',
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
    frequency: 'monthly',
    description: 'The percentage of revenue you actually keep after ALL expenses including overhead, salaries, and taxes',
    whyItMatters: 'This is your real profitability - what actually goes in your pocket. You can be "busy" but broke if this number is low',
    actionToTake: 'Aim for 10-15% minimum. If lower, review all expenses line by line and cut ruthlessly',
    formula: '(Revenue - All Expenses) / Revenue × 100',
    benchmarks: {
      poor: 5,
      average: 10,
      good: 15,
      excellent: 25
    },
    icon: TrendingUp,
    tags: ['profit', 'bottom-line', 'essential', 'financial-health'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'profit-cash-flow',
    name: 'Operating Cash Flow',
    plainName: 'Money In vs Money Out',
    function: 'PROFIT',
    category: 'Cash Management',
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
    frequency: 'weekly',
    description: 'The actual cash coming in and going out of your business each week',
    whyItMatters: 'You can be profitable on paper but still run out of cash. Cash flow problems kill more businesses than lack of profit',
    actionToTake: 'Keep 2-3 months of expenses in reserve. If negative for 2+ weeks, take immediate action on collections or expenses',
    formula: 'Cash In (Collections) - Cash Out (Payments)',
    benchmarks: {
      poor: -10000,
      average: 5000,
      good: 15000,
      excellent: 30000
    },
    icon: Activity,
    tags: ['cash-flow', 'liquidity', 'essential', 'survival'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== CUSTOMER METRICS ====================
  {
    id: 'attract-lead-generation',
    name: 'Monthly Lead Generation',
    plainName: 'New Enquiries Coming In',
    function: 'ATTRACT',
    category: 'Marketing Performance',
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
    unit: 'number',
    frequency: 'weekly',
    description: 'Number of new potential customers contacting you or showing interest',
    whyItMatters: 'No leads = no sales. This is your business pipeline. A declining lead count is an early warning signal',
    actionToTake: 'Set a weekly target based on your conversion rate and revenue goals. If below target, boost marketing immediately',
    formula: 'Count of qualified leads from all sources',
    benchmarks: {
      poor: 10,
      average: 30,
      good: 75,
      excellent: 150
    },
    icon: Users,
    tags: ['leads', 'marketing', 'essential', 'pipeline'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-conversion-rate',
    name: 'Lead to Customer Conversion Rate',
    plainName: 'Enquiries That Become Customers',
    function: 'CONVERT',
    category: 'Sales Effectiveness',
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
    description: 'Percentage of leads or quotes that turn into paying customers',
    whyItMatters: 'Shows how good you are at closing deals. A 10% improvement in conversion doubles profits without spending more on marketing',
    actionToTake: 'If below 20%, improve your sales process, qualify leads better, or work on your pitch. Track by source to find what converts best',
    formula: '(New Customers / Total Leads) × 100',
    benchmarks: {
      poor: 10,
      average: 20,
      good: 30,
      excellent: 40
    },
    icon: Target,
    tags: ['conversion', 'sales', 'essential', 'effectiveness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'convert-average-transaction-value',
    name: 'Average Transaction Value',
    plainName: 'Average Sale Size',
    function: 'CONVERT',
    category: 'Sales Performance',
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
    description: 'The average amount customers spend per purchase or project',
    whyItMatters: 'Bigger sales mean more revenue without needing more customers. It\'s often easier to increase this than find new customers',
    actionToTake: 'Increase by bundling services, upselling, or focusing on premium customers. Even a 10% increase dramatically impacts revenue',
    formula: 'Total Revenue / Number of Transactions',
    benchmarks: {
      poor: 1000,
      average: 3000,
      good: 7500,
      excellent: 15000
    },
    icon: ShoppingCart,
    tags: ['transaction-value', 'sales', 'essential', 'revenue'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-retention',
    name: 'Customer Retention Rate',
    plainName: 'Customers Who Stay With You',
    function: 'DELIGHT',
    category: 'Customer Loyalty',
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
    description: 'Percentage of customers who continue buying from you over time',
    whyItMatters: 'Keeping customers is 5x cheaper than finding new ones. High retention means predictable revenue and higher profits',
    actionToTake: 'If below 80%, survey lost customers to find out why they left and fix those issues. Aim for 90%+',
    formula: '(Customers at End - New Customers) / Customers at Start × 100',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 95
    },
    icon: Heart,
    tags: ['retention', 'loyalty', 'essential', 'customer-success'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== OPERATIONAL EFFICIENCY ====================
  {
    id: 'people-revenue-per-employee',
    name: 'Revenue Per Employee',
    plainName: 'Money Each Team Member Generates',
    function: 'PEOPLE',
    category: 'Team Productivity',
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
    frequency: 'quarterly',
    description: 'Total revenue divided by total number of employees (including you)',
    whyItMatters: 'Shows how efficiently you\'re using your team. Low numbers mean you\'re overstaffed or underpriced. High numbers mean great productivity',
    actionToTake: 'Compare to industry averages. If low, focus on productivity, systems, or pricing. If very high, you might be ready to hire',
    formula: 'Annual Revenue / Total Number of Employees',
    benchmarks: {
      poor: 100000,
      average: 200000,
      good: 350000,
      excellent: 500000
    },
    icon: UserCheck,
    tags: ['productivity', 'efficiency', 'essential', 'team'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-operating-expenses-ratio',
    name: 'Operating Expense Ratio',
    plainName: 'Overhead as % of Revenue',
    function: 'SYSTEMS',
    category: 'Cost Control',
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
    description: 'Your operating expenses (rent, salaries, software, etc.) as a percentage of revenue',
    whyItMatters: 'Shows if your overhead is under control. If this creeps up, profits disappear even if revenue grows',
    actionToTake: 'Keep this under 60% for healthy businesses. Review monthly and cut unnecessary expenses ruthlessly',
    formula: '(Total Operating Expenses / Revenue) × 100',
    benchmarks: {
      poor: 80,
      average: 65,
      good: 50,
      excellent: 40
    },
    icon: Zap,
    tags: ['expenses', 'overhead', 'essential', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

// Export for registry
export default essentialKPIs

// Named export with backwards compatibility alias
export { essentialKPIs as ESSENTIAL_KPIS }