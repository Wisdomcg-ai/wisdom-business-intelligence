// Industry-specific configurations for the 5 Ways revenue drivers
// Based on Brad Sugars' methodology, adapted for each industry

import type { IndustryConfig } from './types'

export const industryConfigs: Record<string, IndustryConfig> = {
  // ========== PROFESSIONAL SERVICES ==========
  accounting: {
    id: 'accounting',
    name: 'Accounting & Bookkeeping',
    fiveWaysLabels: {
      leads: 'New Enquiries',
      leadsDescription: 'Business owners reaching out for accounting services',
      conversion: 'Proposal Win Rate',
      conversionDescription: 'Percentage of proposals that become clients',
      transactions: 'Services per Client',
      transactionsDescription: 'Average number of service engagements per client per year (tax, BAS, advisory, etc.)',
      avgSale: 'Avg Service Fee',
      avgSaleDescription: 'Average fee per service engagement',
      margin: 'Gross Margin',
      marginDescription: 'After staff wages and direct costs'
    },
    benchmarks: {
      avgConversionRate: 40,
      avgMargin: 60,
      avgTransactionsPerCustomer: 4
    },
    cogsSuggestions: ['Staff Wages - Client Work', 'Contractor Fees', 'Software Subscriptions'],
    opexSuggestions: ['Rent', 'Admin Wages', 'Insurance', 'Marketing', 'Professional Development']
  },

  legal: {
    id: 'legal',
    name: 'Legal Services',
    fiveWaysLabels: {
      leads: 'New Matters Enquiries',
      leadsDescription: 'Potential clients reaching out for legal help',
      conversion: 'Engagement Rate',
      conversionDescription: 'Percentage of consultations that become paying matters',
      transactions: 'Matters per Client',
      transactionsDescription: 'Average number of matters per client per year',
      avgSale: 'Avg Matter Value',
      avgSaleDescription: 'Average fees billed per matter',
      margin: 'Realisation Rate',
      marginDescription: 'Effective margin after write-offs and discounts'
    },
    benchmarks: {
      avgConversionRate: 35,
      avgMargin: 55,
      avgTransactionsPerCustomer: 1.5
    },
    cogsSuggestions: ['Solicitor Wages', 'Paralegal Wages', 'Searches & Disbursements'],
    opexSuggestions: ['Rent', 'Admin Staff', 'Insurance', 'Law Society Fees', 'Marketing']
  },

  consulting: {
    id: 'consulting',
    name: 'Consulting & Advisory',
    fiveWaysLabels: {
      leads: 'Discovery Calls',
      leadsDescription: 'Qualified leads booking discovery calls',
      conversion: 'Close Rate',
      conversionDescription: 'Percentage of discovery calls that become projects',
      transactions: 'Projects per Client',
      transactionsDescription: 'Average number of projects per client per year',
      avgSale: 'Avg Project Value',
      avgSaleDescription: 'Average revenue per project',
      margin: 'Delivery Margin',
      marginDescription: 'After consultant wages and direct project costs'
    },
    benchmarks: {
      avgConversionRate: 30,
      avgMargin: 50,
      avgTransactionsPerCustomer: 2
    },
    cogsSuggestions: ['Consultant Wages', 'Contractor Fees', 'Travel & Expenses'],
    opexSuggestions: ['Rent', 'Marketing', 'Admin', 'Software', 'Professional Development']
  },

  // ========== TRADES & CONSTRUCTION ==========
  construction: {
    id: 'construction',
    name: 'Construction & Building',
    fiveWaysLabels: {
      leads: 'Quote Requests',
      leadsDescription: 'Number of jobs you\'re asked to quote on',
      conversion: 'Quote Win Rate',
      conversionDescription: 'Percentage of quotes that win the job',
      transactions: 'Jobs per Client',
      transactionsDescription: 'Average jobs per client per year (including referrals)',
      avgSale: 'Avg Job Value',
      avgSaleDescription: 'Average contract value per job',
      margin: 'Gross Margin',
      marginDescription: 'After materials, subcontractors, and direct labour'
    },
    benchmarks: {
      avgConversionRate: 25,
      avgMargin: 25,
      avgTransactionsPerCustomer: 1.2
    },
    cogsSuggestions: ['Materials', 'Subcontractors', 'Labour - Site', 'Equipment Hire', 'Permits & Fees'],
    opexSuggestions: ['Rent', 'Admin Wages', 'Insurance', 'Vehicle Costs', 'Marketing']
  },

  electrical: {
    id: 'electrical',
    name: 'Electrical Contracting',
    fiveWaysLabels: {
      leads: 'Quote Requests',
      leadsDescription: 'Call-outs and quote requests received',
      conversion: 'Quote to Job Rate',
      conversionDescription: 'Percentage of quotes that become jobs',
      transactions: 'Jobs per Customer',
      transactionsDescription: 'Average jobs per customer per year',
      avgSale: 'Avg Job Value',
      avgSaleDescription: 'Average revenue per job',
      margin: 'Job Margin',
      marginDescription: 'After materials and direct labour'
    },
    benchmarks: {
      avgConversionRate: 60,
      avgMargin: 40,
      avgTransactionsPerCustomer: 1.8
    },
    cogsSuggestions: ['Materials', 'Electrician Wages', 'Apprentice Wages', 'Vehicle Running'],
    opexSuggestions: ['Rent', 'Admin', 'Insurance', 'Licensing', 'Marketing']
  },

  plumbing: {
    id: 'plumbing',
    name: 'Plumbing Services',
    fiveWaysLabels: {
      leads: 'Service Calls',
      leadsDescription: 'Enquiries and emergency call-outs',
      conversion: 'Call to Job Rate',
      conversionDescription: 'Percentage of calls that become paying jobs',
      transactions: 'Jobs per Customer',
      transactionsDescription: 'Average jobs per customer per year',
      avgSale: 'Avg Job Value',
      avgSaleDescription: 'Average revenue per service call',
      margin: 'Job Margin',
      marginDescription: 'After parts and direct labour'
    },
    benchmarks: {
      avgConversionRate: 70,
      avgMargin: 45,
      avgTransactionsPerCustomer: 1.5
    },
    cogsSuggestions: ['Parts & Materials', 'Plumber Wages', 'Apprentice Wages', 'Vehicle Running'],
    opexSuggestions: ['Rent', 'Admin', 'Insurance', 'Licensing', 'Marketing']
  },

  // ========== RETAIL & HOSPITALITY ==========
  retail: {
    id: 'retail',
    name: 'Retail Store',
    fiveWaysLabels: {
      leads: 'Store Visitors',
      leadsDescription: 'Number of people walking into your store',
      conversion: 'Browser to Buyer Rate',
      conversionDescription: 'Percentage of visitors who make a purchase',
      transactions: 'Purchases per Year',
      transactionsDescription: 'Average number of purchases per customer per year',
      avgSale: 'Avg Basket Size',
      avgSaleDescription: 'Average spend per transaction',
      margin: 'Gross Margin',
      marginDescription: 'After cost of goods sold'
    },
    benchmarks: {
      avgConversionRate: 20,
      avgMargin: 50,
      avgTransactionsPerCustomer: 3
    },
    cogsSuggestions: ['Cost of Goods Sold', 'Freight In', 'Packaging'],
    opexSuggestions: ['Rent', 'Staff Wages', 'Utilities', 'Marketing', 'POS System']
  },

  restaurant: {
    id: 'restaurant',
    name: 'Restaurant & Hospitality',
    fiveWaysLabels: {
      leads: 'Daily Covers',
      leadsDescription: 'Number of customers served per day',
      conversion: 'Booking to Attendance',
      conversionDescription: 'Percentage of bookings that show up (or walk-ins for casual)',
      transactions: 'Visits per Customer',
      transactionsDescription: 'Average visits per customer per year',
      avgSale: 'Avg Spend per Head',
      avgSaleDescription: 'Average spend per customer including drinks',
      margin: 'Food & Bev Margin',
      marginDescription: 'After food and beverage costs'
    },
    benchmarks: {
      avgConversionRate: 85,
      avgMargin: 65,
      avgTransactionsPerCustomer: 4
    },
    cogsSuggestions: ['Food Costs', 'Beverage Costs', 'Kitchen Wages', 'Floor Staff Wages'],
    opexSuggestions: ['Rent', 'Utilities', 'Marketing', 'Equipment Maintenance', 'Cleaning']
  },

  // ========== HEALTH & WELLNESS ==========
  medical: {
    id: 'medical',
    name: 'Medical Practice',
    fiveWaysLabels: {
      leads: 'New Patient Enquiries',
      leadsDescription: 'New patients calling to book appointments',
      conversion: 'Enquiry to Patient Rate',
      conversionDescription: 'Percentage of enquiries that become regular patients',
      transactions: 'Visits per Patient',
      transactionsDescription: 'Average consultations per patient per year',
      avgSale: 'Avg Consult Value',
      avgSaleDescription: 'Average revenue per consultation',
      margin: 'Practice Margin',
      marginDescription: 'After medical supplies and practitioner costs'
    },
    benchmarks: {
      avgConversionRate: 75,
      avgMargin: 45,
      avgTransactionsPerCustomer: 4
    },
    cogsSuggestions: ['Medical Supplies', 'Practitioner Wages', 'Lab Tests'],
    opexSuggestions: ['Rent', 'Admin Staff', 'Insurance', 'Equipment Leasing', 'Software']
  },

  dental: {
    id: 'dental',
    name: 'Dental Practice',
    fiveWaysLabels: {
      leads: 'New Patient Enquiries',
      leadsDescription: 'New patients calling or booking online',
      conversion: 'Booking Rate',
      conversionDescription: 'Percentage of enquiries that book an appointment',
      transactions: 'Visits per Patient',
      transactionsDescription: 'Average visits per patient per year',
      avgSale: 'Avg Treatment Value',
      avgSaleDescription: 'Average revenue per visit',
      margin: 'Treatment Margin',
      marginDescription: 'After dental supplies and lab fees'
    },
    benchmarks: {
      avgConversionRate: 80,
      avgMargin: 55,
      avgTransactionsPerCustomer: 2
    },
    cogsSuggestions: ['Dental Supplies', 'Lab Fees', 'Dentist Wages', 'Hygienist Wages'],
    opexSuggestions: ['Rent', 'Reception Staff', 'Insurance', 'Equipment Leasing', 'Marketing']
  },

  gym: {
    id: 'gym',
    name: 'Gym & Fitness',
    fiveWaysLabels: {
      leads: 'Trial Sign-ups',
      leadsDescription: 'People signing up for trials or enquiring',
      conversion: 'Trial to Member Rate',
      conversionDescription: 'Percentage of trials that become paying members',
      transactions: 'Avg Months Retained',
      transactionsDescription: 'Average membership length in months',
      avgSale: 'Monthly Membership',
      avgSaleDescription: 'Average monthly membership fee',
      margin: 'Membership Margin',
      marginDescription: 'After trainer costs and direct expenses'
    },
    benchmarks: {
      avgConversionRate: 50,
      avgMargin: 70,
      avgTransactionsPerCustomer: 8
    },
    cogsSuggestions: ['Trainer Wages', 'Class Instructors', 'Equipment Maintenance'],
    opexSuggestions: ['Rent', 'Utilities', 'Reception Staff', 'Marketing', 'Cleaning']
  },

  // ========== TECHNOLOGY ==========
  saas: {
    id: 'saas',
    name: 'SaaS / Software',
    fiveWaysLabels: {
      leads: 'Trial Sign-ups',
      leadsDescription: 'Free trial or demo requests',
      conversion: 'Trial to Paid Rate',
      conversionDescription: 'Percentage of trials that convert to paid',
      transactions: 'Months Retained (LTV)',
      transactionsDescription: 'Average customer lifetime in months',
      avgSale: 'Monthly MRR',
      avgSaleDescription: 'Average monthly recurring revenue per customer',
      margin: 'Gross Margin',
      marginDescription: 'After hosting and support costs'
    },
    benchmarks: {
      avgConversionRate: 15,
      avgMargin: 80,
      avgTransactionsPerCustomer: 24
    },
    cogsSuggestions: ['Hosting Costs', 'Support Staff', 'Third-party APIs'],
    opexSuggestions: ['Development Team', 'Sales Team', 'Marketing', 'Admin', 'Software']
  },

  it_services: {
    id: 'it_services',
    name: 'IT Services & MSP',
    fiveWaysLabels: {
      leads: 'Sales Opportunities',
      leadsDescription: 'Qualified leads from referrals or marketing',
      conversion: 'Proposal Win Rate',
      conversionDescription: 'Percentage of proposals that win',
      transactions: 'Services per Client',
      transactionsDescription: 'Average number of service engagements per year',
      avgSale: 'Avg Monthly Contract',
      avgSaleDescription: 'Average monthly recurring revenue per client',
      margin: 'Service Margin',
      marginDescription: 'After technician costs and tools'
    },
    benchmarks: {
      avgConversionRate: 35,
      avgMargin: 55,
      avgTransactionsPerCustomer: 12
    },
    cogsSuggestions: ['Technician Wages', 'Software Licenses', 'Hardware Costs'],
    opexSuggestions: ['Rent', 'Admin', 'Marketing', 'Training', 'Insurance']
  },

  // ========== DEFAULT ==========
  other: {
    id: 'other',
    name: 'Other Business',
    fiveWaysLabels: {
      leads: 'Leads',
      leadsDescription: 'New enquiries or potential customers',
      conversion: 'Conversion Rate',
      conversionDescription: 'Percentage of leads that become customers',
      transactions: 'Transactions per Customer',
      transactionsDescription: 'Average purchases per customer per year',
      avgSale: 'Average Sale Value',
      avgSaleDescription: 'Average revenue per transaction',
      margin: 'Gross Margin',
      marginDescription: 'Revenue minus direct costs'
    },
    benchmarks: {
      avgConversionRate: 25,
      avgMargin: 40,
      avgTransactionsPerCustomer: 2
    },
    cogsSuggestions: ['Cost of Goods', 'Direct Labour', 'Materials'],
    opexSuggestions: ['Rent', 'Wages', 'Marketing', 'Insurance', 'Utilities']
  }
}

