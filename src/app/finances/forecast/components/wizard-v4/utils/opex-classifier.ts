/**
 * OpEx Smart Classifier - Production Grade
 *
 * Comprehensive expense classification for Australian SMBs.
 * Uses multiple strategies:
 * 1. Exact keyword matching (highest confidence)
 * 2. Partial/fuzzy keyword matching
 * 3. Pattern analysis from prior year data (CV analysis)
 * 4. Industry-specific overrides
 *
 * NOTE: Team costs (wages, super, payroll tax, contractors) are handled
 * separately in the Team tab and should be excluded from OpEx classification.
 */

import { CostBehavior } from '../types';

// ============================================================================
// TEAM COST DETECTION
// ============================================================================

const TEAM_COST_KEYWORDS = [
  // Wages & Salaries
  'salary', 'salaries', 'wage', 'wages', 'payroll',
  // Super
  'superannuation', 'super guarantee', 'sgc',
  // Employment related
  'contractor', 'subcontractor', 'labour', 'labor',
  'workers comp', 'workers compensation', 'workcover',
  'staff cost', 'employee', 'personnel',
  'director fee', 'directors fee',
  // Leave provisions
  'annual leave', 'sick leave', 'leave provision', 'leave entitlement',
  // Benefits
  'fringe benefit', 'fbt', 'allowance',
  // Payroll tax
  'payroll tax', 'payroll levy',
];

// ============================================================================
// COMPREHENSIVE CLASSIFICATION PATTERNS
// ============================================================================

