// src/lib/kpi/data/functions/deliver-operations.ts

/**
 * DELIVER Business Function - Operations KPIs
 * Total: 25 KPIs
 * Covers: Operational efficiency, resource management, throughput, project management, delivery metrics
 * 
 * ✅ FIXED: Uses 'function' instead of 'businessFunction'
 * ✅ FIXED: All IDs prefixed with 'deliver-operations-'
 * ✅ FIXED: String literals instead of enums
 * ✅ FIXED: Updated all property names to match new schema
 */

import { KPIDefinition } from '../../types'
import {
  Activity,
  TrendingUp,
  Users,
  Calendar,
  Clock,
  Target,
  Zap,
  BarChart3,
  DollarSign,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Timer,
  Package,
  Layers,
  GitBranch,
  Briefcase,
  Award
} from 'lucide-react'

export const deliverOperationsKPIs: KPIDefinition[] = [
  // ==================== UTILIZATION & PRODUCTIVITY ====================
  {
    id: 'deliver-operations-billable-utilization-rate',
    name: 'Billable Utilization Rate',
    plainName: 'Percentage of Time Your Team Spends on Paying Work',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'essential',
    industries: [
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
    description: 'Percentage of total available work hours that are spent on billable client work',
    whyItMatters: 'Directly impacts profitability - higher utilization means more revenue from the same team size. Low utilization indicates excess capacity or inefficient resource allocation',
    actionToTake: 'Track by individual, team, and role. If below target, reduce non-billable time, improve scheduling, or adjust team size. If consistently above 85%, consider hiring to prevent burnout. Professional services typically target 70-80%. Agencies aim for 75-85%',
    formula: '(Billable Hours / Total Available Hours) × 100',
    benchmarks: {
      poor: 50,
      average: 65,
      good: 75,
      excellent: 85
    },
    icon: Percent,
    tags: ['utilization', 'productivity', 'billable', 'efficiency', 'resource-management'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-capacity-utilization',
    name: 'Capacity Utilization',
    plainName: 'How Much of Your Available Capacity You\'re Using',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'essential',
    industries: [
      'retail-ecommerce',
      'operations-logistics',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of total production or service capacity being used',
    whyItMatters: 'Indicates how efficiently you\'re using your infrastructure and resources. Too low means wasted overhead; too high risks quality issues and inability to handle demand spikes',
    actionToTake: 'If below 70%, reduce fixed costs or increase marketing. If above 90%, plan capacity expansion or hire additional resources. Manufacturing targets 80-90%. Service businesses aim for 75-85%. Maintain 10-15% buffer for demand fluctuations and maintenance',
    formula: '(Actual Output / Maximum Possible Output) × 100',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 92
    },
    icon: Gauge,
    tags: ['capacity', 'utilization', 'efficiency', 'production', 'operations'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-revenue-per-employee',
    name: 'Revenue Per Employee',
    plainName: 'How Much Revenue Each Team Member Generates',
    function: 'DELIVER',
    category: 'Operations',
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
    description: 'Total revenue divided by number of full-time equivalent employees',
    whyItMatters: 'Measures overall team productivity and operational efficiency. Higher numbers indicate better leverage of human capital',
    actionToTake: 'Compare to industry benchmarks. If low, focus on automation, process improvement, or premium pricing. Track trends over time as you scale. Service businesses target $150K-$250K. Manufacturing varies widely by industry ($100K-$500K)',
    formula: 'Total Revenue / Number of FTE Employees',
    benchmarks: {
      poor: 100000,
      average: 150000,
      good: 200000,
      excellent: 300000
    },
    icon: DollarSign,
    tags: ['revenue', 'productivity', 'efficiency', 'per-employee', 'operations'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-bench-time-percentage',
    name: 'Bench Time Percentage',
    plainName: 'Percentage of Team Between Projects',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'recommended',
    industries: [
      'professional-services',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of team members not currently assigned to billable projects',
    whyItMatters: 'Measures unutilized capacity and forecasting accuracy. High bench time indicates sales pipeline issues or poor resource planning',
    actionToTake: 'If above 15%, accelerate sales or reduce headcount. Use bench time for training, internal projects, or business development. Track by skill set to identify hiring mismatches. Maintain 5-10% bench time for flexibility',
    formula: '(Employees on Bench / Total Employees) × 100',
    benchmarks: {
      poor: 25,
      average: 15,
      good: 10,
      excellent: 5
    },
    icon: Users,
    tags: ['bench-time', 'utilization', 'resource-management', 'capacity', 'staffing'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-labor-productivity-index',
    name: 'Labor Productivity Index',
    plainName: 'How Much Output Your Team Produces Per Hour',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'operations-logistics',
      'retail-ecommerce',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Units of output produced per labor hour worked',
    whyItMatters: 'Core operational efficiency metric. Improvements directly reduce labor costs and increase profitability. Tracks impact of training, tools, and process improvements',
    actionToTake: 'Set baseline and track monthly trends. Investigate drops immediately. Use to evaluate equipment investments, training programs, and process changes. Aim for 5-10% annual improvement',
    formula: 'Total Units Produced / Total Labor Hours',
    benchmarks: {
      poor: 0.8,
      average: 1.0,
      good: 1.2,
      excellent: 1.5
    },
    icon: TrendingUp,
    tags: ['productivity', 'efficiency', 'labor', 'output', 'operations'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== THROUGHPUT & CYCLE TIME ====================
  {
    id: 'deliver-operations-cycle-time',
    name: 'Cycle Time',
    plainName: 'How Long It Takes to Complete Work From Start to Finish',
    function: 'DELIVER',
    category: 'Operations',
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
    unit: 'days',
    frequency: 'weekly',
    description: 'Average time from work initiation to completion',
    whyItMatters: 'Faster cycle times mean happier customers, lower work-in-progress costs, and higher throughput. Long cycle times indicate bottlenecks or inefficiencies',
    actionToTake: 'Track by project type and complexity. Identify bottlenecks causing delays. Set targets for different work types and monitor trends. Reduce by 10-20% year-over-year',
    formula: 'Sum of (Completion Date - Start Date) / Number of Items',
    benchmarks: {
      poor: 30,
      average: 20,
      good: 14,
      excellent: 7
    },
    icon: Clock,
    tags: ['cycle-time', 'efficiency', 'throughput', 'speed', 'delivery'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-throughput-rate',
    name: 'Throughput Rate',
    plainName: 'How Many Units You Complete Per Time Period',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'essential',
    industries: [
      'retail-ecommerce',
      'operations-logistics',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'daily',
    description: 'Number of units, orders, or projects completed per day/week/month',
    whyItMatters: 'Direct measure of operational capacity and efficiency. Increases in throughput without quality loss indicate process improvements',
    actionToTake: 'Track daily and weekly patterns. Compare to demand forecasts. Use to plan capacity expansions and identify peak periods. Target 10-15% year-over-year improvement',
    formula: 'Total Completed Units / Time Period',
    benchmarks: {
      poor: 0.8,
      average: 1.0,
      good: 1.25,
      excellent: 1.5
    },
    icon: Zap,
    tags: ['throughput', 'productivity', 'output', 'volume', 'capacity'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-lead-time',
    name: 'Lead Time',
    plainName: 'Time From Customer Order to Delivery',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'operations-logistics',
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
    unit: 'days',
    frequency: 'weekly',
    description: 'Total time from customer order placement to product/service delivery',
    whyItMatters: 'Critical customer satisfaction metric. Shorter lead times are competitive advantages. Long lead times increase cancellation risk and customer dissatisfaction',
    actionToTake: 'Break down into components: order processing, production, shipping. Identify longest delays. Communicate realistic timeframes to customers. Match or beat competitor lead times',
    formula: 'Average (Delivery Date - Order Date)',
    benchmarks: {
      poor: 21,
      average: 14,
      good: 7,
      excellent: 3
    },
    icon: Timer,
    tags: ['lead-time', 'delivery', 'customer-satisfaction', 'speed', 'fulfillment'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-work-in-progress',
    name: 'Work In Progress (WIP)',
    plainName: 'Number of Active Projects or Orders Being Worked On',
    function: 'DELIVER',
    category: 'Operations',
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
    description: 'Number of items currently in the production or delivery process',
    whyItMatters: 'High WIP ties up capital, increases cycle time, and hides problems. Lower WIP improves flow and reveals bottlenecks',
    actionToTake: 'Apply WIP limits to improve flow. If WIP is rising, stop starting new work and focus on finishing. Track WIP by stage to identify bottlenecks. Set WIP limits based on team capacity. Aim to reduce WIP by 20-30% while maintaining throughput',
    formula: 'Count of Active Items in Process',
    benchmarks: {
      poor: 50,
      average: 30,
      good: 20,
      excellent: 10
    },
    icon: Layers,
    tags: ['wip', 'work-in-progress', 'flow', 'efficiency', 'lean'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-takt-time',
    name: 'Takt Time',
    plainName: 'The Pace At Which You Need to Produce to Meet Demand',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'advanced',
    industries: [
      'construction-trades',
      'operations-logistics',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'minutes',
    frequency: 'daily',
    description: 'Available production time divided by customer demand rate',
    whyItMatters: 'Synchronizes production pace with customer demand. Prevents overproduction and helps balance workflow across process steps',
    actionToTake: 'Compare actual cycle time to takt time. If cycle time > takt time, you\'re falling behind demand. Balance workstations to match takt time. Adjust capacity or demand as needed',
    formula: 'Available Production Time / Customer Demand',
    benchmarks: {
      poor: 20,
      average: 15,
      good: 10,
      excellent: 8
    },
    icon: Activity,
    tags: ['takt-time', 'lean', 'manufacturing', 'demand', 'production-planning'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== PROJECT MANAGEMENT ====================
  {
    id: 'deliver-operations-schedule-variance',
    name: 'Schedule Variance',
    plainName: 'How Far Ahead or Behind Schedule Your Projects Are',
    function: 'DELIVER',
    category: 'Operations',
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
    frequency: 'weekly',
    description: 'Difference between planned and actual project completion dates',
    whyItMatters: 'Late projects damage customer relationships, reduce profitability, and indicate poor planning or execution. Positive variance means ahead of schedule',
    actionToTake: 'Track by project manager and project type. If consistently negative, improve estimation, add buffers, or address resource constraints. Target ±5% variance. Use historical data to refine planning',
    formula: '((Planned Completion - Actual Completion) / Planned Duration) × 100',
    benchmarks: {
      poor: -20,
      average: -5,
      good: 0,
      excellent: 5
    },
    icon: Calendar,
    tags: ['schedule-variance', 'project-management', 'delivery', 'planning', 'timeliness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-budget-variance',
    name: 'Budget Variance',
    plainName: 'How Much Projects Are Over or Under Budget',
    function: 'DELIVER',
    category: 'Operations',
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
    description: 'Difference between budgeted and actual project costs',
    whyItMatters: 'Directly impacts profitability. Consistent overruns indicate poor estimation or scope creep. Must be tracked to maintain healthy margins',
    actionToTake: 'Analyze variance by category: labor, materials, overhead. If consistently negative, improve estimation or implement change order processes. Target ±5% variance. Build 10-15% contingency into estimates',
    formula: '((Budgeted Cost - Actual Cost) / Budgeted Cost) × 100',
    benchmarks: {
      poor: -15,
      average: -5,
      good: 0,
      excellent: 5
    },
    icon: DollarSign,
    tags: ['budget-variance', 'project-management', 'profitability', 'cost-control', 'planning'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-scope-creep-rate',
    name: 'Scope Creep Rate',
    plainName: 'How Often Projects Expand Beyond Original Agreement',
    function: 'DELIVER',
    category: 'Operations',
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
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of projects that experience scope changes without corresponding budget or timeline adjustments',
    whyItMatters: 'Scope creep kills profitability and creates customer expectation problems. Unmanaged scope changes are a major cause of project losses',
    actionToTake: 'Implement formal change order process. Track scope changes by client and project manager. Target under 20%. Require written approval for scope changes. Train project managers on scope management',
    formula: '(Projects with Scope Changes / Total Projects) × 100',
    benchmarks: {
      poor: 60,
      average: 40,
      good: 20,
      excellent: 10
    },
    icon: AlertTriangle,
    tags: ['scope-creep', 'project-management', 'change-management', 'profitability', 'control'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-project-completion-rate',
    name: 'Project Completion Rate',
    plainName: 'Percentage of Projects Completed On Time and On Budget',
    function: 'DELIVER',
    category: 'Operations',
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
    description: 'Percentage of projects delivered on time and within budget',
    whyItMatters: 'Composite measure of operational excellence. Low rates indicate systemic issues in planning, execution, or resource management',
    actionToTake: 'Track by project manager, client, and project type. Identify patterns in late or over-budget projects. Target 80%+ completion rate. Investigate all failures for root causes. Improve estimation and planning based on lessons learned',
    formula: '(Projects Completed On Time & Budget / Total Completed Projects) × 100',
    benchmarks: {
      poor: 50,
      average: 65,
      good: 80,
      excellent: 90
    },
    icon: CheckCircle2,
    tags: ['project-completion', 'delivery', 'on-time', 'on-budget', 'success-rate'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-earned-value-index',
    name: 'Earned Value Index (EVI)',
    plainName: 'Overall Project Performance Score',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'advanced',
    industries: [
      'construction-trades',
      'professional-services',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'ratio',
    frequency: 'monthly',
    description: 'Combined measure of schedule and cost performance using earned value management',
    whyItMatters: 'Sophisticated project health indicator. Values below 1.0 indicate behind schedule or over budget. Enables early warning of project problems',
    actionToTake: 'Calculate monthly for major projects. EVI < 0.9 requires corrective action. Use to forecast final project costs and completion dates. Target EVI ≥ 1.0. Implement corrective actions when EVI drops below 0.95',
    formula: '(Earned Value / (Actual Cost + (Budgeted Cost - Earned Value)))',
    benchmarks: {
      poor: 0.8,
      average: 0.9,
      good: 1.0,
      excellent: 1.1
    },
    icon: Target,
    tags: ['earned-value', 'project-management', 'performance', 'forecasting', 'advanced'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== DELIVERY METRICS ====================
  {
    id: 'deliver-operations-on-time-delivery-rate',
    name: 'On-Time Delivery Rate',
    plainName: 'Percentage of Deliveries Made By Promised Date',
    function: 'DELIVER',
    category: 'Operations',
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
    description: 'Percentage of orders or projects delivered by the committed date',
    whyItMatters: 'Primary customer satisfaction and reliability metric. Late deliveries damage reputation, increase support costs, and reduce repeat business',
    actionToTake: 'Track by product line, customer segment, and delivery method. Root cause analysis on all late deliveries. Set realistic commitments. Target 95%+ for competitive advantage. Communicate proactively when delays are unavoidable',
    formula: '(On-Time Deliveries / Total Deliveries) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 92,
      excellent: 98
    },
    icon: CheckCircle2,
    tags: ['on-time', 'delivery', 'reliability', 'customer-satisfaction', 'performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-perfect-order-rate',
    name: 'Perfect Order Rate',
    plainName: 'Percentage of Orders Delivered Complete, On-Time, and Damage-Free',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'operations-logistics',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of orders with no errors: complete, on-time, undamaged, with correct documentation',
    whyItMatters: 'Comprehensive operational excellence metric. Even small error rates compound to significant customer dissatisfaction and costs',
    actionToTake: 'Track each failure type separately: late, incomplete, damaged, wrong item. Focus improvement efforts on largest failure categories. World-class is 95%+. Investigate every imperfect order for patterns',
    formula: '(Perfect Orders / Total Orders) × 100',
    benchmarks: {
      poor: 80,
      average: 88,
      good: 94,
      excellent: 98
    },
    icon: Award,
    tags: ['perfect-order', 'quality', 'delivery', 'excellence', 'customer-satisfaction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-order-fill-rate',
    name: 'Order Fill Rate',
    plainName: 'Percentage of Customer Orders Fulfilled Completely',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'operations-logistics',
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
    frequency: 'daily',
    description: 'Percentage of customer orders filled completely from available inventory',
    whyItMatters: 'Measures inventory availability and customer satisfaction. Low fill rates cause split shipments, delays, and lost sales',
    actionToTake: 'Track by product SKU and category. Low fill rates indicate inventory management issues. Target 95%+ for customer satisfaction. Use safety stock for high-demand items. Improve forecasting to reduce stockouts',
    formula: '(Orders Filled Completely / Total Orders) × 100',
    benchmarks: {
      poor: 85,
      average: 92,
      good: 96,
      excellent: 99
    },
    icon: Package,
    tags: ['fill-rate', 'inventory', 'availability', 'customer-satisfaction', 'stockout'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-delivery-accuracy',
    name: 'Delivery Accuracy',
    plainName: 'Percentage of Deliveries With Correct Items and Quantities',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'essential',
    industries: [
      'retail-ecommerce',
      'operations-logistics',
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
    description: 'Percentage of deliveries with correct products, quantities, and documentation',
    whyItMatters: 'Errors cost money in returns, re-shipments, and customer service. High accuracy builds trust and reduces operational costs',
    actionToTake: 'Track error types: wrong item, wrong quantity, missing items. Implement pick-and-pack verification. Use barcode scanning. Target 98%+. Implement quality checks at packing',
    formula: '(Accurate Deliveries / Total Deliveries) × 100',
    benchmarks: {
      poor: 90,
      average: 95,
      good: 98,
      excellent: 99.5
    },
    icon: Target,
    tags: ['accuracy', 'quality', 'delivery', 'error-rate', 'fulfillment'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-backlog-ratio',
    name: 'Backlog Ratio',
    plainName: 'Months of Work Currently Waiting to Be Done',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'recommended',
    industries: [
      'professional-services',
      'construction-trades',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Ratio of backlog value to current monthly revenue (months of work in backlog)',
    whyItMatters: 'Indicates demand health and capacity planning needs. Too low means potential revenue gaps; too high means long wait times and delivery risk',
    actionToTake: 'Track trends monthly. Rising backlog suggests capacity constraints. Falling backlog may indicate sales slowdown. Use for hiring and capacity decisions. Target 4-8 months for services. Above 12 months requires capacity expansion',
    formula: 'Total Backlog Value / Average Monthly Revenue',
    benchmarks: {
      poor: 2,
      average: 4,
      good: 6,
      excellent: 8
    },
    icon: Briefcase,
    tags: ['backlog', 'pipeline', 'demand', 'capacity-planning', 'revenue-visibility'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== RESOURCE ALLOCATION ====================
  {
    id: 'deliver-operations-resource-allocation-efficiency',
    name: 'Resource Allocation Efficiency',
    plainName: 'How Well You Match Resources to Project Needs',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'advanced',
    industries: [
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
    frequency: 'monthly',
    description: 'Percentage of time resources are optimally matched to project requirements (skill, seniority, location)',
    whyItMatters: 'Optimal resource allocation improves project outcomes and team satisfaction. Poor matching causes delays, quality issues, and employee frustration',
    actionToTake: 'Track skill mismatches and over/under-qualification. Use for hiring decisions and skill development planning. Target 85%+ optimal allocation. Build skill matrices',
    formula: '(Optimally Allocated Hours / Total Allocated Hours) × 100',
    benchmarks: {
      poor: 65,
      average: 75,
      good: 85,
      excellent: 92
    },
    icon: Users,
    tags: ['resource-allocation', 'efficiency', 'utilization', 'skill-matching', 'optimization'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-overtime-percentage',
    name: 'Overtime Percentage',
    plainName: 'Percentage of Total Hours Worked as Overtime',
    function: 'DELIVER',
    category: 'Operations',
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
    description: 'Percentage of total labor hours worked beyond standard hours',
    whyItMatters: 'High overtime indicates understaffing, poor planning, or unrealistic commitments. Leads to burnout, quality issues, and increased labor costs',
    actionToTake: 'Track by department and individual. Consistent overtime above 10% requires hiring or workload redistribution. Target under 5%. Hire or redistribute work when consistently above 8%',
    formula: '(Overtime Hours / Total Hours Worked) × 100',
    benchmarks: {
      poor: 20,
      average: 10,
      good: 5,
      excellent: 2
    },
    icon: Clock,
    tags: ['overtime', 'workload', 'capacity', 'burnout', 'staffing'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-capacity-buffer',
    name: 'Capacity Buffer',
    plainName: 'Percentage of Capacity Held in Reserve for Unexpected Demand',
    function: 'DELIVER',
    category: 'Operations',
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
    description: 'Percentage of total capacity intentionally kept available for urgent requests and demand fluctuations',
    whyItMatters: 'Enables responsiveness to urgent customer needs and market opportunities. Too low causes service failures; too high wastes resources',
    actionToTake: 'Adjust buffer based on demand variability and strategic importance of rapid response. Track buffer usage to optimize level. Maintain 10-15% buffer for most businesses',
    formula: '((Total Capacity - Planned Utilization) / Total Capacity) × 100',
    benchmarks: {
      poor: 5,
      average: 10,
      good: 15,
      excellent: 20
    },
    icon: Gauge,
    tags: ['capacity-buffer', 'flexibility', 'capacity-planning', 'responsiveness', 'reserve'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-multitasking-index',
    name: 'Multitasking Index',
    plainName: 'Average Number of Concurrent Projects Per Team Member',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'advanced',
    industries: [
      'professional-services',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'weekly',
    description: 'Average number of active projects or tasks each team member is working on simultaneously',
    whyItMatters: 'High multitasking reduces productivity through context switching. Lower numbers improve focus, quality, and completion speed',
    actionToTake: 'Limit work in progress per person. Aim for 1-2 concurrent projects for knowledge work. More than 3 significantly reduces effectiveness. Target 1-2 concurrent projects for focused work',
    formula: 'Total Active Assignments / Number of Team Members',
    benchmarks: {
      poor: 5,
      average: 3,
      good: 2,
      excellent: 1.5
    },
    icon: GitBranch,
    tags: ['multitasking', 'focus', 'productivity', 'wip', 'context-switching'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-operations-first-pass-yield',
    name: 'First Pass Yield',
    plainName: 'Percentage of Work Completed Right the First Time',
    function: 'DELIVER',
    category: 'Operations',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of units or deliverables that pass inspection or acceptance without requiring rework',
    whyItMatters: 'Rework is pure waste - it costs time and money without adding value. High first-pass yield indicates good processes and quality focus',
    actionToTake: 'Track by process step, team, and product type. Low yield points to training needs, process problems, or quality issues. Focus improvement on lowest-yield areas. Target 90%+ first-pass yield. Investigate every failure for root causes',
    formula: '(Units Accepted First Time / Total Units Produced) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 93,
      excellent: 98
    },
    icon: CheckCircle2,
    tags: ['first-pass-yield', 'quality', 'rework', 'efficiency', 'waste-reduction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]