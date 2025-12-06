'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Search, ChevronRight, Info, Target, TrendingUp, Users, Package, Heart, DollarSign, Settings, Zap, HelpCircle, Check, AlertCircle } from 'lucide-react'

// Types
interface KPI {
  id: string
  name: string
  friendlyName: string
  description: string
  whyItMatters: string
  whatToDo: string
  category: BusinessFunction
  industries: string[]
  stages: RevenueStage[]
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  unit: 'percentage' | 'currency' | 'number' | 'days' | 'hours' | 'ratio'
  isUniversal: boolean
  targetBenchmark?: number
}

type BusinessFunction = 'ATTRACT' | 'CONVERT' | 'DELIVER' | 'DELIGHT' | 'PEOPLE' | 'PROFIT' | 'SYSTEMS'
type RevenueStage = 'FOUNDATION' | 'TRACTION' | 'GROWTH' | 'SCALE'
type SelectionMode = 'quick' | 'guided' | 'power'

interface EnhancedKPIModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (selectedKPIs: KPI[]) => void
  businessProfile: {
    industry?: string
    revenueStage?: string
    currentRevenue?: number
  }
}

// Complete KPI Definitions
const ALL_KPIS: KPI[] = [
  // ============= UNIVERSAL KPIs (Show for ALL industries) =============
  
  // Financial/Profit KPIs
  {
    id: 'gross-profit-margin',
    name: 'Gross Profit Margin',
    friendlyName: 'Money You Keep After Direct Costs',
    description: 'The percentage of revenue left after paying for what it costs to deliver your product or service',
    whyItMatters: 'Shows if you\'re pricing right and controlling direct costs. Higher is better!',
    whatToDo: 'If below 30%, review pricing or find ways to reduce direct costs',
    category: 'PROFIT',
    industries: ['all'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 40
  },
  {
    id: 'net-profit-margin',
    name: 'Net Profit Margin',
    friendlyName: 'Money You Keep After Everything',
    description: 'The percentage of revenue you actually keep after ALL expenses',
    whyItMatters: 'This is your real profitability - what goes in your pocket',
    whatToDo: 'Aim for 10-15% minimum. If lower, review all expenses line by line',
    category: 'PROFIT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 15
  },
  {
    id: 'cash-flow',
    name: 'Cash Flow',
    friendlyName: 'Money In vs Money Out',
    description: 'The actual cash coming in and going out of your business',
    whyItMatters: 'You can be profitable on paper but still run out of cash',
    whatToDo: 'Keep 2-3 months of expenses in reserve. Chase overdue payments weekly',
    category: 'PROFIT',
    industries: ['all'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'currency',
    isUniversal: true
  },
  {
    id: 'accounts-receivable-days',
    name: 'Accounts Receivable Days',
    friendlyName: 'Days Until You Get Paid',
    description: 'Average number of days it takes customers to pay you',
    whyItMatters: 'The longer it takes, the more cash you need to run the business',
    whatToDo: 'Aim for under 30 days. Consider early payment discounts or deposits',
    category: 'PROFIT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'days',
    isUniversal: true,
    targetBenchmark: 30
  },
  {
    id: 'revenue-per-employee',
    name: 'Revenue per Employee',
    friendlyName: 'Money Each Team Member Brings In',
    description: 'Total revenue divided by number of employees',
    whyItMatters: 'Shows how efficiently you\'re using your team',
    whatToDo: 'Compare to industry averages. If low, focus on productivity or pricing',
    category: 'PROFIT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'quarterly',
    unit: 'currency',
    isUniversal: true
  },

  // Sales/Convert KPIs
  {
    id: 'conversion-rate',
    name: 'Conversion Rate',
    friendlyName: 'Enquiries That Become Customers',
    description: 'Percentage of leads or quotes that turn into paying customers',
    whyItMatters: 'Shows how good you are at closing deals',
    whatToDo: 'If below 20%, improve your sales process or qualify leads better',
    category: 'CONVERT',
    industries: ['all'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 25
  },
  {
    id: 'average-transaction-value',
    name: 'Average Transaction Value',
    friendlyName: 'Average Sale Size',
    description: 'The average amount customers spend per purchase',
    whyItMatters: 'Bigger sales mean more revenue without more customers',
    whatToDo: 'Increase by bundling, upselling, or focusing on premium customers',
    category: 'CONVERT',
    industries: ['all'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'currency',
    isUniversal: true
  },
  {
    id: 'sales-cycle-length',
    name: 'Sales Cycle Length',
    friendlyName: 'Time to Close a Deal',
    description: 'Average days from first contact to closed sale',
    whyItMatters: 'Shorter cycles mean faster revenue and lower costs',
    whatToDo: 'Map your sales process and remove unnecessary steps',
    category: 'CONVERT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'days',
    isUniversal: true
  },

  // Marketing/Attract KPIs
  {
    id: 'lead-generation',
    name: 'Lead Generation',
    friendlyName: 'New Enquiries Coming In',
    description: 'Number of new potential customers contacting you',
    whyItMatters: 'No leads = no sales. This is your business pipeline',
    whatToDo: 'Set a weekly target. If low, boost marketing or ask for referrals',
    category: 'ATTRACT',
    industries: ['all'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'number',
    isUniversal: true
  },
  {
    id: 'cost-per-lead',
    name: 'Cost per Lead',
    friendlyName: 'What You Pay for Each Enquiry',
    description: 'Marketing spend divided by number of leads generated',
    whyItMatters: 'Helps you find the most cost-effective marketing channels',
    whatToDo: 'Track by source. Stop spending on expensive channels that don\'t convert',
    category: 'ATTRACT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'currency',
    isUniversal: true
  },
  {
    id: 'website-conversion',
    name: 'Website Conversion',
    friendlyName: 'Website Visitors Who Take Action',
    description: 'Percentage of website visitors who enquire or buy',
    whyItMatters: 'Shows if your website is working as a sales tool',
    whatToDo: 'If below 2%, improve your website copy and call-to-actions',
    category: 'ATTRACT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 2.5
  },

  // Customer/Delight KPIs
  {
    id: 'customer-retention',
    name: 'Customer Retention Rate',
    friendlyName: 'Customers Who Stay With You',
    description: 'Percentage of customers who continue buying from you',
    whyItMatters: 'Keeping customers is 5x cheaper than finding new ones',
    whatToDo: 'If below 80%, survey lost customers and fix the issues',
    category: 'DELIGHT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'quarterly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 85
  },
  {
    id: 'customer-satisfaction',
    name: 'Customer Satisfaction Score',
    friendlyName: 'How Happy Your Customers Are',
    description: 'Average rating customers give your service (usually 1-10)',
    whyItMatters: 'Happy customers buy more and refer others',
    whatToDo: 'If below 8/10, talk to unhappy customers and fix their issues',
    category: 'DELIGHT',
    industries: ['all'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'number',
    isUniversal: true,
    targetBenchmark: 8
  },
  {
    id: 'referral-rate',
    name: 'Referral Rate',
    friendlyName: 'New Customers from Word-of-Mouth',
    description: 'Percentage of new customers who come from referrals',
    whyItMatters: 'Referrals are free marketing and convert better',
    whatToDo: 'If below 30%, create a referral program or ask happy customers',
    category: 'DELIGHT',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 30
  },

  // People KPIs
  {
    id: 'team-utilization',
    name: 'Team Utilization',
    friendlyName: 'How Busy Your Team Is',
    description: 'Percentage of available time spent on productive work',
    whyItMatters: 'Too low = wasting money. Too high = burnout risk',
    whatToDo: 'Aim for 70-85%. Below = find more work. Above = hire help',
    category: 'PEOPLE',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 75
  },
  {
    id: 'employee-turnover',
    name: 'Employee Turnover',
    friendlyName: 'Team Members Who Leave',
    description: 'Percentage of employees who quit or are let go annually',
    whyItMatters: 'High turnover costs money and hurts morale',
    whatToDo: 'If above 15%, conduct exit interviews and improve culture',
    category: 'PEOPLE',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'quarterly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 10
  },

  // Operations/Deliver KPIs
  {
    id: 'on-time-delivery',
    name: 'On-Time Delivery',
    friendlyName: 'Jobs Finished When Promised',
    description: 'Percentage of projects or orders delivered on schedule',
    whyItMatters: 'Late delivery upsets customers and hurts reputation',
    whatToDo: 'If below 95%, review your scheduling and add buffer time',
    category: 'DELIVER',
    industries: ['all'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 95
  },
  {
    id: 'quality-score',
    name: 'Quality Score',
    friendlyName: 'Work Done Right First Time',
    description: 'Percentage of work completed without errors or rework',
    whyItMatters: 'Mistakes cost time and money to fix',
    whatToDo: 'If below 95%, create checklists and quality controls',
    category: 'DELIVER',
    industries: ['all'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: true,
    targetBenchmark: 95
  },

  // ============= CONSTRUCTION & TRADES KPIs =============
  {
    id: 'jobs-completed-monthly',
    name: 'Jobs Completed This Month',
    friendlyName: 'Projects Finished',
    description: 'Number of jobs fully completed and handed over',
    whyItMatters: 'Completed jobs = revenue. Track if you\'re hitting targets',
    whatToDo: 'Set monthly targets. If missing, check bottlenecks in your process',
    category: 'DELIVER',
    industries: ['building_construction', 'trades'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'number',
    isUniversal: false
  },
  {
    id: 'average-job-price',
    name: 'Average Job Price',
    friendlyName: 'What Each Job Is Worth',
    description: 'Total revenue divided by number of jobs',
    whyItMatters: 'Bigger jobs = more profit per project',
    whatToDo: 'Focus on higher-value work or add services to increase',
    category: 'CONVERT',
    industries: ['building_construction', 'trades'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'currency',
    isUniversal: false
  },
  {
    id: 'quote-conversion',
    name: 'Quote Conversion Rate',
    friendlyName: 'Quotes That Become Jobs',
    description: 'Percentage of quotes that turn into actual work',
    whyItMatters: 'Low conversion means wasted time quoting',
    whatToDo: 'If below 30%, improve quote presentation or qualify better',
    category: 'CONVERT',
    industries: ['building_construction', 'trades'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 35
  },
  {
    id: 'customer-callbacks',
    name: 'Customer Callbacks',
    friendlyName: 'Jobs That Need Fixing',
    description: 'Percentage of jobs requiring return visits for issues',
    whyItMatters: 'Callbacks cost money and hurt reputation',
    whatToDo: 'If above 5%, improve quality checks before leaving site',
    category: 'DELIVER',
    industries: ['building_construction', 'trades'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 3
  },
  {
    id: 'equipment-utilization',
    name: 'Equipment Utilization',
    friendlyName: 'Equipment Being Used',
    description: 'Percentage of time equipment is actively used vs sitting idle',
    whyItMatters: 'Idle equipment is expensive dead weight',
    whatToDo: 'If below 60%, consider renting instead of buying',
    category: 'SYSTEMS',
    industries: ['building_construction', 'trades'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 70
  },
  {
    id: 'materials-waste',
    name: 'Materials Waste',
    friendlyName: 'Materials Wasted',
    description: 'Percentage of materials purchased but not used productively',
    whyItMatters: 'Waste directly reduces your profit margin',
    whatToDo: 'If above 5%, improve measuring and ordering processes',
    category: 'DELIVER',
    industries: ['building_construction', 'trades'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 3
  },
  {
    id: 'safety-incidents',
    name: 'Safety Incidents',
    friendlyName: 'Workplace Accidents',
    description: 'Number of safety incidents or near-misses on site',
    whyItMatters: 'Safety issues can shut down jobs and increase insurance',
    whatToDo: 'Target zero. Have daily toolbox talks and safety checks',
    category: 'PEOPLE',
    industries: ['building_construction', 'trades'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'number',
    isUniversal: false,
    targetBenchmark: 0
  },
  {
    id: 'job-profit-accuracy',
    name: 'Job Profit Accuracy',
    friendlyName: 'Actual vs Expected Profit',
    description: 'How close actual job profit is to what you quoted',
    whyItMatters: 'Shows if you\'re estimating correctly',
    whatToDo: 'If off by >10%, review your quoting process and track actuals',
    category: 'PROFIT',
    industries: ['building_construction', 'trades'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 95
  },

  // ============= ALLIED HEALTH & SUPPORT SERVICES KPIs =============
  {
    id: 'appointment-attendance',
    name: 'Appointment Attendance',
    friendlyName: 'Clients Showing Up',
    description: 'Percentage of booked appointments where clients actually attend',
    whyItMatters: 'No-shows = lost revenue and wasted time',
    whatToDo: 'If below 85%, add SMS reminders and cancellation policies',
    category: 'DELIVER',
    industries: ['allied_health', 'ndis', 'psychology', 'aged_care'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 90
  },
  {
    id: 'client-progress-score',
    name: 'Client Progress Score',
    friendlyName: 'Clients Getting Better',
    description: 'Average improvement in client outcomes or goals',
    whyItMatters: 'Results drive retention and referrals',
    whatToDo: 'Track with simple 1-10 scales. Review non-improving clients',
    category: 'DELIGHT',
    industries: ['allied_health', 'ndis', 'psychology', 'aged_care'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'number',
    isUniversal: false,
    targetBenchmark: 7
  },
  {
    id: 'ndis-payment-time',
    name: 'NDIS Claims Payment',
    friendlyName: 'NDIS Claims Paid on Time',
    description: 'Percentage of NDIS claims paid within 14 days',
    whyItMatters: 'Delayed payments hurt cash flow',
    whatToDo: 'If below 90%, review claim accuracy and follow up weekly',
    category: 'PROFIT',
    industries: ['ndis', 'allied_health'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 95
  },
  {
    id: 'care-plan-compliance',
    name: 'Care Plan Compliance',
    friendlyName: 'Care Plans Followed',
    description: 'Percentage of sessions following documented care plans',
    whyItMatters: 'Compliance ensures quality and protects against audits',
    whatToDo: 'If below 95%, retrain staff and simplify documentation',
    category: 'DELIVER',
    industries: ['allied_health', 'ndis', 'psychology', 'aged_care'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 98
  },
  {
    id: 'appointment-gaps',
    name: 'Appointment Gaps',
    friendlyName: 'Empty Appointment Slots',
    description: 'Hours of unused appointment time per week',
    whyItMatters: 'Empty slots = lost revenue opportunity',
    whatToDo: 'If above 10%, improve scheduling or marketing',
    category: 'SYSTEMS',
    industries: ['allied_health', 'ndis', 'psychology'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH'],
    frequency: 'weekly',
    unit: 'hours',
    isUniversal: false,
    targetBenchmark: 5
  },
  {
    id: 'staff-billable-hours',
    name: 'Staff Billable Hours',
    friendlyName: 'Staff Hours Billed',
    description: 'Percentage of staff time that generates revenue',
    whyItMatters: 'Non-billable time costs money without earning',
    whatToDo: 'Aim for 70%+. Review admin tasks and streamline',
    category: 'PEOPLE',
    industries: ['allied_health', 'ndis', 'psychology'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 75
  },
  {
    id: 'client-referrals-health',
    name: 'Client Referrals',
    friendlyName: 'Referrals from Clients',
    description: 'Number of new clients from existing client referrals',
    whyItMatters: 'Shows client satisfaction and reduces marketing costs',
    whatToDo: 'If low, ask happy clients for referrals after good outcomes',
    category: 'ATTRACT',
    industries: ['allied_health', 'ndis', 'psychology', 'aged_care'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'number',
    isUniversal: false
  },

  // ============= FITNESS INDUSTRY KPIs =============
  {
    id: 'member-retention-rate',
    name: 'Member Retention',
    friendlyName: 'Members Keeping Membership',
    description: 'Percentage of members who renew each month',
    whyItMatters: 'Losing members means constantly finding new ones',
    whatToDo: 'If below 85%, survey leavers and improve engagement',
    category: 'DELIGHT',
    industries: ['fitness', 'gym', 'pt_studio'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 90
  },
  {
    id: 'class-utilization',
    name: 'Class Utilization',
    friendlyName: 'Class Spots Filled',
    description: 'Percentage of available class spots that are booked',
    whyItMatters: 'Empty spots = wasted instructor costs',
    whatToDo: 'If below 70%, adjust schedule or promote popular classes',
    category: 'DELIVER',
    industries: ['fitness', 'gym', 'pt_studio'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 80
  },
  {
    id: 'pt-session-usage',
    name: 'PT Session Usage',
    friendlyName: 'PT Sessions Used',
    description: 'Percentage of purchased PT sessions actually used',
    whyItMatters: 'Unused sessions = unhappy clients who won\'t renew',
    whatToDo: 'If below 80%, remind clients and help them book',
    category: 'DELIVER',
    industries: ['fitness', 'gym', 'pt_studio'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 85
  },
  {
    id: 'new-members-monthly',
    name: 'New Members',
    friendlyName: 'New Members This Month',
    description: 'Number of new memberships started',
    whyItMatters: 'Need new members to replace losses and grow',
    whatToDo: 'Set targets based on churn. Use referral programs',
    category: 'ATTRACT',
    industries: ['fitness', 'gym', 'pt_studio'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'number',
    isUniversal: false
  },
  {
    id: 'member-checkins',
    name: 'Member Check-ins',
    friendlyName: 'Member Check-ins Per Week',
    description: 'Average number of times members visit per week',
    whyItMatters: 'Active members stay longer and refer more',
    whatToDo: 'If below 2, create engagement challenges and follow up',
    category: 'DELIGHT',
    industries: ['fitness', 'gym', 'pt_studio'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'number',
    isUniversal: false,
    targetBenchmark: 2.5
  },
  {
    id: 'average-member-spend',
    name: 'Average Member Spend',
    friendlyName: 'What Each Member Spends',
    description: 'Total revenue divided by active members',
    whyItMatters: 'Shows if you\'re maximizing member value',
    whatToDo: 'Increase through PT, supplements, or premium memberships',
    category: 'PROFIT',
    industries: ['fitness', 'gym', 'pt_studio'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'currency',
    isUniversal: false
  },
  {
    id: 'equipment-downtime',
    name: 'Equipment Downtime',
    friendlyName: 'Equipment Out of Order',
    description: 'Days of equipment being broken or unavailable',
    whyItMatters: 'Broken equipment frustrates members and limits capacity',
    whatToDo: 'Fix within 48 hours. Schedule preventive maintenance',
    category: 'SYSTEMS',
    industries: ['fitness', 'gym'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'days',
    isUniversal: false,
    targetBenchmark: 2
  },
  {
    id: 'member-results',
    name: 'Member Results Achieved',
    friendlyName: 'Members Hitting Their Goals',
    description: 'Percentage of members achieving their fitness goals',
    whyItMatters: 'Results = retention and referrals',
    whatToDo: 'Track goals at signup. Check in monthly. Celebrate wins',
    category: 'DELIGHT',
    industries: ['fitness', 'gym', 'pt_studio'],
    stages: ['GROWTH', 'SCALE'],
    frequency: 'quarterly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 60
  },

  // ============= PROFESSIONAL SERVICES KPIs =============
  {
    id: 'billable-utilization',
    name: 'Billable Utilization',
    friendlyName: 'Hours You Can Bill',
    description: 'Percentage of available hours that are billable to clients',
    whyItMatters: 'Non-billable time doesn\'t generate revenue',
    whatToDo: 'Aim for 75%+. Reduce admin time and improve project scoping',
    category: 'PEOPLE',
    industries: ['professional_services', 'consulting', 'accounting', 'legal'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 75
  },
  {
    id: 'realization-rate',
    name: 'Realization Rate',
    friendlyName: 'Bills Clients Actually Pay',
    description: 'Percentage of billable work that gets paid (not written off)',
    whyItMatters: 'Write-offs mean you worked for free',
    whatToDo: 'If below 95%, improve scoping and client communication',
    category: 'PROFIT',
    industries: ['professional_services', 'consulting', 'accounting', 'legal'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 95
  },
  {
    id: 'project-profitability',
    name: 'Project Profitability',
    friendlyName: 'Profit Per Project',
    description: 'Average profit margin on completed projects',
    whyItMatters: 'Some projects make money, others lose it',
    whatToDo: 'Review unprofitable projects and fix scoping or pricing',
    category: 'PROFIT',
    industries: ['professional_services', 'consulting'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 35
  },
  {
    id: 'client-concentration',
    name: 'Client Concentration',
    friendlyName: 'Biggest Client Risk',
    description: 'Percentage of revenue from your largest client',
    whyItMatters: 'Losing one big client shouldn\'t kill your business',
    whatToDo: 'Keep below 30%. Diversify if too concentrated',
    category: 'SYSTEMS',
    industries: ['professional_services', 'consulting', 'accounting'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'quarterly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 25
  },
  {
    id: 'proposal-win-rate',
    name: 'Proposal Win Rate',
    friendlyName: 'Proposals Won',
    description: 'Percentage of proposals that turn into projects',
    whyItMatters: 'Low win rate = wasted proposal time',
    whatToDo: 'If below 40%, qualify better or improve proposals',
    category: 'CONVERT',
    industries: ['professional_services', 'consulting'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 50
  },
  {
    id: 'scope-creep',
    name: 'Scope Creep',
    friendlyName: 'Project Scope Creep',
    description: 'Percentage of projects that go over original scope',
    whyItMatters: 'Scope creep kills profitability',
    whatToDo: 'If above 20%, improve contracts and change management',
    category: 'DELIVER',
    industries: ['professional_services', 'consulting'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 10
  },
  {
    id: 'recurring-revenue',
    name: 'Recurring Revenue',
    friendlyName: 'Monthly Recurring vs One-Off Revenue',
    description: 'Percentage of revenue that recurs monthly',
    whyItMatters: 'Recurring revenue is predictable and valuable',
    whatToDo: 'Aim for 40%+. Create retainer or subscription offerings',
    category: 'PROFIT',
    industries: ['professional_services', 'consulting', 'accounting'],
    stages: ['GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 40
  },

  // ============= RETAIL & E-COMMERCE KPIs =============
  {
    id: 'inventory-turnover',
    name: 'Inventory Turnover',
    friendlyName: 'Stock Selling Speed',
    description: 'How many times you sell through your inventory per year',
    whyItMatters: 'Slow-moving stock ties up cash',
    whatToDo: 'If below 6x yearly, reduce slow sellers and order less',
    category: 'SYSTEMS',
    industries: ['retail', 'ecommerce'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'ratio',
    isUniversal: false,
    targetBenchmark: 8
  },
  {
    id: 'cart-abandonment',
    name: 'Cart Abandonment Rate',
    friendlyName: 'Abandoned Carts',
    description: 'Percentage of online carts that don\'t complete purchase',
    whyItMatters: 'They wanted to buy but something stopped them',
    whatToDo: 'If above 70%, simplify checkout and add trust signals',
    category: 'CONVERT',
    industries: ['ecommerce'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 65
  },
  {
    id: 'return-rate',
    name: 'Return Rate',
    friendlyName: 'Returns Rate',
    description: 'Percentage of sales that get returned',
    whyItMatters: 'Returns cost money and indicate problems',
    whatToDo: 'If above 10%, improve product descriptions and quality',
    category: 'DELIVER',
    industries: ['retail', 'ecommerce'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 5
  },
  {
    id: 'average-order-value',
    name: 'Average Order Value',
    friendlyName: 'Average Sale Size',
    description: 'Average amount customers spend per transaction',
    whyItMatters: 'Bigger baskets mean more profit per customer',
    whatToDo: 'Increase with bundles, upsells, and free shipping thresholds',
    category: 'CONVERT',
    industries: ['retail', 'ecommerce'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'currency',
    isUniversal: false
  },
  {
    id: 'stockout-frequency',
    name: 'Stockout Frequency',
    friendlyName: 'Out of Stock Times',
    description: 'Number of times popular items go out of stock',
    whyItMatters: 'Can\'t sell what you don\'t have',
    whatToDo: 'Set reorder points and safety stock for best sellers',
    category: 'SYSTEMS',
    industries: ['retail', 'ecommerce'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'number',
    isUniversal: false,
    targetBenchmark: 2
  },
  {
    id: 'store-conversion',
    name: 'Store Conversion Rate',
    friendlyName: 'Store Visitors Who Buy',
    description: 'Percentage of store visitors who make a purchase',
    whyItMatters: 'Shows if your store and staff are effective',
    whatToDo: 'If below 20%, improve displays and train staff',
    category: 'CONVERT',
    industries: ['retail'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'daily',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 25
  },
  {
    id: 'product-profitability',
    name: 'Product Profitability',
    friendlyName: 'Profit by Product Type',
    description: 'Which products make the most profit',
    whyItMatters: 'Some products make money, others don\'t',
    whatToDo: 'Promote high-margin items, discontinue losers',
    category: 'PROFIT',
    industries: ['retail', 'ecommerce'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'currency',
    isUniversal: false
  },

  // ============= OPERATIONS & LOGISTICS KPIs =============
  {
    id: 'delivery-ontime',
    name: 'On-Time Delivery Rate',
    friendlyName: 'Deliveries On Time',
    description: 'Percentage of deliveries that arrive when promised',
    whyItMatters: 'Late deliveries upset customers and cost money',
    whatToDo: 'If below 95%, review routes and add buffer time',
    category: 'DELIVER',
    industries: ['logistics', 'operations', 'delivery'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'daily',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 98
  },
  {
    id: 'vehicle-utilization',
    name: 'Vehicle Utilization',
    friendlyName: 'Vehicles Being Used',
    description: 'Percentage of time vehicles are actively delivering',
    whyItMatters: 'Idle vehicles cost money without earning',
    whatToDo: 'If below 75%, optimize routes or reduce fleet',
    category: 'SYSTEMS',
    industries: ['logistics', 'operations', 'delivery'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 80
  },
  {
    id: 'cost-per-delivery',
    name: 'Cost per Delivery',
    friendlyName: 'Cost Per Delivery',
    description: 'Total delivery costs divided by number of deliveries',
    whyItMatters: 'High costs eat into margins',
    whatToDo: 'Optimize routes, consolidate deliveries, negotiate fuel',
    category: 'PROFIT',
    industries: ['logistics', 'operations', 'delivery'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'currency',
    isUniversal: false
  },
  {
    id: 'route-efficiency',
    name: 'Route Efficiency',
    friendlyName: 'Delivery Route Efficiency',
    description: 'Actual vs optimal route distance',
    whyItMatters: 'Inefficient routes waste fuel and time',
    whatToDo: 'If below 85%, use route optimization software',
    category: 'SYSTEMS',
    industries: ['logistics', 'operations', 'delivery'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'weekly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 90
  },
  {
    id: 'damaged-goods',
    name: 'Damaged Goods Rate',
    friendlyName: 'Damaged Goods',
    description: 'Percentage of deliveries with damage claims',
    whyItMatters: 'Damage costs money and hurts reputation',
    whatToDo: 'If above 2%, improve handling and packaging',
    category: 'DELIVER',
    industries: ['logistics', 'operations', 'delivery'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'monthly',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 1
  },
  {
    id: 'pickup-punctuality',
    name: 'Pickup Punctuality',
    friendlyName: 'Pickup Punctuality',
    description: 'Percentage of pickups completed on time',
    whyItMatters: 'Late pickups delay everything downstream',
    whatToDo: 'If below 95%, adjust schedules and communicate better',
    category: 'DELIVER',
    industries: ['logistics', 'operations'],
    stages: ['FOUNDATION', 'TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'daily',
    unit: 'percentage',
    isUniversal: false,
    targetBenchmark: 98
  },
  {
    id: 'driver-productivity',
    name: 'Driver Productivity',
    friendlyName: 'Driver Jobs Per Day',
    description: 'Average deliveries completed per driver per day',
    whyItMatters: 'More deliveries per driver = lower cost per delivery',
    whatToDo: 'Optimize routes and reduce wait times',
    category: 'PEOPLE',
    industries: ['logistics', 'operations', 'delivery'],
    stages: ['TRACTION', 'GROWTH', 'SCALE'],
    frequency: 'daily',
    unit: 'number',
    isUniversal: false
  }
]

// Helper functions
const getRevenueStage = (revenue?: number): RevenueStage => {
  if (!revenue) return 'FOUNDATION'
  if (revenue < 250000) return 'FOUNDATION'
  if (revenue < 1000000) return 'TRACTION'
  if (revenue < 2500000) return 'GROWTH'
  return 'SCALE'
}

const mapIndustryString = (industry?: string): string => {
  if (!industry) return 'general'
  const lower = industry.toLowerCase()
  
  // Map various industry strings to our KPI categories
  if (lower.includes('construction') || lower.includes('building')) return 'building_construction'
  if (lower.includes('trade') || lower.includes('plumb') || lower.includes('electric') || lower.includes('hvac')) return 'trades'
  if (lower.includes('allied') || lower.includes('health') || lower.includes('physio') || lower.includes('psych')) return 'allied_health'
  if (lower.includes('ndis')) return 'ndis'
  if (lower.includes('aged') || lower.includes('care')) return 'aged_care'
  if (lower.includes('fitness') || lower.includes('gym') || lower.includes('pt')) return 'fitness'
  if (lower.includes('professional') || lower.includes('consult') || lower.includes('account') || lower.includes('legal')) return 'professional_services'
  if (lower.includes('retail')) return 'retail'
  if (lower.includes('ecom') || lower.includes('online')) return 'ecommerce'
  if (lower.includes('logistic') || lower.includes('delivery') || lower.includes('transport')) return 'logistics'
  if (lower.includes('operation')) return 'operations'
  
  return 'general'
}

const categoryIcons: Record<BusinessFunction, JSX.Element> = {
  ATTRACT: <Target className="w-4 h-4" />,
  CONVERT: <TrendingUp className="w-4 h-4" />,
  DELIVER: <Package className="w-4 h-4" />,
  DELIGHT: <Heart className="w-4 h-4" />,
  PEOPLE: <Users className="w-4 h-4" />,
  PROFIT: <DollarSign className="w-4 h-4" />,
  SYSTEMS: <Settings className="w-4 h-4" />
}

const categoryColors: Record<BusinessFunction, string> = {
  ATTRACT: 'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
  CONVERT: 'bg-brand-orange-100 text-brand-orange-800 border-brand-orange-200',
  DELIVER: 'bg-green-100 text-green-800 border-green-200',
  DELIGHT: 'bg-brand-orange-50 text-brand-orange-700 border-brand-orange-100',
  PEOPLE: 'bg-brand-orange/10 text-brand-orange-700 border-brand-orange/20',
  PROFIT: 'bg-brand-orange-100 text-brand-orange-800 border-brand-orange-200',
  SYSTEMS: 'bg-gray-100 text-gray-800 border-gray-200'
}

export default function EnhancedKPIModal({ isOpen, onClose, onSave, businessProfile }: EnhancedKPIModalProps) {
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('guided')
  const [selectedCategory, setSelectedCategory] = useState<BusinessFunction | null>(null)
  const [selectedKPIs, setSelectedKPIs] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [showWhyItMatters, setShowWhyItMatters] = useState<string | null>(null)

  // Determine business context
  const revenueStage = getRevenueStage(businessProfile.currentRevenue)
  const mappedIndustry = mapIndustryString(businessProfile.industry)

  // Filter KPIs based on context - FIXED to always include universals
  const availableKPIs = useMemo(() => {
    return ALL_KPIS.filter(kpi => {
      // Always include universal KPIs
      if (kpi.isUniversal) return true
      
      // Include industry-specific KPIs
      if (kpi.industries.includes('all')) return true
      if (kpi.industries.includes(mappedIndustry)) return true
      
      return false
    }).filter(kpi => {
      // Filter by revenue stage
      return kpi.stages.includes(revenueStage)
    })
  }, [mappedIndustry, revenueStage])

  // Quick Start KPIs (5 essentials)
  const quickStartKPIs = useMemo(() => {
    const essentialIds = [
      'gross-profit-margin',
      'cash-flow',
      'conversion-rate',
      'customer-satisfaction',
      'on-time-delivery'
    ]
    return availableKPIs.filter(kpi => essentialIds.includes(kpi.id))
  }, [availableKPIs])

  // Filtered KPIs based on search and category
  const filteredKPIs = useMemo(() => {
    let filtered = availableKPIs

    if (selectedCategory) {
      filtered = filtered.filter(kpi => kpi.category === selectedCategory)
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(kpi => 
        kpi.name.toLowerCase().includes(search) ||
        kpi.friendlyName.toLowerCase().includes(search) ||
        kpi.description.toLowerCase().includes(search)
      )
    }

    return filtered
  }, [availableKPIs, selectedCategory, searchTerm])

  // Group KPIs by category for guided mode
  const kpisByCategory = useMemo(() => {
    const grouped: Record<BusinessFunction, KPI[]> = {
      ATTRACT: [],
      CONVERT: [],
      DELIVER: [],
      DELIGHT: [],
      PEOPLE: [],
      PROFIT: [],
      SYSTEMS: []
    }

    availableKPIs.forEach(kpi => {
      grouped[kpi.category].push(kpi)
    })

    return grouped
  }, [availableKPIs])

  const toggleKPI = (kpiId: string) => {
    const newSelected = new Set(selectedKPIs)
    if (newSelected.has(kpiId)) {
      newSelected.delete(kpiId)
    } else {
      newSelected.add(kpiId)
    }
    setSelectedKPIs(newSelected)
  }

  const selectQuickStart = () => {
    const quickStartIds = new Set(quickStartKPIs.map(kpi => kpi.id))
    setSelectedKPIs(quickStartIds)
  }

  const handleSave = () => {
    const selected = availableKPIs.filter(kpi => selectedKPIs.has(kpi.id))
    onSave(selected)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Select Your KPIs</h2>
            <p className="text-sm text-gray-600 mt-1">
              Choose the key metrics to track your business success
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mode Selection */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <div className="flex space-x-4">
            <button
              onClick={() => setSelectionMode('quick')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectionMode === 'quick'
                  ? 'bg-brand-orange text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Zap className="w-4 h-4 inline mr-2" />
              Quick Start (5 Essential)
            </button>
            <button
              onClick={() => setSelectionMode('guided')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectionMode === 'guided'
                  ? 'bg-brand-orange text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Target className="w-4 h-4 inline mr-2" />
              Guided Selection
            </button>
            <button
              onClick={() => setSelectionMode('power')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectionMode === 'power'
                  ? 'bg-brand-orange text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Power User (All {availableKPIs.length})
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Panel - Categories (Guided Mode) */}
          {selectionMode === 'guided' && (
            <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
              <h3 className="font-semibold text-gray-900 mb-3">Business Functions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    !selectedCategory
                      ? 'bg-brand-orange-100 text-brand-orange-800'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  All Categories ({availableKPIs.length})
                </button>
                {Object.entries(kpisByCategory).map(([category, kpis]) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category as BusinessFunction)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                      selectedCategory === category
                        ? 'bg-brand-orange-100 text-brand-orange-800'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span className="flex items-center">
                      {categoryIcons[category as BusinessFunction]}
                      <span className="ml-2">{category}</span>
                    </span>
                    <span className="text-sm">({kpis.length})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Right Panel - KPI List */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Search Bar (Power User Mode) */}
            {selectionMode === 'power' && (
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search KPIs..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {/* Quick Start Mode */}
            {selectionMode === 'quick' && (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    5 Essential KPIs to Start
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    These are the most important metrics every {mappedIndustry.replace('_', ' ')} business should track
                  </p>
                  <button
                    onClick={selectQuickStart}
                    className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600"
                  >
                    Select All 5 Essential KPIs
                  </button>
                </div>
                <div className="space-y-3">
                  {quickStartKPIs.map(kpi => (
                    <KPICard
                      key={kpi.id}
                      kpi={kpi}
                      isSelected={selectedKPIs.has(kpi.id)}
                      onToggle={() => toggleKPI(kpi.id)}
                      showDetails={showWhyItMatters === kpi.id}
                      onToggleDetails={() => setShowWhyItMatters(
                        showWhyItMatters === kpi.id ? null : kpi.id
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Guided & Power User Modes */}
            {(selectionMode === 'guided' || selectionMode === 'power') && (
              <div>
                <div className="mb-4 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedCategory ? `${selectedCategory} KPIs` : 'Available KPIs'}
                    <span className="ml-2 text-sm font-normal text-gray-600">
                      ({filteredKPIs.length} available)
                    </span>
                  </h3>
                  <div className="text-sm text-gray-600">
                    {selectedKPIs.size} selected
                  </div>
                </div>
                <div className="space-y-3">
                  {filteredKPIs.map(kpi => (
                    <KPICard
                      key={kpi.id}
                      kpi={kpi}
                      isSelected={selectedKPIs.has(kpi.id)}
                      onToggle={() => toggleKPI(kpi.id)}
                      showDetails={showWhyItMatters === kpi.id}
                      onToggleDetails={() => setShowWhyItMatters(
                        showWhyItMatters === kpi.id ? null : kpi.id
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <AlertCircle className="w-4 h-4 inline mr-1" />
            You can always add or remove KPIs later
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={selectedKPIs.size === 0}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                selectedKPIs.size > 0
                  ? 'bg-brand-orange text-white hover:bg-brand-orange-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Save {selectedKPIs.size} KPIs
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// KPI Card Component
function KPICard({ 
  kpi, 
  isSelected, 
  onToggle, 
  showDetails, 
  onToggleDetails 
}: {
  kpi: KPI
  isSelected: boolean
  onToggle: () => void
  showDetails: boolean
  onToggleDetails: () => void
}) {
  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isSelected ? 'border-brand-orange-500 bg-brand-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              className="w-5 h-5 text-brand-orange rounded focus:ring-brand-orange"
            />
            <div className="ml-3">
              <h4 className="font-semibold text-gray-900">{kpi.name}</h4>
              <p className="text-sm text-gray-600">{kpi.friendlyName}</p>
            </div>
          </div>
          
          <p className="text-sm text-gray-700 mb-2 ml-8">{kpi.description}</p>
          
          <div className="flex items-center gap-4 ml-8">
            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${
              categoryColors[kpi.category]
            }`}>
              {categoryIcons[kpi.category]}
              <span className="ml-1">{kpi.category}</span>
            </span>
            
            <span className="text-xs text-gray-500">
              Track {kpi.frequency}
            </span>
            
            {kpi.targetBenchmark && (
              <span className="text-xs text-gray-500">
                Target: {kpi.unit === 'percentage' ? `${kpi.targetBenchmark}%` : 
                        kpi.unit === 'currency' ? `$${kpi.targetBenchmark}` :
                        kpi.unit === 'days' ? `${kpi.targetBenchmark} days` :
                        kpi.targetBenchmark}
              </span>
            )}
            
            {kpi.isUniversal && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                Universal
              </span>
            )}
          </div>
        </div>
        
        <button
          onClick={onToggleDetails}
          className="ml-4 text-gray-400 hover:text-gray-600"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>
      
      {showDetails && (
        <div className="mt-4 ml-8 p-3 bg-gray-50 rounded-lg">
          <div className="mb-3">
            <h5 className="font-semibold text-sm text-gray-900 mb-1">Why This Matters:</h5>
            <p className="text-sm text-gray-700">{kpi.whyItMatters}</p>
          </div>
          <div>
            <h5 className="font-semibold text-sm text-gray-900 mb-1">What To Do:</h5>
            <p className="text-sm text-gray-700">{kpi.whatToDo}</p>
          </div>
        </div>
      )}
    </div>
  )
}