const CLASSIFICATION_PATTERNS: Record<CostBehavior, string[]> = {
  fixed: [
    // ===== PREMISES & OCCUPANCY =====
    'rent', 'lease', 'premises', 'occupancy',
    'office rent', 'warehouse rent', 'shop rent', 'factory rent',
    'body corporate', 'strata', 'outgoings',
    'council rate', 'land rate', 'rate', 'land tax',
    'property', 'building',

    // ===== INSURANCE =====
    'insurance', 'insur',
    'public liability', 'professional indemnity', 'pi insurance',
    'business insurance', 'contents insurance', 'building insurance',
    'income protection', 'key person', 'life insurance',
    'vehicle insurance', 'motor insurance', 'car insurance',
    'cyber insurance', 'management liability',

    // ===== SUBSCRIPTIONS & SOFTWARE =====
    'subscription', 'software', 'saas', 'license', 'licence',
    'app', 'platform', 'tool', 'system',
    // Common software names
    'xero', 'myob', 'quickbooks', 'reckon', 'sage',
    'microsoft', 'office 365', 'm365', 'adobe', 'google workspace', 'gsuite',
    'slack', 'zoom', 'teams', 'dropbox', 'onedrive', 'sharepoint',
    'hubspot', 'salesforce', 'mailchimp', 'klaviyo', 'activecampaign',
    'canva', 'figma', 'notion', 'asana', 'monday', 'trello', 'jira',
    'github', 'gitlab', 'bitbucket', 'aws', 'azure', 'gcp',
    'shopify', 'woocommerce', 'bigcommerce', 'squarespace', 'wix',
    'servicem8', 'jobber', 'tradify', 'simPRO', 'fergus',
    'deputy', 'tanda', 'employment hero', 'humanforce',
    'cin7', 'dear', 'unleashed', 'inventory', 'fishbowl',

    // ===== COMMUNICATIONS =====
    'telephone', 'phone', 'mobile', 'landline',
    'internet', 'broadband', 'nbn', 'fibre', 'wifi',
    'telstra', 'optus', 'vodafone', 'tpg', 'aussie broadband',
    'communications', 'telecom',

    // ===== PROFESSIONAL MEMBERSHIPS =====
    'membership', 'member', 'dues', 'subscription fee',
    'association', 'registration', 'accreditation', 'certification',
    'professional body', 'industry body',
    'cpa', 'ca anz', 'ica', 'law society', 'ama', 'aia', 'mba',
    'chamber of commerce', 'cci', 'business chamber',

    // ===== FIXED SERVICES =====
    'cleaning', 'cleaner', 'janitorial',
    'security', 'alarm', 'monitoring', 'cctv', 'surveillance',
    'pest control', 'termite',
    'waste', 'rubbish', 'garbage', 'bin', 'skip',
    'garden', 'landscaping', 'lawn', 'grounds',

    // ===== PROFESSIONAL SERVICES (RETAINER) =====
    'bookkeep', 'accounting fee', 'accountancy', 'accountant',
    'audit', 'tax agent', 'bas agent',
    'it support', 'it service', 'managed service', 'tech support',
    'hr service', 'payroll service',

    // ===== FINANCE COSTS =====
    'bank fee', 'bank charge', 'account fee', 'monthly fee',
    'interest', 'loan interest', 'finance charge', 'finance cost',
    'line of credit', 'overdraft',

    // ===== DEPRECIATION & AMORTISATION =====
    'depreciation', 'amortisation', 'amortization',

    // ===== WEBSITE & HOSTING =====
    'hosting', 'web hosting', 'domain', 'ssl', 'cdn',
    'website', 'web service',
  ],

  variable: [
    // ===== MARKETING & ADVERTISING =====
    'marketing', 'advertising', 'advert', 'promo',
    'google ads', 'facebook ads', 'meta ads', 'instagram ads', 'linkedin ads',
    'social media', 'seo', 'sem', 'ppc', 'cpc', 'digital marketing',
    'campaign', 'promotion', 'branding',
    'lead gen', 'leads',

    // ===== PAYMENT PROCESSING =====
    'merchant', 'payment processing', 'transaction fee',
    'stripe', 'square', 'paypal', 'tyro', 'zeller', 'eftpos',
    'credit card fee', 'card fee', 'gateway',
    'afterpay', 'zip', 'klarna', 'bnpl',

    // ===== DELIVERY & FREIGHT =====
    'freight', 'shipping', 'postage', 'delivery', 'courier',
    'auspost', 'australia post', 'startrack', 'toll', 'tnt',
    'dhl', 'fedex', 'ups', 'sendle', 'fastway', 'aramex',
    'packaging', 'packing',

    // ===== SALES RELATED =====
    'commission', 'referral', 'affiliate',
    'sales expense', 'selling expense', 'cost of sale',
    'client entertainment', 'customer entertainment',
    'gift', 'hamper', 'promotional item',

    // ===== SUPPLIES THAT SCALE =====
    'printing', 'print', 'stationery', 'office supplies', 'consumable',
    'cartridge', 'toner', 'ink', 'paper',

    // ===== DIRECT/VARIABLE COSTS =====
    'direct cost', 'variable cost', 'job cost',
    'material', 'supplies',
  ],

  seasonal: [
    // ===== UTILITIES =====
    'electricity', 'electric', 'power',
    'gas', 'natural gas',
    'water', 'sewerage',
    'utilities', 'utility', 'energy',
    'agl', 'origin', 'energyaustralia', 'alinta', 'red energy',

    // ===== CLIMATE CONTROL =====
    'heating', 'cooling', 'hvac', 'air conditioning', 'aircon',

    // ===== SEASONAL EVENTS =====
    'christmas', 'xmas', 'eofy', 'end of financial year',
    'black friday', 'cyber monday', 'boxing day',
    'seasonal', 'holiday', 'festive',
  ],

  adhoc: [
    // ===== TRAVEL =====
    'travel', 'travelling', 'traveling',
    'airfare', 'flight', 'airline',
    'accommodation', 'hotel', 'motel', 'lodging',
    'uber', 'taxi', 'cab', 'rideshare', 'didi', 'ola',
    'parking', 'toll', 'tolls',
    'car hire', 'vehicle hire', 'rental car',

    // ===== MOTOR VEHICLE (NON-FLEET) =====
    'motor vehicle', 'vehicle expense', 'car expense',
    'fuel', 'petrol', 'diesel', 'gas',
    'mileage', 'kilometre', 'kilometer',
    'rego', 'registration', 'roadworthy', 'rwc',
    'car service', 'vehicle service',

    // ===== REPAIRS & MAINTENANCE =====
    'repair', 'maintenance', 'r&m', 'r & m',
    'fix', 'replace', 'restoration',

    // ===== PROFESSIONAL FEES (PROJECT-BASED) =====
    'legal', 'lawyer', 'solicitor', 'barrister', 'litigation',
    'consulting', 'consultant', 'advisor', 'advisory',
    'specialist', 'expert',

    // ===== TRAINING & DEVELOPMENT =====
    'training', 'course', 'workshop', 'seminar', 'webinar',
    'conference', 'convention', 'summit', 'expo',
    'professional development', 'pd', 'cpd', 'education',
    'coaching', 'mentoring',

    // ===== EQUIPMENT & IT =====
    'equipment', 'computer', 'laptop', 'hardware',
    'it equipment', 'tech', 'device',
    'minor asset', 'small asset', 'low value asset',
    'furniture', 'fitout', 'fit out', 'fit-out',

    // ===== RECRUITMENT =====
    'recruitment', 'recruiting', 'hiring',
    'job ad', 'seek', 'indeed', 'linkedin job',
    'placement', 'headhunter',

    // ===== ONE-OFF / IRREGULAR =====
    'bad debt', 'write off', 'write-off', 'provision',
    'donation', 'charity', 'sponsorship',
    'fine', 'penalty', 'infringement',
    'government fee', 'statutory', 'compliance',
    'permit', 'licence fee', 'license fee',
    'relocation', 'moving',
    'signage', 'sign',
    'uniform', 'workwear', 'ppe', 'safety gear',
    'first aid', 'safety', 'ohs', 'whs',
    'tea', 'coffee', 'kitchen', 'amenities', 'staff amenity',
    'meal', 'food', 'catering', 'lunch',
    'entertainment', 'event', 'function',

    // ===== CATCH-ALL GENERIC NAMES =====
    'miscellaneous', 'misc', 'sundry', 'sundries',
    'other', 'general', 'various',
    'expense', 'cost', 'charge',
    'admin', 'administrative', 'general & admin', 'g&a',
  ],
};