// Helper to get config by industry string (handles variations)
export function getIndustryConfig(industry: string | undefined): IndustryConfig {
  if (!industry) return industryConfigs.other

  const normalized = industry.toLowerCase().replace(/[_\s-]+/g, '_')

  // Direct match
  if (industryConfigs[normalized]) {
    return industryConfigs[normalized]
  }

  // Fuzzy matching for common variations
  const mappings: Record<string, string> = {
    'accountant': 'accounting',
    'bookkeeper': 'accounting',
    'bookkeeping': 'accounting',
    'lawyer': 'legal',
    'law': 'legal',
    'solicitor': 'legal',
    'builder': 'construction',
    'building': 'construction',
    'electrician': 'electrical',
    'plumber': 'plumbing',
    'cafe': 'restaurant',
    'hospitality': 'restaurant',
    'food': 'restaurant',
    'doctor': 'medical',
    'healthcare': 'medical',
    'health': 'medical',
    'dentist': 'dental',
    'fitness': 'gym',
    'personal_training': 'gym',
    'software': 'saas',
    'technology': 'saas',
    'it': 'it_services',
    'msp': 'it_services',
    'managed_services': 'it_services',
    'professional_services': 'consulting',
    'advisory': 'consulting',
    'coach': 'consulting',
    'coaching': 'consulting',
    'shop': 'retail',
    'store': 'retail',
    'ecommerce': 'retail',
    'trades': 'construction',
    'tradie': 'construction'
  }

  for (const [key, value] of Object.entries(mappings)) {
    if (normalized.includes(key)) {
      return industryConfigs[value]
    }
  }

  return industryConfigs.other
}

// Get all available industries for dropdown
export function getAllIndustries(): { id: string; name: string }[] {
  return Object.values(industryConfigs).map(config => ({
    id: config.id,
    name: config.name
  }))
}
