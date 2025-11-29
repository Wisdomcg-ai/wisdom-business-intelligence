// /app/goals/utils/constants.ts
// All KPI definitions and strategic recommendations

import { KPIData } from '../types'

// Standard KPIs that all businesses should track
export const STANDARD_KPIS: KPIData[] = [
  {
    id: 'leads',
    name: 'Leads',
    friendlyName: 'Number of leads generated',
    category: 'Marketing',
    currentValue: 50,
    year1Target: 100,
    year2Target: 200,
    year3Target: 400,
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of qualified leads generated',
    isStandard: true
  },
  {
    id: 'conversion',
    name: 'Conversion Rate',
    friendlyName: 'Lead to customer conversion rate',
    category: 'Sales',
    currentValue: 10,
    year1Target: 15,
    year2Target: 20,
    year3Target: 25,
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of leads that become customers',
    isStandard: true
  },
  {
    id: 'gross-profit-margin',
    name: 'Gross Profit Margin',
    friendlyName: 'Money You Keep After Direct Costs',
    category: 'Financial',
    currentValue: 40,
    year1Target: 45,
    year2Target: 45,
    year3Target: 45,
    unit: 'percentage',
    frequency: 'monthly',
    description: 'The percentage of revenue left after paying for direct costs',
    isStandard: true
  },
  {
    id: 'net-profit-margin',
    name: 'Net Profit Margin',
    friendlyName: 'Money You Keep After Everything',
    category: 'Financial',
    currentValue: 10,
    year1Target: 15,
    year2Target: 20,
    year3Target: 20,
    unit: 'percentage',
    frequency: 'monthly',
    description: 'The percentage of revenue you actually keep after ALL expenses',
    isStandard: true
  },
  {
    id: 'cash-flow',
    name: 'Cash Flow',
    friendlyName: 'Money In vs Money Out',
    category: 'Financial',
    currentValue: 0,
    year1Target: 0,
    year2Target: 0,
    year3Target: 0,
    unit: 'currency',
    frequency: 'weekly',
    description: 'The actual cash coming in and going out of your business',
    isStandard: true
  },
  {
    id: 'customer-satisfaction',
    name: 'Customer Satisfaction',
    friendlyName: 'How Happy Your Customers Are',
    category: 'Customer',
    currentValue: 8,
    year1Target: 9,
    year2Target: 9,
    year3Target: 9,
    unit: 'number',
    frequency: 'monthly',
    description: 'Average rating customers give your service (usually 1-10)',
    isStandard: true
  }
]

