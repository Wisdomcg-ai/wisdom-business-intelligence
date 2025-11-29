// src/lib/kpi/data/functions/systems.ts

/**
 * SYSTEMS Function - Process Efficiency & Automation KPIs
 * Focus: Process optimization, automation, quality control, and operational efficiency
 * Total: 25 KPIs across process management, automation, quality, and documentation
 * All IDs prefixed with 'systems-' to prevent conflicts
 */

import { KPIDefinition } from '../../types'
import {
  Settings,
  Zap,
  Clock,
  Target,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Cpu,
  GitBranch,
  Gauge,
  FileText,
  Repeat,
  Award,
  Shield,
  Timer,
  Workflow,
  LineChart,
  DollarSign,
  Users,
  BookOpen,
  Layers,
  Database,
  Calendar  
} from 'lucide-react'

export const systemsKPIs: KPIDefinition[] = [
  // ==================== PROCESS EFFICIENCY ====================
  {
    id: 'systems-process-cycle-time',
    name: 'Process Cycle Time',
    plainName: 'How Long Processes Take',
    function: 'SYSTEMS',
    category: 'Process Efficiency',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'weekly',
    description: 'Average time from process start to completion',
    whyItMatters: 'Faster processes mean more capacity, happier customers, and lower costs',
    actionToTake: 'Measure each major process. Target 20% reduction per quarter through improvements',
    formula: 'Average time from process start to finish',
    benchmarks: {
      poor: 120,
      average: 72,
      good: 48,
      excellent: 24
    },
    icon: Clock,
    tags: ['cycle-time', 'efficiency', 'speed', 'throughput'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-lead-time',
    name: 'Lead Time',
    plainName: 'Order to Delivery Time',
    function: 'SYSTEMS',
    category: 'Process Efficiency',
    tier: 'essential',
    industries: [
      'retail-ecommerce',
      'construction-trades',
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
    unit: 'days',
    frequency: 'weekly',
    description: 'Time from customer order to delivery or completion',
    whyItMatters: 'Customers want it fast - shorter lead times win more business and improve cash flow',
    actionToTake: 'Target 30% reduction year-over-year. Map the process and remove delays',
    formula: 'Average days from order received to delivery',
    benchmarks: {
      poor: 30,
      average: 15,
      good: 7,
      excellent: 3
    },
    icon: Timer,
    tags: ['lead-time', 'delivery-speed', 'customer-experience', 'throughput'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-throughput-rate',
    name: 'Throughput Rate',
    plainName: 'Units Processed Per Period',
    function: 'SYSTEMS',
    category: 'Process Efficiency',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'operations-logistics',
      'construction-trades',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'units',
    frequency: 'daily',
    description: 'Number of units, orders, or tasks completed per time period',
    whyItMatters: 'Shows capacity and productivity - higher throughput means more revenue potential',
    actionToTake: 'Track daily. Any downward trend? Check for bottlenecks or quality issues',
    formula: 'Total units completed / Time period',
    benchmarks: {
      poor: 50,
      average: 100,
      good: 200,
      excellent: 400
    },
    icon: Activity,
    tags: ['throughput', 'capacity', 'productivity', 'output'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-bottleneck-impact',
    name: 'Bottleneck Impact',
    plainName: 'Slowest Step Affecting Output',
    function: 'SYSTEMS',
    category: 'Process Efficiency',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of capacity lost due to the slowest process step',
    whyItMatters: 'Bottlenecks limit your entire operation - fix them to unlock massive capacity',
    actionToTake: 'Identify bottleneck weekly. Allocate resources to eliminate it before optimizing other steps',
    formula: '((Max Capacity - Actual Output) / Max Capacity) × 100',
    benchmarks: {
      poor: 40,
      average: 25,
      good: 15,
      excellent: 5
    },
    icon: AlertCircle,
    tags: ['bottleneck', 'constraint', 'capacity', 'optimization'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== QUALITY & ERROR RATES ====================
  {
    id: 'systems-error-rate',
    name: 'Error Rate',
    plainName: 'Percentage of Mistakes',
    function: 'SYSTEMS',
    category: 'Quality Control',
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
    description: 'Percentage of work that contains errors or defects',
    whyItMatters: 'Errors cost double - once to do wrong, once to fix - and damage reputation',
    actionToTake: 'Above 5%? Implement checklists and standard operating procedures immediately',
    formula: '(Errors or Defects / Total Units) × 100',
    benchmarks: {
      poor: 10,
      average: 5,
      good: 2,
      excellent: 0.5
    },
    icon: AlertCircle,
    tags: ['quality', 'errors', 'defects', 'accuracy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-first-time-right',
    name: 'First Time Right Rate',
    plainName: 'Work Done Correctly First Time',
    function: 'SYSTEMS',
    category: 'Quality Control',
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
    frequency: 'weekly',
    description: 'Percentage of work completed correctly without rework',
    whyItMatters: 'Rework destroys profitability - every redo is pure lost money',
    actionToTake: 'Target 95%+. Document best practices and create quality checklists',
    formula: '(Work Without Rework / Total Work) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 92,
      excellent: 97
    },
    icon: CheckCircle,
    tags: ['quality', 'first-time-right', 'rework', 'accuracy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-rework-cost',
    name: 'Rework Cost Percentage',
    plainName: 'Cost of Fixing Mistakes',
    function: 'SYSTEMS',
    category: 'Quality Control',
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
    description: 'Cost of rework as percentage of total revenue',
    whyItMatters: 'Hidden profit killer - rework can eat 10-20% of revenue without you noticing',
    actionToTake: 'Above 5%? Track causes, implement prevention, and train team on quality',
    formula: '(Rework Costs / Total Revenue) × 100',
    benchmarks: {
      poor: 15,
      average: 8,
      good: 3,
      excellent: 1
    },
    icon: DollarSign,
    tags: ['rework', 'quality-cost', 'waste', 'profitability'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-defect-escape-rate',
    name: 'Defect Escape Rate',
    plainName: 'Problems Reaching Customers',
    function: 'SYSTEMS',
    category: 'Quality Control',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of defects that reach customers instead of being caught internally',
    whyItMatters: 'Customer-discovered defects damage reputation 10x more than internal catches',
    actionToTake: 'Above 2%? Add quality checkpoints before customer delivery',
    formula: '(Customer-Reported Defects / Total Defects) × 100',
    benchmarks: {
      poor: 20,
      average: 10,
      good: 5,
      excellent: 1
    },
    icon: Shield,
    tags: ['quality', 'customer-defects', 'quality-assurance', 'prevention'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== AUTOMATION & TECHNOLOGY ====================
  {
    id: 'systems-automation-rate',
    name: 'Automation Rate',
    plainName: 'Work Done by Systems vs Humans',
    function: 'SYSTEMS',
    category: 'Automation',
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
    description: 'Percentage of repetitive tasks that are automated',
    whyItMatters: 'Automation frees your team for high-value work and scales without adding headcount',
    actionToTake: 'Below 30%? List repetitive tasks and prioritize automation opportunities',
    formula: '(Automated Tasks / Total Repetitive Tasks) × 100',
    benchmarks: {
      poor: 10,
      average: 30,
      good: 50,
      excellent: 75
    },
    icon: Zap,
    tags: ['automation', 'technology', 'efficiency', 'scaling'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-system-uptime',
    name: 'System Uptime',
    plainName: 'Technology Working Time',
    function: 'SYSTEMS',
    category: 'Technology',
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
    description: 'Percentage of time critical systems are operational',
    whyItMatters: 'Downtime = lost revenue, frustrated team, and angry customers',
    actionToTake: 'Target 99.5%+. Below 95%? Invest in better infrastructure or redundancy',
    formula: '(System Uptime Hours / Total Hours) × 100',
    benchmarks: {
      poor: 90,
      average: 95,
      good: 98,
      excellent: 99.5
    },
    icon: Cpu,
    tags: ['uptime', 'reliability', 'technology', 'infrastructure'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-integration-score',
    name: 'System Integration Score',
    plainName: 'How Well Systems Talk Together',
    function: 'SYSTEMS',
    category: 'Technology',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of business systems that are integrated vs manual data transfer',
    whyItMatters: 'Manual data transfer wastes time and creates errors - integration saves hours daily',
    actionToTake: 'Below 60%? Prioritize integrating high-volume data flows first',
    formula: '(Integrated Systems / Total Systems) × 100',
    benchmarks: {
      poor: 30,
      average: 50,
      good: 70,
      excellent: 90
    },
    icon: GitBranch,
    tags: ['integration', 'systems', 'automation', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-digital-adoption',
    name: 'Digital Adoption Rate',
    plainName: 'Team Using Digital Tools Properly',
    function: 'SYSTEMS',
    category: 'Technology',
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
    description: 'Percentage of team actively using core digital systems correctly',
    whyItMatters: 'Technology only helps if people use it - unused tools are wasted money',
    actionToTake: 'Below 80%? Improve training, simplify tools, or remove unused systems',
    formula: '(Active Users / Total Users) × 100',
    benchmarks: {
      poor: 50,
      average: 70,
      good: 85,
      excellent: 95
    },
    icon: Users,
    tags: ['adoption', 'training', 'change-management', 'technology'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== DOCUMENTATION & STANDARDIZATION ====================
  {
    id: 'systems-process-documentation',
    name: 'Process Documentation Rate',
    plainName: 'Processes That Are Written Down',
    function: 'SYSTEMS',
    category: 'Documentation',
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
    frequency: 'quarterly',
    description: 'Percentage of core processes that have documented procedures',
    whyItMatters: 'Undocumented processes live in people\'s heads - document them to scale and reduce errors',
    actionToTake: 'Below 70%? Document your top 5 processes immediately using simple checklists',
    formula: '(Documented Processes / Total Core Processes) × 100',
    benchmarks: {
      poor: 30,
      average: 55,
      good: 75,
      excellent: 95
    },
    icon: FileText,
    tags: ['documentation', 'sop', 'procedures', 'knowledge'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-sop-compliance',
    name: 'SOP Compliance Rate',
    plainName: 'Following Standard Procedures',
    function: 'SYSTEMS',
    category: 'Documentation',
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
    description: 'Percentage of time team follows documented standard operating procedures',
    whyItMatters: 'SOPs only work if people follow them - non-compliance leads to errors and inconsistency',
    actionToTake: 'Below 80%? SOPs may be too complex, outdated, or team needs training',
    formula: '(Compliant Actions / Total Actions) × 100',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 95
    },
    icon: CheckCircle,
    tags: ['compliance', 'sop', 'procedures', 'standards'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-knowledge-retention',
    name: 'Knowledge Retention Score',
    plainName: 'Critical Knowledge Documented',
    function: 'SYSTEMS',
    category: 'Documentation',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of critical business knowledge captured in systems vs individual heads',
    whyItMatters: 'When people leave, undocumented knowledge leaves with them - huge risk',
    actionToTake: 'Below 70%? Document expertise from key people and create knowledge base',
    formula: '(Documented Knowledge Items / Total Critical Knowledge) × 100',
    benchmarks: {
      poor: 40,
      average: 60,
      good: 80,
      excellent: 95
    },
    icon: Database,
    tags: ['knowledge-management', 'documentation', 'risk', 'continuity'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== CONTINUOUS IMPROVEMENT ====================
  {
    id: 'systems-improvement-rate',
    name: 'Process Improvement Rate',
    plainName: 'Speed of Getting Better',
    function: 'SYSTEMS',
    category: 'Continuous Improvement',
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
    description: 'Percentage improvement in efficiency or quality quarter-over-quarter',
    whyItMatters: 'Continuous improvement compounds - 10% quarterly = 46% annual improvement',
    actionToTake: 'Target 5-10% quarterly. Track specific metrics and run improvement experiments',
    formula: '((Current Performance - Previous Performance) / Previous Performance) × 100',
    benchmarks: {
      poor: 2,
      average: 5,
      good: 10,
      excellent: 15
    },
    icon: TrendingUp,
    tags: ['improvement', 'kaizen', 'optimization', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-improvement-ideas-implemented',
    name: 'Improvement Ideas Implemented',
    plainName: 'Team Suggestions Actually Done',
    function: 'SYSTEMS',
    category: 'Continuous Improvement',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of employee improvement suggestions that are implemented',
    whyItMatters: 'Team sees the problems daily - implementing their ideas drives engagement and improvement',
    actionToTake: 'Below 40%? Create simple submission process and act on ideas monthly',
    formula: '(Ideas Implemented / Total Ideas Submitted) × 100',
    benchmarks: {
      poor: 20,
      average: 35,
      good: 50,
      excellent: 70
    },
    icon: Award,
    tags: ['kaizen', 'employee-engagement', 'innovation', 'improvement'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-waste-reduction',
    name: 'Waste Reduction Rate',
    plainName: 'Eliminating Non-Value Work',
    function: 'SYSTEMS',
    category: 'Continuous Improvement',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Reduction in waste, rework, or non-value-added activities',
    whyItMatters: 'Eliminating waste directly increases profit without increasing revenue',
    actionToTake: 'Map processes to identify waste. Target 20% reduction annually',
    formula: '((Previous Waste - Current Waste) / Previous Waste) × 100',
    benchmarks: {
      poor: 5,
      average: 10,
      good: 20,
      excellent: 35
    },
    icon: TrendingDown,
    tags: ['waste', 'lean', 'efficiency', 'cost-reduction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== CAPACITY & PLANNING ====================
  {
    id: 'systems-capacity-utilization',
    name: 'Capacity Utilization',
    plainName: 'How Much Capacity You Use',
    function: 'SYSTEMS',
    category: 'Capacity Planning',
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
    frequency: 'weekly',
    description: 'Percentage of available capacity being utilized',
    whyItMatters: 'Too low wastes resources. Too high risks quality and burnout. Sweet spot is 75-85%',
    actionToTake: 'Above 90%? Add capacity. Below 65%? Increase sales or reduce capacity',
    formula: '(Actual Output / Maximum Capacity) × 100',
    benchmarks: {
      poor: 50,
      average: 70,
      good: 80,
      excellent: 85
    },
    icon: Gauge,
    tags: ['capacity', 'utilization', 'efficiency', 'planning'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-on-time-delivery',
    name: 'On-Time Delivery Rate',
    plainName: 'Promises Kept',
    function: 'SYSTEMS',
    category: 'Reliability',
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
    description: 'Percentage of deliveries or completions that meet promised deadlines',
    whyItMatters: 'Late delivery destroys trust and reputation - customers remember broken promises',
    actionToTake: 'Target 95%+. Below 90%? Add buffer time or fix bottlenecks',
    formula: '(On-Time Deliveries / Total Deliveries) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 92,
      excellent: 97
    },
    icon: Target,
    tags: ['on-time', 'delivery', 'reliability', 'promises'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-schedule-adherence',
    name: 'Schedule Adherence',
    plainName: 'Sticking to the Plan',
    function: 'SYSTEMS',
    category: 'Reliability',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'operations-logistics',
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
    frequency: 'weekly',
    description: 'Percentage of scheduled tasks completed on schedule',
    whyItMatters: 'Poor schedule adherence cascades delays through your entire operation',
    actionToTake: 'Below 85%? Review scheduling assumptions and add realistic buffers',
    formula: '(Tasks Completed On Schedule / Total Scheduled Tasks) × 100',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 90,
      excellent: 95
    },
    icon: Calendar,
    tags: ['schedule', 'planning', 'reliability', 'project-management'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-on-budget-completion',
    name: 'On-Budget Completion Rate',
    plainName: 'Projects Within Budget',
    function: 'SYSTEMS',
    category: 'Financial Control',
    tier: 'recommended',
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
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of projects completed within original budget',
    whyItMatters: 'Budget overruns kill profitability - even if customer pays, you lose internally',
    actionToTake: 'Below 80%? Improve estimating accuracy or scope management',
    formula: '(Projects On Budget / Total Projects) × 100',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 92
    },
    icon: DollarSign,
    tags: ['budget', 'cost-control', 'project-management', 'profitability'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== STANDARDIZATION & CONSISTENCY ====================
  {
    id: 'systems-process-standardization',
    name: 'Process Standardization Score',
    plainName: 'Consistent Way of Doing Things',
    function: 'SYSTEMS',
    category: 'Standardization',
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
    description: 'Percentage of processes that follow standardized procedures across team',
    whyItMatters: 'Standardization enables training, scaling, and consistent quality',
    actionToTake: 'Target 80%+. Document top processes and train team on standards',
    formula: '(Standardized Processes / Total Processes) × 100',
    benchmarks: {
      poor: 40,
      average: 60,
      good: 80,
      excellent: 95
    },
    icon: Layers,
    tags: ['standardization', 'consistency', 'procedures', 'scaling'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-variation-reduction',
    name: 'Process Variation',
    plainName: 'Consistency of Results',
    function: 'SYSTEMS',
    category: 'Standardization',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Variation in process outputs (lower is better - measures consistency)',
    whyItMatters: 'High variation means unpredictable results - customers want consistency',
    actionToTake: 'Above 15%? Standardize procedures and train team thoroughly',
    formula: '(Standard Deviation / Mean) × 100',
    benchmarks: {
      poor: 30,
      average: 20,
      good: 10,
      excellent: 5
    },
    icon: BarChart3,
    tags: ['variation', 'consistency', 'quality', 'six-sigma'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== WORKFLOW & COORDINATION ====================
  {
    id: 'systems-handoff-efficiency',
    name: 'Handoff Efficiency',
    plainName: 'Smooth Transitions Between Steps',
    function: 'SYSTEMS',
    category: 'Workflow',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of process handoffs completed without delays or errors',
    whyItMatters: 'Handoffs between people/departments are where delays and errors happen most',
    actionToTake: 'Below 85%? Document handoff procedures and create clear ownership',
    formula: '(Clean Handoffs / Total Handoffs) × 100',
    benchmarks: {
      poor: 65,
      average: 75,
      good: 85,
      excellent: 95
    },
    icon: Workflow,
    tags: ['handoffs', 'workflow', 'coordination', 'communication'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'systems-resource-efficiency',
    name: 'Resource Efficiency Score',
    plainName: 'Getting Maximum from Resources',
    function: 'SYSTEMS',
    category: 'Efficiency',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'monthly',
    description: 'Overall efficiency score combining time, cost, and quality metrics',
    whyItMatters: 'Holistic view of operational excellence - tracks overall improvement',
    actionToTake: 'Calculate monthly. Target 10% improvement year-over-year',
    formula: 'Composite score from cycle time, cost efficiency, and quality metrics',
    benchmarks: {
      poor: 50,
      average: 65,
      good: 80,
      excellent: 92
    },
    icon: Award,
    tags: ['efficiency', 'resources', 'optimization', 'performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]