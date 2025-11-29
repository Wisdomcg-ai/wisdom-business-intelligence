/**
 * Design Tokens for Strategic Planning Wizard
 * ============================================
 *
 * Centralized design constants to ensure consistency across all step components.
 * All components should import from here instead of defining their own colors.
 */

import { InitiativeCategory } from '../types'

// Brand Colors (from company palette)
export const BRAND_COLORS = {
  coolNavy: '#3E3F57',      // Primary dark - badges, headers
  slateBlue: '#4C5D75',     // Secondary - borders, accents
  silverBlue: '#8E9AAF',    // Tertiary - subtle backgrounds
  warmDusk: '#948687',      // Warm accent - user ideas
  white: '#FFFFFF',
  black: '#000000'
}

// Semantic Colors (using Tailwind classes for consistency)
export const SEMANTIC_COLORS = {
  primary: 'teal',
  success: 'green',
  warning: 'amber',
  danger: 'red',
  info: 'blue'
}

// Avatar Colors for Team Members - Professional teal/slate tones
export const AVATAR_COLORS = [
  'bg-teal-600',
  'bg-teal-500',
  'bg-slate-600',
  'bg-slate-500',
  'bg-teal-700',
  'bg-slate-700',
  'bg-teal-800',
  'bg-slate-800',
  'bg-teal-400',
  'bg-slate-400'
] as const

// Category Colors - Professional slate/teal palette (emoji provides visual distinction)
export const CATEGORY_STYLES: Record<InitiativeCategory, {
  label: string
  shortLabel: string
  emoji: string
  bgColor: string
  borderColor: string
  textColor: string
  badgeBg: string
  badgeText: string
}> = {
  marketing: {
    label: 'Attract - Marketing & Lead Generation',
    shortLabel: 'Attract',
    emoji: '📢',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  operations: {
    label: 'Convert - Sales & Closing',
    shortLabel: 'Convert',
    emoji: '🛒',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  customer_experience: {
    label: 'Deliver - Client Experience & Results',
    shortLabel: 'Deliver',
    emoji: '❤️',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  people: {
    label: 'People - Team, Culture, Hiring',
    shortLabel: 'People',
    emoji: '👥',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  systems: {
    label: 'Systems - Operations, Process, Tech',
    shortLabel: 'Systems',
    emoji: '💻',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  finance: {
    label: 'Finance - Money, Metrics, Wealth',
    shortLabel: 'Finance',
    emoji: '💰',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  product: {
    label: 'Leadership - Vision, Strategy, You',
    shortLabel: 'Leadership',
    emoji: '👑',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  other: {
    label: 'Time - Freedom, Productivity, Leverage',
    shortLabel: 'Time',
    emoji: '⏱️',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  },
  misc: {
    label: 'Other - Miscellaneous & Uncategorized',
    shortLabel: 'Other',
    emoji: '📋',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800'
  }
}

// Source Badge Styles
export const SOURCE_STYLES = {
  user: {
    bg: 'bg-slate-800',
    text: 'text-white',
    label: 'YOUR IDEA'
  },
  roadmap: {
    bg: 'bg-teal-600',
    text: 'text-white',
    label: 'ROADMAP'
  },
  ai: {
    bg: 'bg-purple-600',
    text: 'text-white',
    label: 'AI SUGGESTED'
  }
}

// Initiative Card Styles - Using teal-based design system
export const CARD_STYLES = {
  userIdea: {
    // Light card with subtle border - for user's own ideas
    base: 'bg-white border-2 border-slate-200 hover:border-teal-300 hover:shadow-md',
    text: 'text-slate-900',
    subtext: 'text-slate-600'
  },
  roadmapSuggestion: {
    // Teal-tinted card - for roadmap suggestions
    base: 'bg-teal-600 border-2 border-teal-600 shadow-md hover:bg-teal-700 hover:shadow-lg',
    text: 'text-white',
    subtext: 'text-teal-100'
  },
  selected: {
    // Highlighted when selected/in priority list
    base: 'bg-teal-50 border-2 border-teal-400 shadow-md',
    text: 'text-slate-900',
    subtext: 'text-slate-600'
  },
  dragging: {
    modifier: 'opacity-50 scale-105 shadow-xl'
  }
}

// Combined card class helper
export function getCardClasses(source: 'strategic_ideas' | 'roadmap' | 'user' | string | undefined, isDragging?: boolean) {
  const isUserIdea = source === 'strategic_ideas' || source === 'user'
  const style = isUserIdea ? CARD_STYLES.userIdea : CARD_STYLES.roadmapSuggestion
  return {
    container: `${style.base} ${isDragging ? CARD_STYLES.dragging.modifier : ''} rounded-lg transition-all cursor-move`,
    text: style.text,
    subtext: style.subtext
  }
}

// Helper function to get category style with fallback
export function getCategoryStyle(category: InitiativeCategory | string | undefined) {
  return CATEGORY_STYLES[category as InitiativeCategory] || CATEGORY_STYLES.misc
}

// All categories in display order
export const CATEGORY_ORDER: InitiativeCategory[] = [
  'marketing',
  'operations',
  'customer_experience',
  'people',
  'systems',
  'finance',
  'product',
  'other',
  'misc'
]
