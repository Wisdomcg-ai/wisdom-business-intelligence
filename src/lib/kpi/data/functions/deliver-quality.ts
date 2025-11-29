// src/lib/kpi/data/functions/deliver-quality.ts

/**
 * DELIVER Business Function - Quality KPIs
 * Total: 15 KPIs
 * Covers: Quality metrics, defect rates, rework, customer-reported issues, compliance
 * 
 * ✅ FIXED: Uses 'function' instead of 'businessFunction'
 * ✅ FIXED: All IDs prefixed with 'deliver-quality-'
 * ✅ FIXED: String literals instead of enums
 * ✅ FIXED: Updated all property names to match new schema
 */

import { KPIDefinition } from '../../types'
import {
  Shield,
  AlertCircle,
  CheckCircle2,
  XCircle,
  TrendingDown,
  Award,
  Target,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  ThumbsUp,
  DollarSign,
  FileCheck,
  Star
} from 'lucide-react'

export const deliverQualityKPIs: KPIDefinition[] = [
  {
    id: 'deliver-quality-defect-rate',
    name: 'Defect Rate',
    plainName: 'Number of Defects Per Unit Produced',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'essential',
    industries: [
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
    frequency: 'weekly',
    description: 'Number of defects identified per unit, batch, or 1000 units produced',
    whyItMatters: 'Core quality metric that directly impacts customer satisfaction, warranty costs, and brand reputation. High defect rates indicate process or quality control issues',
    actionToTake: 'Track by product line, production shift, and team. Use Pareto analysis to focus on defects causing 80% of issues. Implement root cause analysis for recurring defects. Manufacturing targets <10 defects per 1000 units. Six Sigma targets 3.4 defects per million',
    formula: '(Total Defects Found / Total Units Produced) × 1000',
    benchmarks: {
      poor: 50,
      average: 20,
      good: 5,
      excellent: 1
    },
    icon: AlertCircle,
    tags: ['defect-rate', 'quality', 'defects', 'production', 'six-sigma'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-defect-density',
    name: 'Defect Density',
    plainName: 'Defects Found Per Size of Product or Code',
    function: 'DELIVER',
    category: 'Quality',
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
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of defects relative to the size of the product (e.g., per 1000 lines of code, per square foot, per kilogram)',
    whyItMatters: 'Normalizes defect counts across different sized products or projects. Enables fair comparison and trend analysis across varying scopes',
    actionToTake: 'Use to compare quality across projects of different sizes. Track trends over time. High density in specific modules indicates areas needing refactoring or redesign. Set baseline and target 20% annual improvement',
    formula: '(Total Defects / Size Metric) × 1000',
    benchmarks: {
      poor: 10,
      average: 5,
      good: 2,
      excellent: 0.5
    },
    icon: BarChart3,
    tags: ['defect-density', 'quality', 'defects', 'normalized', 'software'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-customer-reported-defects',
    name: 'Customer-Reported Defects',
    plainName: 'Number of Quality Issues Customers Find',
    function: 'DELIVER',
    category: 'Quality',
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
    description: 'Number of defects or quality issues reported by customers per time period or per unit sold',
    whyItMatters: 'Customer-found defects are far more costly than internal ones - they damage reputation, require support, and cause refunds or replacements. Critical customer satisfaction metric',
    actionToTake: 'Track severity and categorize by defect type. Compare to internal defect detection to measure inspection effectiveness. Use for product improvement roadmap. Target <5 per 1000 units sold. Ratio of customer-found to internal-found defects should be <1:10. Respond to all reports within 24 hours',
    formula: 'Count of Customer-Reported Defects / Time Period',
    benchmarks: {
      poor: 50,
      average: 20,
      good: 10,
      excellent: 2
    },
    icon: AlertTriangle,
    tags: ['customer-defects', 'quality', 'customer-satisfaction', 'issues', 'complaints'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-rework-rate',
    name: 'Rework Rate',
    plainName: 'Percentage of Work That Needs to Be Redone',
    function: 'DELIVER',
    category: 'Quality',
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
    description: 'Percentage of completed work that requires corrections, modifications, or redoing',
    whyItMatters: 'Rework is pure waste - adds cost and time without value. High rework rates indicate quality control failures, unclear requirements, or skill gaps',
    actionToTake: 'Track by team, project type, and root cause. Rework >15% requires immediate intervention. Focus on prevention through better processes and training. Target <10% rework rate. Manufacturing and construction aim for <5%. Each percentage point reduction significantly improves profitability',
    formula: '(Units Requiring Rework / Total Units Produced) × 100',
    benchmarks: {
      poor: 25,
      average: 15,
      good: 8,
      excellent: 3
    },
    icon: RefreshCw,
    tags: ['rework', 'quality', 'waste', 'efficiency', 'correction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-escape-rate',
    name: 'Quality Escape Rate',
    plainName: 'Percentage of Defects That Make It to Customers',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'health-wellness',
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
    frequency: 'monthly',
    description: 'Percentage of total defects that escape internal quality controls and reach customers',
    whyItMatters: 'Measures quality control effectiveness. High escape rates mean quality processes are failing to catch issues before delivery',
    actionToTake: 'Target escape rate <5%. Analyze which defect types escape most frequently. Strengthen inspection and testing for these areas. World-class is <5% escape rate. Means internal quality catches 95%+ of defects. Improve testing and inspection processes if above 10%',
    formula: '(Customer-Found Defects / Total Defects) × 100',
    benchmarks: {
      poor: 30,
      average: 15,
      good: 8,
      excellent: 3
    },
    icon: Shield,
    tags: ['quality-escape', 'effectiveness', 'defects', 'quality-control', 'inspection'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-return-rate',
    name: 'Return Rate',
    plainName: 'Percentage of Products Returned by Customers',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'essential',
    industries: [
      'retail-ecommerce',
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
    description: 'Percentage of sold products returned by customers',
    whyItMatters: 'Returns cost money in shipping, restocking, and lost sales. High return rates indicate quality issues, inaccurate descriptions, or unmet expectations',
    actionToTake: 'Categorize returns: defective, wrong item, didn\'t meet expectations, buyer\'s remorse. Focus improvement on defective returns. Track by product SKU. For quality issues specifically, target <5%. Electronics should be <3%',
    formula: '(Units Returned / Units Sold) × 100',
    benchmarks: {
      poor: 15,
      average: 8,
      good: 4,
      excellent: 2
    },
    icon: TrendingDown,
    tags: ['return-rate', 'quality', 'customer-satisfaction', 'defects', 'returns'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-warranty-claim-rate',
    name: 'Warranty Claim Rate',
    plainName: 'Percentage of Products With Warranty Claims',
    function: 'DELIVER',
    category: 'Quality',
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
    frequency: 'monthly',
    description: 'Percentage of sold units that result in warranty claims',
    whyItMatters: 'Warranty claims directly impact profitability and indicate product reliability. High claim rates suggest quality or design issues that need addressing',
    actionToTake: 'Track by product line, manufacturing date, and supplier. Analyze failure modes. Use data to improve product design and manufacturing processes. Target <2%. Build warranty reserve budget based on historical claim rates plus 20% buffer',
    formula: '(Warranty Claims / Units Sold) × 100',
    benchmarks: {
      poor: 8,
      average: 4,
      good: 2,
      excellent: 0.5
    },
    icon: FileCheck,
    tags: ['warranty', 'claims', 'quality', 'reliability', 'product-quality'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-mtbf',
    name: 'Mean Time Between Failures (MTBF)',
    plainName: 'Average Time a Product Works Before Failing',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'recommended',
    industries: [
      'health-wellness',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'monthly',
    description: 'Average operational time between product or system failures',
    whyItMatters: 'Key reliability metric. Higher MTBF means more reliable products, lower warranty costs, and higher customer satisfaction',
    actionToTake: 'Track by product model and component. Use to identify weak components. Set design targets. Compare to competitor specifications. Increase MTBF through better components and design',
    formula: 'Total Operating Time / Number of Failures',
    benchmarks: {
      poor: 5000,
      average: 15000,
      good: 30000,
      excellent: 50000
    },
    icon: Award,
    tags: ['mtbf', 'reliability', 'quality', 'failures', 'uptime'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-inspection-pass-rate',
    name: 'Inspection Pass Rate',
    plainName: 'Percentage of Products Passing Quality Inspection',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'essential',
    industries: [
      'construction-trades',
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
    frequency: 'daily',
    description: 'Percentage of units that pass quality inspection on first attempt',
    whyItMatters: 'Direct measure of production quality. Low pass rates indicate process issues, training needs, or equipment problems requiring immediate attention',
    actionToTake: 'Track by shift, operator, and product line. Investigate patterns in failures. Use for operator training and process improvement. Target 95%+ pass rate. Below 90% requires immediate root cause analysis',
    formula: '(Units Passing Inspection / Total Units Inspected) × 100',
    benchmarks: {
      poor: 85,
      average: 92,
      good: 96,
      excellent: 99
    },
    icon: CheckCircle2,
    tags: ['inspection', 'pass-rate', 'quality', 'qc', 'acceptance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-scrap-rate',
    name: 'Scrap Rate',
    plainName: 'Percentage of Materials or Products That Become Waste',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'recommended',
    industries: [
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
    description: 'Percentage of raw materials or finished goods that cannot be used and must be scrapped',
    whyItMatters: 'Scrap directly reduces profitability and indicates quality or process issues. High scrap rates waste materials, labor, and overhead',
    actionToTake: 'Track scrap by reason code: defects, damage, obsolescence, excess. Focus on largest categories. Calculate cost of scrap monthly. Manufacturing targets <3% scrap. Each percentage point reduction flows directly to bottom line. Investigate all scrap >$1000',
    formula: '(Scrap Value or Volume / Total Production Value or Volume) × 100',
    benchmarks: {
      poor: 8,
      average: 4,
      good: 2,
      excellent: 0.5
    },
    icon: XCircle,
    tags: ['scrap', 'waste', 'quality', 'efficiency', 'cost-reduction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-cost-ratio',
    name: 'Cost of Quality Ratio',
    plainName: 'Quality-Related Costs as Percentage of Sales',
    function: 'DELIVER',
    category: 'Quality',
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
    description: 'Total quality-related costs (prevention, appraisal, internal failure, external failure) as percentage of sales',
    whyItMatters: 'Shows total investment in and cost of quality. Optimal balance between prevention costs and failure costs maximizes profitability',
    actionToTake: 'Break down into 4 categories: prevention, appraisal, internal failure, external failure. Shift spending toward prevention to reduce failure costs. Target 10-15% of sales. High performers achieve <10%. Optimal mix: 50% prevention, 30% appraisal, 20% failures',
    formula: '(Total Quality Costs / Total Sales) × 100',
    benchmarks: {
      poor: 25,
      average: 15,
      good: 10,
      excellent: 5
    },
    icon: DollarSign,
    tags: ['cost-of-quality', 'quality-costs', 'financial', 'prevention', 'failure-costs'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-supplier-quality-rating',
    name: 'Supplier Quality Rating',
    plainName: 'Average Quality Score of Materials From Suppliers',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'recommended',
    industries: [
      'construction-trades',
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
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of supplier deliveries that meet quality standards on first receipt',
    whyItMatters: 'Supplier quality directly impacts your product quality. Poor supplier quality causes production delays, rework, and customer issues',
    actionToTake: 'Score each supplier monthly. Supplier <90% requires quality improvement plan. Below 80% for 2 months triggers supplier change. Require 95%+ quality from all suppliers. Develop top suppliers as partners. Audit low-performing suppliers quarterly',
    formula: '(Acceptable Deliveries / Total Deliveries) × 100',
    benchmarks: {
      poor: 85,
      average: 92,
      good: 96,
      excellent: 99
    },
    icon: Award,
    tags: ['supplier-quality', 'quality', 'vendor-management', 'incoming-quality', 'supply-chain'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-compliance-rate',
    name: 'Compliance Rate',
    plainName: 'Percentage of Time You Meet Regulatory Requirements',
    function: 'DELIVER',
    category: 'Quality',
    tier: 'essential',
    industries: [
      'health-wellness',
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
    description: 'Percentage of regulatory audits, inspections, or requirements that are met without deficiencies',
    whyItMatters: 'Non-compliance risks fines, shutdowns, and reputation damage. Critical for regulated industries. Must be near 100%',
    actionToTake: 'Track compliance by regulation type. Document all compliance activities. Conduct internal audits monthly. Address any deficiencies immediately. Target 100% compliance - non-negotiable for regulated industries. Build compliance into standard processes. Budget 2-5% of revenue for compliance',
    formula: '(Compliant Items / Total Required Items) × 100',
    benchmarks: {
      poor: 90,
      average: 96,
      good: 98,
      excellent: 100
    },
    icon: Shield,
    tags: ['compliance', 'regulatory', 'quality', 'audit', 'risk-management'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-audit-score',
    name: 'Quality Audit Score',
    plainName: 'Score From Internal or External Quality Audits',
    function: 'DELIVER',
    category: 'Quality',
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
    description: 'Average score from quality system audits (internal, customer, third-party)',
    whyItMatters: 'Comprehensive assessment of quality management system effectiveness. Low scores indicate systemic quality issues requiring management attention',
    actionToTake: 'Conduct internal audits monthly, external annually. Track trends and corrective actions. Score <85% requires immediate quality system review. Target 90%+ on all audits. Achieve ISO 9001 or industry-specific certification. Use audit findings to drive continuous improvement',
    formula: '(Points Achieved / Total Possible Points) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 92,
      excellent: 98
    },
    icon: FileCheck,
    tags: ['audit-score', 'quality', 'qms', 'certification', 'assessment'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-quality-customer-satisfaction',
    name: 'Customer Quality Satisfaction',
    plainName: 'How Satisfied Customers Are With Product Quality',
    function: 'DELIVER',
    category: 'Quality',
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
    description: 'Percentage of customers rating quality as "good" or "excellent" in surveys',
    whyItMatters: 'Customer perception of quality drives repeat purchases and referrals. Disconnect between internal metrics and customer perception requires investigation',
    actionToTake: 'Survey customers regularly on quality. Track by product line and customer segment. Low scores require immediate product review and customer outreach. Target 90%+ satisfaction with quality. Below 85% indicates quality issues customers are experiencing. Compare to NPS to understand impact',
    formula: '(Customers Rating ≥4/5 / Total Survey Responses) × 100',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 90,
      excellent: 95
    },
    icon: ThumbsUp,
    tags: ['customer-satisfaction', 'quality', 'perception', 'surveys', 'experience'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]