// ============================================================================
// INDUSTRY-SPECIFIC OVERRIDES
// ============================================================================

const INDUSTRY_OVERRIDES: Record<string, Record<string, CostBehavior>> = {
  retail: {
    marketing: 'seasonal',
    advertising: 'seasonal',
    packaging: 'variable',
  },
  restaurant: {
    electricity: 'seasonal',
    gas: 'seasonal',
    cleaning: 'variable',
    food: 'variable',
    supplies: 'variable',
  },
  hospitality: {
    electricity: 'seasonal',
    gas: 'seasonal',
    cleaning: 'variable',
    laundry: 'variable',
    amenities: 'variable',
  },
  construction: {
    equipment: 'adhoc',
    hire: 'adhoc',
    scaffolding: 'adhoc',
    skip: 'adhoc',
    tool: 'adhoc',
    fuel: 'variable',
    material: 'variable',
  },
  trades: {
    fuel: 'variable',
    material: 'variable',
    tool: 'adhoc',
  },
  accounting: {
    marketing: 'fixed',
    software: 'fixed',
  },
  legal: {
    marketing: 'fixed',
    research: 'fixed',
  },
  consulting: {
    marketing: 'fixed',
    travel: 'variable',
  },
  medical: {
    supplies: 'variable',
    consumable: 'variable',
    cleaning: 'variable',
  },
  dental: {
    supplies: 'variable',
    lab: 'variable',
    consumable: 'variable',
  },
  gym: {
    electricity: 'seasonal',
    cleaning: 'fixed',
    equipment: 'adhoc',
  },
  fitness: {
    electricity: 'seasonal',
    equipment: 'adhoc',
  },
  saas: {
    hosting: 'fixed',
    cloud: 'fixed',
    aws: 'fixed',
    azure: 'fixed',
    infrastructure: 'fixed',
  },
  ecommerce: {
    shipping: 'variable',
    packaging: 'variable',
    merchant: 'variable',
    platform: 'fixed',
  },
  manufacturing: {
    material: 'variable',
    supplies: 'variable',
    freight: 'variable',
    electricity: 'seasonal',
  },
  agriculture: {
    fuel: 'seasonal',
    supplies: 'seasonal',
    water: 'seasonal',
  },
};

// ============================================================================
// TYPES
// ============================================================================

