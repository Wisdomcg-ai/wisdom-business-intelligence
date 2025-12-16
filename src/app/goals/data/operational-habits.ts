// /app/goals/data/operational-habits.ts
// Core 5 Operational Habits per Business Engine
// Designed for SMB businesses ($500k - $10M revenue)

export type FrequencyOption =
  | 'daily'
  | '3x_week'
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'

export interface SuggestedHabit {
  id: string
  name: string
  description: string
  engine: string
  recommendedFrequency: FrequencyOption
}

export interface BusinessEngine {
  id: string
  name: string
  emoji: string
  color: string
  bgColor: string
  borderColor: string
}

// Business Engines aligned with the Business Roadmap
// Using consistent slate/neutral colors for a clean, professional look
export const BUSINESS_ENGINES: BusinessEngine[] = [
  { id: 'attract', name: 'Attract', emoji: '📢', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  { id: 'convert', name: 'Convert', emoji: '🛒', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  { id: 'deliver', name: 'Deliver', emoji: '❤️', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  { id: 'people', name: 'People', emoji: '👥', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  { id: 'systems', name: 'Systems', emoji: '💻', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  { id: 'finance', name: 'Finance', emoji: '💰', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  { id: 'leadership', name: 'Leadership', emoji: '👑', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  { id: 'time', name: 'Time', emoji: '⏱️', color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
]

// Frequency display labels
export const FREQUENCY_LABELS: Record<FrequencyOption, string> = {
  'daily': 'Daily',
  '3x_week': '3x/week',
  'weekly': 'Weekly',
  'fortnightly': 'Fortnightly',
  'monthly': 'Monthly',
  'quarterly': 'Quarterly'
}

// Core 5 Suggested Habits per Engine
export const SUGGESTED_OPERATIONAL_HABITS: SuggestedHabit[] = [
  // ===================
  // ATTRACT (Marketing)
  // ===================
  {
    id: 'attract-1',
    name: 'Create content',
    description: 'Block 90 mins to write, record, or design marketing content',
    engine: 'attract',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'attract-2',
    name: 'Ask for referrals',
    description: 'Ask 2-3 happy clients for an introduction to someone they know',
    engine: 'attract',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'attract-3',
    name: 'Reach out to past contacts',
    description: 'Message 5 past clients or old leads with something useful',
    engine: 'attract',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'attract-4',
    name: 'Track where leads come from',
    description: 'Record the source of every new enquiry',
    engine: 'attract',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'attract-5',
    name: 'Review marketing results',
    description: 'Check leads generated, cost per lead, what\'s working',
    engine: 'attract',
    recommendedFrequency: 'monthly'
  },

  // ===============
  // CONVERT (Sales)
  // ===============
  {
    id: 'convert-1',
    name: 'Review the pipeline',
    description: 'Look at every open opportunity and set the next action',
    engine: 'convert',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'convert-2',
    name: 'Check response times',
    description: 'How fast are we responding to new enquiries? Aim for same day',
    engine: 'convert',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'convert-3',
    name: 'Follow up outstanding quotes',
    description: 'Chase proposals and quotes that haven\'t closed',
    engine: 'convert',
    recommendedFrequency: 'daily'
  },
  {
    id: 'convert-4',
    name: 'Review sales numbers',
    description: 'Check proposals sent, win rate, average deal size',
    engine: 'convert',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'convert-5',
    name: 'Note why you won or lost',
    description: 'For every deal that closes, write down the reason',
    engine: 'convert',
    recommendedFrequency: 'weekly'
  },

  // ======================
  // DELIVER (Client Experience)
  // ======================
  {
    id: 'deliver-1',
    name: 'Check in with clients',
    description: 'Call or message 3-5 clients before they have a problem',
    engine: 'deliver',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'deliver-2',
    name: 'Review new client experience',
    description: 'Is every new client having a great first week?',
    engine: 'deliver',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'deliver-3',
    name: 'Ask for a testimonial',
    description: 'Request a review or quote from one happy client',
    engine: 'deliver',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'deliver-4',
    name: 'Check delivery quality',
    description: 'Are we delivering on time, on budget, as promised?',
    engine: 'deliver',
    recommendedFrequency: 'fortnightly'
  },
  {
    id: 'deliver-5',
    name: 'Review client feedback',
    description: 'Look at any feedback received and find one thing to improve',
    engine: 'deliver',
    recommendedFrequency: 'monthly'
  },

  // ==============
  // PEOPLE (Team)
  // ==============
  {
    id: 'people-1',
    name: 'Team meeting',
    description: '45-60 min meeting: wins, priorities, issues, alignment',
    engine: 'people',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'people-2',
    name: 'One-on-one meetings',
    description: '30 min with each direct report to coach and unblock',
    engine: 'people',
    recommendedFrequency: 'fortnightly'
  },
  {
    id: 'people-3',
    name: 'Review team numbers',
    description: 'Check KPIs and discuss performance with the team',
    engine: 'people',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'people-4',
    name: 'Recognise someone',
    description: 'Publicly thank or acknowledge one person or achievement',
    engine: 'people',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'people-5',
    name: 'Review the org chart',
    description: 'Right people in right roles? Any gaps to address?',
    engine: 'people',
    recommendedFrequency: 'monthly'
  },

  // ===================
  // SYSTEMS (Operations)
  // ===================
  {
    id: 'systems-1',
    name: 'Document a process',
    description: 'Write or update one checklist or procedure',
    engine: 'systems',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'systems-2',
    name: 'Find the bottleneck',
    description: 'What\'s the #1 thing slowing us down right now?',
    engine: 'systems',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'systems-3',
    name: 'Fix one annoyance',
    description: 'Pick one clunky manual task and make it easier',
    engine: 'systems',
    recommendedFrequency: 'fortnightly'
  },
  {
    id: 'systems-4',
    name: 'Review active projects',
    description: 'Check all jobs: on track, behind, or stuck?',
    engine: 'systems',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'systems-5',
    name: 'Review tools and software',
    description: 'Are we using what we\'re paying for? Any gaps?',
    engine: 'systems',
    recommendedFrequency: 'quarterly'
  },

  // =================
  // FINANCE (Money)
  // =================
  {
    id: 'finance-1',
    name: 'Check cash position',
    description: 'Look at bank balance and forecast next 4-8 weeks',
    engine: 'finance',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'finance-2',
    name: 'Send invoices',
    description: 'Invoice all completed work within 48 hours',
    engine: 'finance',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'finance-3',
    name: 'Chase late payments',
    description: 'Call or email every invoice that\'s overdue',
    engine: 'finance',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'finance-4',
    name: 'Review the numbers',
    description: 'Check revenue, gross profit %, net profit % vs targets',
    engine: 'finance',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'finance-5',
    name: 'Review profitability',
    description: 'Which clients, services, or jobs made money? Which didn\'t?',
    engine: 'finance',
    recommendedFrequency: 'monthly'
  },

  // ====================
  // LEADERSHIP (Owner)
  // ====================
  {
    id: 'leadership-1',
    name: 'Daily ritual',
    description: 'Morning routine: mindset, gratitude, intention setting',
    engine: 'leadership',
    recommendedFrequency: 'daily'
  },
  {
    id: 'leadership-2',
    name: 'Wins & learnings',
    description: 'Write down daily wins and lessons learned',
    engine: 'leadership',
    recommendedFrequency: 'daily'
  },
  {
    id: 'leadership-3',
    name: 'Journalling',
    description: 'Reflect on decisions, challenges, and growth',
    engine: 'leadership',
    recommendedFrequency: 'daily'
  },
  {
    id: 'leadership-4',
    name: 'Strategic thinking time',
    description: 'Work ON the business, not just IN it',
    engine: 'leadership',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'leadership-5',
    name: 'Learning time',
    description: 'Read, listen, or learn something new (30 mins)',
    engine: 'leadership',
    recommendedFrequency: 'daily'
  },

  // ===================
  // TIME (Productivity)
  // ===================
  {
    id: 'time-1',
    name: 'Weekly planning',
    description: 'Plan the week: priorities, calendar, focus areas',
    engine: 'time',
    recommendedFrequency: 'weekly'
  },
  {
    id: 'time-2',
    name: 'Daily planning',
    description: 'Plan tomorrow today: top 3 priorities',
    engine: 'time',
    recommendedFrequency: 'daily'
  },
  {
    id: 'time-3',
    name: 'Brain dump',
    description: 'Get everything out of your head onto a list',
    engine: 'time',
    recommendedFrequency: 'daily'
  },
  {
    id: 'time-4',
    name: 'Focus time',
    description: 'One distraction-free block of deep work (min 50 mins)',
    engine: 'time',
    recommendedFrequency: 'daily'
  },
  {
    id: 'time-5',
    name: 'Delegation review',
    description: 'What can be handed off or outsourced?',
    engine: 'time',
    recommendedFrequency: 'weekly'
  },
]

// Helper to get habits for a specific engine
export function getHabitsByEngine(engineId: string): SuggestedHabit[] {
  return SUGGESTED_OPERATIONAL_HABITS.filter(habit => habit.engine === engineId)
}

// Helper to get an engine by ID
export function getEngineById(engineId: string): BusinessEngine | undefined {
  return BUSINESS_ENGINES.find(engine => engine.id === engineId)
}
