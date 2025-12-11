/**
 * Vision & Mission Constants
 * Centralized configuration for vision, mission, and core values
 */

export interface CoreValue {
  name: string;
  category: string;
  weStatement: string;
}

// Validation limits
export const VALIDATION = {
  VISION_MAX_CHARS: 500,
  MISSION_MAX_CHARS: 500,
  VALUE_MAX_CHARS: 200, // Increased to allow "Value - We statement" format
  MIN_VALUES: 3,
  MAX_VALUES: 20, // Increased from 8 to allow more values
  DEFAULT_VALUES: 8, // Default number of value slots to show
  VISION_MIN_WORDS: 20,
  VISION_TARGET_WORDS: { min: 30, max: 50 },
  MISSION_MIN_WORDS: 15,
  MISSION_TARGET_WORDS: { min: 20, max: 40 }
} as const;

// Core Values Library - 35 curated values organized by category
export const CORE_VALUES_LIBRARY: CoreValue[] = [
  // Customer-Focused
  { name: 'Customer Obsession', category: 'Customer-Focused', weStatement: 'We put customers at the center of every decision we make' },
  { name: 'Exceptional Service', category: 'Customer-Focused', weStatement: 'We go above and beyond to exceed customer expectations every time' },
  { name: 'Customer Success', category: 'Customer-Focused', weStatement: 'We measure our success by our customers\' success' },
  { name: 'Listen First', category: 'Customer-Focused', weStatement: 'We listen to understand, not just to respond' },

  // Quality & Excellence
  { name: 'Excellence', category: 'Quality & Excellence', weStatement: 'We deliver exceptional quality in everything we do' },
  { name: 'Continuous Improvement', category: 'Quality & Excellence', weStatement: 'We get better every day and never settle for good enough' },
  { name: 'Attention to Detail', category: 'Quality & Excellence', weStatement: 'We sweat the small stuff because details matter' },
  { name: 'Craftsmanship', category: 'Quality & Excellence', weStatement: 'We take pride in our work and do it right the first time' },

  // Innovation & Growth
  { name: 'Innovation', category: 'Innovation & Growth', weStatement: 'We embrace change and constantly seek better ways of doing things' },
  { name: 'Think Big', category: 'Innovation & Growth', weStatement: 'We set ambitious goals and pursue bold visions' },
  { name: 'Learn Fast', category: 'Innovation & Growth', weStatement: 'We experiment, learn from failures, and adapt quickly' },
  { name: 'Creative Problem-Solving', category: 'Innovation & Growth', weStatement: 'We find innovative solutions to complex challenges' },

  // Integrity & Trust
  { name: 'Integrity', category: 'Integrity & Trust', weStatement: 'We do the right thing when no one\'s watching' },
  { name: 'Honesty', category: 'Integrity & Trust', weStatement: 'We tell the truth, even when it\'s difficult' },
  { name: 'Transparency', category: 'Integrity & Trust', weStatement: 'We communicate openly and share information freely' },
  { name: 'Respect', category: 'Integrity & Trust', weStatement: 'We communicate openly and honestly, we listen and value different points of view' },
  { name: 'Trust', category: 'Integrity & Trust', weStatement: 'We earn trust through our actions and keep our promises' },

  // Team & Culture
  { name: 'Teamwork', category: 'Team & Culture', weStatement: 'We\'ve got each other\'s back every job, every day' },
  { name: 'Collaboration', category: 'Team & Culture', weStatement: 'We win as a team and celebrate success together' },
  { name: 'Support Each Other', category: 'Team & Culture', weStatement: 'We help our teammates succeed and never leave anyone behind' },
  { name: 'Diversity & Inclusion', category: 'Team & Culture', weStatement: 'We value different perspectives and create a place where everyone belongs' },
  { name: 'Fun', category: 'Team & Culture', weStatement: 'We work hard and enjoy the journey together' },

  // Performance & Results
  { name: 'Accountability', category: 'Performance & Results', weStatement: 'We take responsibility for getting the job done right' },
  { name: 'Results-Driven', category: 'Performance & Results', weStatement: 'We focus on outcomes and deliver on our commitments' },
  { name: 'Ownership', category: 'Performance & Results', weStatement: 'We act like owners and take full responsibility for our work' },
  { name: 'Bias for Action', category: 'Performance & Results', weStatement: 'We make decisions quickly and move forward with urgency' },
  { name: 'High Standards', category: 'Performance & Results', weStatement: 'We hold ourselves and each other to the highest standards' },

  // Leadership & Growth
  { name: 'Lead by Example', category: 'Leadership & Growth', weStatement: 'We model the behavior we want to see in others' },
  { name: 'Empower Others', category: 'Leadership & Growth', weStatement: 'We give people the tools, trust, and autonomy to succeed' },
  { name: 'Develop People', category: 'Leadership & Growth', weStatement: 'We invest in growing our people and their capabilities' },
  { name: 'Growth Mindset', category: 'Leadership & Growth', weStatement: 'We believe we can always learn, improve, and grow' },

  // Community & Impact
  { name: 'Give Back', category: 'Community & Impact', weStatement: 'We contribute to our communities and make a positive difference' },
  { name: 'Sustainability', category: 'Community & Impact', weStatement: 'We build for the long term and care about our impact on the world' },
  { name: 'Make a Difference', category: 'Community & Impact', weStatement: 'We do work that matters and leaves things better than we found them' }
];

// Get all unique categories
export const CATEGORIES = ['all', ...Array.from(new Set(CORE_VALUES_LIBRARY.map(v => v.category)))];

// Helper functions
export function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function getCompletionPercentage(data: {
  mission_statement: string;
  vision_statement: string;
  core_values: string[];
}): number {
  let completed = 0;
  const total = 3;

  if (data.mission_statement && data.mission_statement.trim().length >= VALIDATION.MISSION_MIN_WORDS) completed++;
  if (data.vision_statement && data.vision_statement.trim().length >= VALIDATION.VISION_MIN_WORDS) completed++;

  const filledValues = data.core_values.filter(v => v.trim().length > 0).length;
  if (filledValues >= VALIDATION.MIN_VALUES) completed++;

  return Math.round((completed / total) * 100);
}