export interface ClassificationResult {
  behavior: CostBehavior;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  isTeamCost: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize account name for matching
 * Handles common Xero/MYOB formatting patterns
 */
function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    // Remove account codes (e.g., "6-1234 Rent" -> "rent")
    .replace(/^\d+[-.]?\d*\s*/, '')
    // Remove common prefixes
    .replace(/^(expense|opex|cost|overhead)[\s:-]+/i, '')
    // Remove special characters but keep spaces and ampersands
    .replace(/[^\w\s&-]/g, ' ')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if an account name represents a team cost
 */
export function isTeamCost(accountName: string): boolean {
  const normalized = normalizeAccountName(accountName);

  // Check if "super" appears but not as part of another word like "supermarket"
  if (/\bsuper\b/.test(normalized) && !normalized.includes('supermarket')) {
    return true;
  }

  return TEAM_COST_KEYWORDS.some(keyword => normalized.includes(keyword));
}

/**
 * Match keywords with word boundary awareness
 */
function matchKeyword(text: string, keyword: string): boolean {
  // For short keywords (3 chars or less), require word boundaries
  if (keyword.length <= 3) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(text);
  }
  // For longer keywords, simple includes is fine
  return text.includes(keyword);
}

// ============================================================================
// MAIN CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Classify an expense account based on its name
 */
export function classifyByName(
  accountName: string,
  industry?: string
): ClassificationResult {
  const normalized = normalizeAccountName(accountName);

  // First check if it's a team cost
  if (isTeamCost(accountName)) {
    return {
      behavior: 'fixed',
      confidence: 'high',
      reason: 'Team cost - should be in Team Planning tab',
      isTeamCost: true,
    };
  }

  // Check industry-specific overrides first (they take priority)
  if (industry) {
    const industryKey = industry.toLowerCase().replace(/[_\s-]+/g, '');
    const overrides = INDUSTRY_OVERRIDES[industryKey];
    if (overrides) {
      for (const [keyword, behavior] of Object.entries(overrides)) {
        if (matchKeyword(normalized, keyword)) {
          return {
            behavior,
            confidence: 'high',
            reason: `Industry-specific (${industry})`,
            isTeamCost: false,
          };
        }
      }
    }
  }

  // Check classification patterns in priority order:
  // 1. Seasonal (most specific - utilities, climate)
  // 2. Variable (marketing, payment processing, freight)
  // 3. Adhoc (travel, repairs, training, one-offs)
  // 4. Fixed (rent, insurance, subscriptions - broadest category)
  const checkOrder: CostBehavior[] = ['seasonal', 'variable', 'adhoc', 'fixed'];

  for (const behavior of checkOrder) {
    const keywords = CLASSIFICATION_PATTERNS[behavior];
    for (const keyword of keywords) {
      if (matchKeyword(normalized, keyword)) {
        return {
          behavior,
          confidence: 'high',
          reason: `Matched: "${keyword}"`,
          isTeamCost: false,
        };
      }
    }
  }

  // No match found - return adhoc with low confidence
  return {
    behavior: 'adhoc',
    confidence: 'low',
    reason: 'Could not auto-classify - please review',
    isTeamCost: false,
  };
}

/**
 * Analyze monthly pattern from prior year data
 * Uses Coefficient of Variation (CV) to determine consistency:
 * - CV < 0.15: Very consistent → Fixed
 * - CV > 0.50 with seasonal pattern → Seasonal
 * - CV > 0.50 sporadic → Ad-hoc
 */
export function analyzePattern(monthlyData: Record<string, number>): {
  suggestedBehavior: CostBehavior | null;
  coefficient: number;
  isSpiky: boolean;
  hasSeasonal: boolean;
} {
  const values = Object.values(monthlyData).filter(v => v !== undefined && v !== null);

  if (values.length < 3) {
    return { suggestedBehavior: null, coefficient: 0, isSpiky: false, hasSeasonal: false };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) {
    return { suggestedBehavior: 'adhoc', coefficient: 0, isSpiky: true, hasSeasonal: false };
  }

  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  // Check for spiky pattern (some months are 0 or very low)
  const zeroMonths = values.filter(v => v === 0 || v < mean * 0.1).length;
  const isSpiky = zeroMonths >= 3;

  // Check for seasonal pattern
  const hasSeasonal = detectSeasonality(monthlyData);

  // Determine suggested behavior based on pattern
  let suggestedBehavior: CostBehavior | null = null;

  if (cv < 0.15) {
    suggestedBehavior = 'fixed';
  } else if (cv > 0.50) {
    if (hasSeasonal) {
      suggestedBehavior = 'seasonal';
    } else if (isSpiky) {
      suggestedBehavior = 'adhoc';
    }
  }

  return { suggestedBehavior, coefficient: cv, isSpiky, hasSeasonal };
}