// Industry-specific KPIs
export const INDUSTRY_KPIS: Record<string, KPIData[]> = {
  building_construction: [
    {
      id: 'project-pipeline',
      name: 'Project Pipeline Value',
      friendlyName: 'Total value of projects in pipeline',
      category: 'Sales',
      currentValue: 2000000,
      year1Target: 3000000,
      year2Target: 5000000,
      year3Target: 8000000,
      unit: 'currency',
      frequency: 'monthly',
      description: 'Total value of potential projects',
      isIndustry: true
    },
    {
      id: 'jobs-completed',
      name: 'Jobs Completed',
      friendlyName: 'Projects Finished This Month',
      category: 'Operations',
      currentValue: 5,
      year1Target: 8,
      year2Target: 12,
      year3Target: 15,
      unit: 'number',
      frequency: 'monthly',
      description: 'Number of jobs fully completed and handed over',
      isIndustry: true
    },
    {
      id: 'quote-conversion',
      name: 'Quote Conversion Rate',
      friendlyName: 'Quotes That Become Jobs',
      category: 'Sales',
      currentValue: 25,
      year1Target: 30,
      year2Target: 35,
      year3Target: 40,
      unit: 'percentage',
      frequency: 'monthly',
      description: 'Percentage of quotes that turn into actual work',
      isIndustry: true
    }
  ],
  allied_health: [
    {
      id: 'patient-satisfaction',
      name: 'Patient Satisfaction',
      friendlyName: 'Average patient satisfaction score',
      category: 'Customer',
      currentValue: 8,
      year1Target: 9,
      year2Target: 9.2,
      year3Target: 9.5,
      unit: 'number',
      frequency: 'monthly',
      description: 'Patient satisfaction score (out of 10)',
      isIndustry: true
    },
    {
      id: 'appointment-attendance',
      name: 'Appointment Attendance',
      friendlyName: 'Clients Showing Up',
      category: 'Operations',
      currentValue: 85,
      year1Target: 90,
      year2Target: 92,
      year3Target: 95,
      unit: 'percentage',
      frequency: 'weekly',
      description: 'Percentage of booked appointments where clients actually attend',
      isIndustry: true
    },
    {
      id: 'client-capacity',
      name: 'Client Capacity Utilization',
      friendlyName: 'Schedule Utilization',
      category: 'Operations',
      currentValue: 70,
      year1Target: 80,
      year2Target: 85,
      year3Target: 90,
      unit: 'percentage',
      frequency: 'weekly',
      description: 'Percentage of available appointment slots filled',
      isIndustry: true
    }
  ],
  professional_services: [
    {
      id: 'billable-rate',
      name: 'Average Billable Rate',
      friendlyName: 'Average hourly billable rate',
      category: 'Financial',
      currentValue: 150,
      year1Target: 175,
      year2Target: 200,
      year3Target: 250,
      unit: 'currency',
      frequency: 'monthly',
      description: 'Average rate charged per hour',
      isIndustry: true
    },
    {
      id: 'billable-utilization',
      name: 'Billable Utilization',
      friendlyName: 'Hours You Can Bill',
      category: 'Operations',
      currentValue: 70,
      year1Target: 75,
      year2Target: 80,
      year3Target: 85,
      unit: 'percentage',
      frequency: 'weekly',
      description: 'Percentage of available hours that are billable to clients',
      isIndustry: true
    },
    {
      id: 'project-profitability',
      name: 'Project Profitability',
      friendlyName: 'Profit Per Project',
      category: 'Financial',
      currentValue: 30,
      year1Target: 35,
      year2Target: 40,
      year3Target: 45,
      unit: 'percentage',
      frequency: 'monthly',
      description: 'Average profit margin on completed projects',
      isIndustry: true
    }
  ],
  retail: [
    {
      id: 'same-store-sales',
      name: 'Same Store Sales Growth',
      friendlyName: 'Year over year sales growth',
      category: 'Sales',
      currentValue: 5,
      year1Target: 8,
      year2Target: 10,
      year3Target: 12,
      unit: 'percentage',
      frequency: 'monthly',
      description: 'YoY growth for same locations',
      isIndustry: true
    },
    {
      id: 'inventory-turnover',
      name: 'Inventory Turnover',
      friendlyName: 'Stock Selling Speed',
      category: 'Operations',
      currentValue: 6,
      year1Target: 7,
      year2Target: 8,
      year3Target: 9,
      unit: 'number',
      frequency: 'monthly',
      description: 'How many times you sell through inventory per year',
      isIndustry: true
    },
    {
      id: 'store-conversion',
      name: 'Store Conversion Rate',
      friendlyName: 'Store Visitors Who Buy',
      category: 'Sales',
      currentValue: 20,
      year1Target: 22,
      year2Target: 25,
      year3Target: 28,
      unit: 'percentage',
      frequency: 'daily',
      description: 'Percentage of store visitors who make a purchase',
      isIndustry: true
    }
  ]
}

// Strategic recommendations for roadmap
export const ROADMAP_RECOMMENDATIONS = [
  'Build management infrastructure & delegation',
  'Systematize core business processes',
  'Develop 3-5 key KPIs for accountability',
  'Create weekly leadership meeting cadence',
  'Document standard operating procedures',
  'Implement project management system',
  'Build sales pipeline & qualification process',
  'Create customer feedback loop',
  'Develop employee onboarding system',
  'Establish quarterly business review process'
]