// src/lib/kpi/data/functions/deliver-people.ts

/**
 * DELIVER Business Function - People & Team KPIs
 * Total: 18 KPIs
 * Covers: Operations team productivity, field staff performance, technician metrics,
 *         service team efficiency, workforce scheduling, training effectiveness
 * 
 * ✅ Uses 'function' instead of 'businessFunction'
 * ✅ All IDs prefixed with 'deliver-people-'
 * ✅ String literals instead of enums
 * ✅ Updated all property names to match new schema
 */

import { KPIDefinition } from '../../types'
import {
  Users,
  UserCheck,
  TrendingUp,
  Clock,
  Award,
  Target,
  Zap,
  DollarSign,
  CheckCircle2,
  Activity,
  Calendar,
  ThumbsUp,
  AlertCircle,
  Briefcase,
  Star,
  BookOpen,
  UserPlus,
  Shield
} from 'lucide-react'

export const deliverPeopleKPIs: KPIDefinition[] = [
  {
    id: 'deliver-people-technician-utilization',
    name: 'Technician Utilization Rate',
    plainName: 'Percentage of Time Technicians Are Billable',
    function: 'DELIVER',
    category: 'People',
    tier: 'essential',
    industries: [
      'construction-trades',
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
    description: 'Percentage of available technician/field staff hours that are billable to customers',
    whyItMatters: 'Technician time is expensive - low utilization means you\'re paying for non-productive time. High utilization maximizes revenue per employee',
    actionToTake: 'Track by technician and week. Below 70%? Improve scheduling, reduce travel time, or adjust staffing levels. Target 75-85% for service businesses. Above 90% risks burnout',
    formula: '(Billable Hours / Total Available Hours) × 100',
    benchmarks: {
      poor: 60,
      average: 70,
      good: 80,
      excellent: 85
    },
    icon: Clock,
    tags: ['utilization', 'productivity', 'field-staff', 'technicians', 'billable'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-jobs-per-technician',
    name: 'Jobs Per Technician Per Day',
    plainName: 'Average Number of Jobs Each Technician Completes Daily',
    function: 'DELIVER',
    category: 'People',
    tier: 'essential',
    industries: [
      'construction-trades',
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
    unit: 'number',
    frequency: 'daily',
    description: 'Average number of service calls, installations, or jobs completed per technician per day',
    whyItMatters: 'Direct measure of field staff productivity. More jobs per day means lower cost per job and higher revenue potential',
    actionToTake: 'Benchmark varies by industry - HVAC targets 3-5 jobs/day, plumbing 4-6, electrical 3-4. Improve with better routing, parts inventory on trucks, and scheduling efficiency. Track by technician to identify training needs',
    formula: 'Total Jobs Completed / (Number of Technicians × Working Days)',
    benchmarks: {
      poor: 2.0,
      average: 3.5,
      good: 5.0,
      excellent: 6.5
    },
    icon: Zap,
    tags: ['productivity', 'jobs', 'field-staff', 'efficiency', 'output'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-first-time-fix-rate',
    name: 'First Time Fix Rate',
    plainName: 'Percentage of Jobs Completed on First Visit',
    function: 'DELIVER',
    category: 'People',
    tier: 'essential',
    industries: [
      'construction-trades',
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
    frequency: 'weekly',
    description: 'Percentage of service calls that are resolved on the first visit without need for return trips',
    whyItMatters: 'Return visits double your costs and frustrate customers. High first-time fix rates indicate skilled technicians with proper tools and parts',
    actionToTake: 'Target 85%+ first-time fix rate. Below 80% indicates parts inventory issues, training gaps, or diagnostic problems. Ensure trucks are properly stocked. Track by technician and job type to identify patterns. Each return visit costs 2-3x the original job',
    formula: '(Jobs Completed First Visit / Total Jobs) × 100',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 88,
      excellent: 95
    },
    icon: CheckCircle2,
    tags: ['first-time-fix', 'quality', 'efficiency', 'field-service', 'completion'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-revenue-per-tech',
    name: 'Revenue Per Technician',
    plainName: 'Revenue Generated Per Field Staff Member',
    function: 'DELIVER',
    category: 'People',
    tier: 'essential',
    industries: [
      'construction-trades',
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
    unit: 'currency',
    frequency: 'monthly',
    description: 'Total revenue divided by number of field technicians or service providers',
    whyItMatters: 'Key profitability metric for service businesses. Shows how efficiently each technician generates revenue',
    actionToTake: 'Service businesses should target $150K-$300K annual revenue per technician. Below $100K indicates pricing, productivity, or utilization issues. Track monthly and by service type. High performers generate $400K+ per tech through efficiency and upsells',
    formula: 'Total Revenue / Number of Technicians',
    benchmarks: {
      poor: 8000,
      average: 15000,
      good: 25000,
      excellent: 35000
    },
    icon: DollarSign,
    tags: ['revenue', 'productivity', 'efficiency', 'field-staff', 'financial'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-technician-turnover',
    name: 'Technician Turnover Rate',
    plainName: 'Percentage of Field Staff Who Leave Annually',
    function: 'DELIVER',
    category: 'People',
    tier: 'essential',
    industries: [
      'construction-trades',
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
    frequency: 'quarterly',
    description: 'Annual turnover rate of field technicians and service staff',
    whyItMatters: 'Replacing skilled technicians costs 50-200% of annual salary. High turnover disrupts service quality and customer relationships. Trained technicians are your most valuable asset',
    actionToTake: 'Service industry average is 25-30% but target <20%. Above 25% requires immediate action - review compensation, career paths, and work conditions. Exit interviews are critical. Focus on retaining top performers (85%+ customer satisfaction) at all costs',
    formula: '(Technician Departures / Average Technician Headcount) × 100',
    benchmarks: {
      poor: 35,
      average: 25,
      good: 18,
      excellent: 12
    },
    icon: AlertCircle,
    tags: ['turnover', 'retention', 'field-staff', 'technicians', 'attrition'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-avg-job-time',
    name: 'Average Job Completion Time',
    plainName: 'Average Time to Complete Each Job',
    function: 'DELIVER',
    category: 'People',
    tier: 'recommended',
    industries: [
      'construction-trades',
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
    unit: 'hours',
    frequency: 'weekly',
    description: 'Average time from arrival to completion for standard jobs',
    whyItMatters: 'Faster completion means more jobs per day and lower costs. Track by job type to identify inefficiencies and training needs',
    actionToTake: 'Establish time standards for common jobs. Track actual vs. standard time by technician. Technicians consistently over standard time need training or process improvement. Use best performers\' methods to train others. Build time standards into pricing',
    formula: 'Total Job Time / Number of Jobs Completed',
    benchmarks: {
      poor: 3.5,
      average: 2.5,
      good: 2.0,
      excellent: 1.5
    },
    icon: Clock,
    tags: ['efficiency', 'job-time', 'productivity', 'field-service', 'speed'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-callback-rate',
    name: 'Callback Rate',
    plainName: 'Percentage of Jobs Requiring Return Visit',
    function: 'DELIVER',
    category: 'People',
    tier: 'recommended',
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
    frequency: 'weekly',
    description: 'Percentage of completed jobs that require a callback or warranty return within 30 days',
    whyItMatters: 'Callbacks are expensive - you pay twice for the same job. High callback rates indicate quality issues, parts problems, or incomplete work',
    actionToTake: 'Industry standard is 2-5% callbacks. Above 8% is a red flag. Track by technician and job type. Common causes: rushed work, wrong parts, incomplete diagnosis, poor communication. Each callback costs $150-$500 in direct costs plus reputation damage',
    formula: '(Jobs with Callbacks / Total Jobs Completed) × 100',
    benchmarks: {
      poor: 10,
      average: 6,
      good: 3,
      excellent: 1
    },
    icon: AlertCircle,
    tags: ['callbacks', 'quality', 'rework', 'field-service', 'customer-satisfaction'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-customer-rating',
    name: 'Technician Customer Rating',
    plainName: 'Average Customer Rating of Field Staff',
    function: 'DELIVER',
    category: 'People',
    tier: 'essential',
    industries: [
      'construction-trades',
      'professional-services',
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
    unit: 'number',
    frequency: 'weekly',
    description: 'Average customer satisfaction rating for technicians/field staff (typically 1-5 or 1-10 scale)',
    whyItMatters: 'Customer-facing staff directly impact retention and referrals. Low ratings predict churn and damage reputation',
    actionToTake: 'Survey after every job. Target 4.5+ out of 5 or 9+ out of 10. Technicians below 4.0 need coaching or reassignment. Track by technician - top performers (4.8+) should train others. Ratings below 3.5 require immediate intervention. Tie ratings to compensation and recognition',
    formula: 'Average of all customer ratings for technicians',
    benchmarks: {
      poor: 3.5,
      average: 4.0,
      good: 4.5,
      excellent: 4.8
    },
    icon: Star,
    tags: ['customer-satisfaction', 'ratings', 'field-staff', 'quality', 'service'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-training-hours',
    name: 'Field Staff Training Hours',
    plainName: 'Annual Training Hours Per Technician',
    function: 'DELIVER',
    category: 'People',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'professional-services',
      'health-wellness',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'yearly',
    description: 'Average annual training hours per field technician or service provider',
    whyItMatters: 'Technology and best practices evolve - ongoing training keeps skills sharp and improves first-time fix rates. Trained technicians are more efficient and provide better service',
    actionToTake: 'Minimum 40 hours annual training for skilled trades. Include technical skills, customer service, and new products. Top performers need 60-80 hours to stay ahead. Track certifications and require ongoing education. ROI on training is 2-3x through improved efficiency and upsells',
    formula: 'Total Training Hours / Number of Technicians',
    benchmarks: {
      poor: 20,
      average: 40,
      good: 60,
      excellent: 80
    },
    icon: BookOpen,
    tags: ['training', 'development', 'field-staff', 'education', 'skills'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-safety-incidents',
    name: 'Safety Incident Rate',
    plainName: 'Number of Safety Incidents Per 100 Employees',
    function: 'DELIVER',
    category: 'People',
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
    frequency: 'monthly',
    description: 'Number of recordable safety incidents per 100 field employees per year',
    whyItMatters: 'Safety incidents are costly - direct costs from injuries plus indirect costs from lost time, insurance, and morale. Critical for construction and trades',
    actionToTake: 'Construction industry averages 2.5-3.5 incidents per 100 workers. Target <2.0 incidents. Above 4.0 requires immediate safety program review. Track leading indicators: near misses, safety violations, equipment issues. Weekly safety meetings and monthly training reduce incidents by 30-50%',
    formula: '(Number of Incidents / Number of Employees) × 100',
    benchmarks: {
      poor: 5.0,
      average: 3.0,
      good: 1.5,
      excellent: 0.5
    },
    icon: Shield,
    tags: ['safety', 'incidents', 'field-staff', 'osha', 'workplace-safety'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-certification-rate',
    name: 'Staff Certification Rate',
    plainName: 'Percentage of Staff With Required Certifications',
    function: 'DELIVER',
    category: 'People',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'professional-services',
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
    frequency: 'quarterly',
    description: 'Percentage of field staff who maintain current required certifications and licenses',
    whyItMatters: 'Certifications enable higher-value work, meet legal requirements, and justify premium pricing. Uncertified staff limit service capabilities',
    actionToTake: 'Should be 100% for required certifications - compliance is non-negotiable. For optional certifications, target 60%+ to expand service offerings. Track expiration dates 90 days ahead. Budget 2-5% of payroll for certification and renewal costs. Certified technicians command 15-25% higher rates',
    formula: '(Certified Staff / Total Staff) × 100',
    benchmarks: {
      poor: 70,
      average: 85,
      good: 95,
      excellent: 100
    },
    icon: Award,
    tags: ['certification', 'compliance', 'licenses', 'field-staff', 'credentials'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-schedule-adherence',
    name: 'Schedule Adherence Rate',
    plainName: 'Percentage of Appointments Kept On Time',
    function: 'DELIVER',
    category: 'People',
    tier: 'recommended',
    industries: [
      'construction-trades',
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
    frequency: 'daily',
    description: 'Percentage of scheduled appointments where technician arrives within promised time window',
    whyItMatters: 'Customers value their time - missed windows cause complaints and cancellations. Schedule adherence builds trust and reputation',
    actionToTake: 'Target 90%+ on-time arrivals. Below 85% indicates scheduling, routing, or job time estimation problems. Use GPS tracking and real-time updates. Build in 15-20% buffer time between jobs. Communicate proactively when delays occur. Late arrivals cost 23% of customers',
    formula: '(On-Time Arrivals / Total Scheduled Appointments) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 92,
      excellent: 96
    },
    icon: Calendar,
    tags: ['scheduling', 'punctuality', 'on-time', 'field-service', 'customer-service'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-truck-stock-accuracy',
    name: 'Truck Stock Accuracy',
    plainName: 'Percentage of Parts Available on Trucks',
    function: 'DELIVER',
    category: 'People',
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
    description: 'Percentage of common parts and materials available on service vehicles when needed',
    whyItMatters: 'Missing parts force return trips and reduce first-time fix rates. Proper truck stocking is critical for efficiency',
    actionToTake: 'Target 90%+ stock accuracy for common parts. Track parts usage by job type. Implement min/max levels on trucks. Review and restock daily. Each missing part costs 1-2 hours in return trip time. Use data to optimize truck inventory - 80/20 rule applies',
    formula: '(Parts Available on Truck / Parts Needed for Jobs) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 92,
      excellent: 97
    },
    icon: CheckCircle2,
    tags: ['inventory', 'parts', 'truck-stock', 'field-service', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-travel-time-ratio',
    name: 'Travel Time Ratio',
    plainName: 'Travel Time as Percentage of Total Work Time',
    function: 'DELIVER',
    category: 'People',
    tier: 'recommended',
    industries: [
      'construction-trades',
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
    description: 'Percentage of work time spent traveling between jobs instead of working on jobs',
    whyItMatters: 'Travel time is non-billable waste. High travel time reduces jobs per day and profitability',
    actionToTake: 'Target <20% travel time. Above 25% indicates poor routing or scheduling. Use route optimization software. Schedule jobs geographically. Reduce travel time by 10% and you increase capacity by 10%. Track by technician and adjust territories. First appointment should be closest to home',
    formula: '(Travel Time / Total Work Time) × 100',
    benchmarks: {
      poor: 30,
      average: 22,
      good: 15,
      excellent: 10
    },
    icon: TrendingUp,
    tags: ['travel-time', 'efficiency', 'routing', 'field-service', 'productivity'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-upsell-rate',
    name: 'Field Staff Upsell Rate',
    plainName: 'Percentage of Jobs With Additional Sales',
    function: 'DELIVER',
    category: 'People',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'health-wellness',
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
    description: 'Percentage of service calls where technician sells additional products or services',
    whyItMatters: 'Field staff are in customer homes - perfect upsell opportunity. Trained technicians can double ticket value through genuine recommendations',
    actionToTake: 'Target 30-50% upsell rate for service businesses. Train technicians on consultative selling and product knowledge. Track upsell by technician and provide coaching. Incentivize with commission. Average upsell adds 40-60% to ticket value. Focus on maintenance agreements, upgrades, and complementary services',
    formula: '(Jobs with Additional Sales / Total Jobs) × 100',
    benchmarks: {
      poor: 15,
      average: 30,
      good: 45,
      excellent: 60
    },
    icon: TrendingUp,
    tags: ['upsell', 'sales', 'revenue', 'field-staff', 'cross-sell'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-new-hire-time-to-productivity',
    name: 'New Hire Time to Productivity',
    plainName: 'Days Until New Technician Reaches Full Productivity',
    function: 'DELIVER',
    category: 'People',
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
    unit: 'days',
    frequency: 'quarterly',
    description: 'Average number of days from hire date until new technician reaches full productivity (typically 80% of target jobs/day)',
    whyItMatters: 'Faster onboarding reduces training costs and increases capacity. Long ramp times indicate poor onboarding or hiring wrong candidates',
    actionToTake: 'Track separately for experienced hires vs. apprentices. Experienced technicians should reach productivity in 30-60 days, apprentices in 90-180 days. Structured onboarding programs reduce time by 30-40%. Assign mentor technician for first 90 days. Use ride-alongs, shadowing, and progressive responsibility',
    formula: 'Average days from hire to reaching 80% productivity target',
    benchmarks: {
      poor: 120,
      average: 90,
      good: 60,
      excellent: 45
    },
    icon: UserPlus,
    tags: ['onboarding', 'training', 'new-hires', 'productivity', 'ramp-time'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-overtime-percentage',
    name: 'Field Staff Overtime Rate',
    plainName: 'Percentage of Field Staff Hours That Are Overtime',
    function: 'DELIVER',
    category: 'People',
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
    description: 'Percentage of total field staff hours worked that are overtime (time and a half or double time)',
    whyItMatters: 'Overtime is 50-100% more expensive than regular time. Chronic overtime indicates understaffing or poor scheduling',
    actionToTake: 'Seasonal overtime is normal but chronic overtime >10% is expensive. Above 15% requires action - hire additional staff or improve scheduling. Track by individual - consistent high overtime may indicate personal inefficiency. Balance overtime costs against hiring costs. Emergency/on-call work should be separately tracked',
    formula: '(Overtime Hours / Total Hours Worked) × 100',
    benchmarks: {
      poor: 15,
      average: 10,
      good: 6,
      excellent: 3
    },
    icon: Clock,
    tags: ['overtime', 'labor-costs', 'field-staff', 'scheduling', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-people-employee-referral-quality',
    name: 'Employee Referral Quality Score',
    plainName: 'Performance Rating of Employee-Referred Hires',
    function: 'DELIVER',
    category: 'People',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'yearly',
    description: 'Average performance rating of technicians hired through employee referrals after 12 months',
    whyItMatters: 'Employee referrals often result in better quality hires who stay longer and perform better. Measures effectiveness of referral program',
    actionToTake: 'Employee-referred hires typically perform 15-25% better than other channels. Incentivize referrals with $500-$2000 bonuses. Track referral source and quality. Best technicians often know other skilled people. Build strong referral culture - referrals should be 30%+ of hires',
    formula: 'Average performance score of employee-referred hires',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 90,
      excellent: 95
    },
    icon: UserCheck,
    tags: ['referrals', 'hiring', 'quality', 'recruitment', 'field-staff'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]