/**
 * Detect if there's a seasonal pattern in the data
 */
function detectSeasonality(monthlyData: Record<string, number>): boolean {
  const quarters: number[][] = [[], [], [], []];

  for (const [monthKey, value] of Object.entries(monthlyData)) {
    const month = parseInt(monthKey.split('-')[1]);
    // Australian financial year quarters
    let quarterIndex: number;
    if (month >= 7 && month <= 9) quarterIndex = 0;
    else if (month >= 10 && month <= 12) quarterIndex = 1;
    else if (month >= 1 && month <= 3) quarterIndex = 2;
    else quarterIndex = 3;

    quarters[quarterIndex].push(value);
  }

  const quarterAvgs = quarters.map(q =>
    q.length > 0 ? q.reduce((a, b) => a + b, 0) / q.length : 0
  );

  const qMean = quarterAvgs.reduce((a, b) => a + b, 0) / 4;
  if (qMean === 0) return false;

  const qVariance = quarterAvgs.reduce((sum, val) => sum + Math.pow(val - qMean, 2), 0) / 4;
  const qCv = Math.sqrt(qVariance) / qMean;

  return qCv > 0.25;
}

/**
 * Main classification function - combines name matching and pattern analysis
 */
export function classifyExpense(
  accountName: string,
  priorYearMonthly?: Record<string, number>,
  industry?: string
): ClassificationResult {
  const nameResult = classifyByName(accountName, industry);

  if (nameResult.isTeamCost) {
    return nameResult;
  }

  // If we have prior year data and name matching failed or has low confidence,
  // use pattern analysis to improve classification
  if (priorYearMonthly && Object.keys(priorYearMonthly).length >= 3) {
    const patternResult = analyzePattern(priorYearMonthly);

    if (patternResult.suggestedBehavior) {
      // If name matching failed (low confidence), use pattern analysis
      if (nameResult.confidence === 'low') {
        return {
          behavior: patternResult.suggestedBehavior,
          confidence: 'medium',
          reason: `Pattern analysis (CV=${patternResult.coefficient.toFixed(2)})`,
          isTeamCost: false,
        };
      }

      // If name and pattern disagree, flag for review but trust the name
      if (patternResult.suggestedBehavior !== nameResult.behavior) {
        return {
          ...nameResult,
          confidence: 'medium',
          reason: `${nameResult.reason} (pattern suggests ${patternResult.suggestedBehavior})`,
        };
      }
    }
  }

  return nameResult;
}

/**
 * Batch classify all OpEx lines
 */
export function classifyOpExLines(
  lines: Array<{
    id: string;
    name: string;
    priorYearMonthly?: Record<string, number>;
  }>,
  industry?: string
): Map<string, ClassificationResult> {
  const results = new Map<string, ClassificationResult>();

  for (const line of lines) {
    results.set(line.id, classifyExpense(line.name, line.priorYearMonthly, industry));
  }

  return results;
}

/**
 * Get suggested default value based on behavior and prior year
 */
export function getSuggestedValue(
  behavior: CostBehavior,
  priorYearAnnual: number,
  priorYearMonthly?: Record<string, number>,
  yearlyRevenueTarget?: number
): { value: number; unit: string } {
  switch (behavior) {
    case 'fixed':
      return {
        value: Math.round(priorYearAnnual / 12),
        unit: '/mo'
      };

    case 'variable':
      if (yearlyRevenueTarget && yearlyRevenueTarget > 0) {
        const pct = (priorYearAnnual / yearlyRevenueTarget) * 100;
        return { value: Math.round(pct * 10) / 10, unit: '% rev' };
      }
      return { value: 0, unit: '% rev' };

    case 'seasonal':
      return { value: 3, unit: '% growth' };

    case 'adhoc':
      return { value: priorYearAnnual, unit: '/yr' };

    default:
      return { value: priorYearAnnual, unit: '/yr' };
  }
}
