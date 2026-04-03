/**
 * AI Design Standards for the Business Coaching Platform
 * ============================================================================
 *
 * IMPORTANT: All AI-powered features in this platform MUST use these consistent
 * design tokens to create a unified visual language where users instantly
 * recognize "purple = AI is helping me".
 *
 * This follows industry standards (GitHub Copilot, Notion AI, Jasper, etc.)
 * where PURPLE is the de facto color for AI features.
 *
 * ============================================================================
 * USAGE GUIDELINES
 * ============================================================================
 *
 * 1. ALWAYS use purple for AI features - never vary by context
 *    - DON'T: Use orange for contractor AI, green for new hire AI
 *    - DO: Use purple consistently, let the UI section provide context
 *
 * 2. ALWAYS include the Sparkles icon from lucide-react for AI features
 *    - The purple gradient badge + Sparkles = instant AI recognition
 *
 * 3. Use these exact Tailwind classes for consistency across the platform
 *
 * 4. When building new AI features, import and use these constants:
 *    import { AI_COLORS, AI_STYLES } from '@/lib/constants/ai-design';
 *
 * ============================================================================
 */

/**
 * Core AI color palette - Tailwind classes
 */
export const AI_COLORS = {
  // Backgrounds
  bgGradient: 'bg-gradient-to-r from-purple-50 to-indigo-50',
  bgSolid: 'bg-purple-50',

  // Borders
  border: 'border-purple-200',
  borderFocus: 'focus:border-purple-400 focus:ring-purple-400',

  // Text
  textPrimary: 'text-purple-900',
  textSecondary: 'text-purple-700',
  textMuted: 'text-purple-600',

  // Icon badge gradient (for the circular Sparkles badge)
  iconBadgeGradient: 'from-purple-500 to-indigo-500',
  iconBadgeBg: 'bg-gradient-to-br from-purple-500 to-indigo-500',

  // Buttons
  buttonPrimary: 'bg-purple-600 hover:bg-purple-700 text-white',
  buttonSecondary: 'bg-purple-100 hover:bg-purple-200 text-purple-700',

  // Links
  link: 'text-purple-700 hover:text-purple-900',
} as const;

/**
 * Pre-composed AI component styles
 */
export const AI_STYLES = {
  // Container for AI suggestion panels
  panel: `p-4 ${AI_COLORS.bgGradient} border ${AI_COLORS.border} rounded-xl`,

  // The circular icon badge with Sparkles
  iconBadge: `w-6 h-6 rounded-full ${AI_COLORS.iconBadgeBg} flex items-center justify-center`,

  // Header text style
  headerText: `text-sm font-semibold ${AI_COLORS.textPrimary}`,

  // Primary action button
  primaryButton: `text-xs py-2 px-4 rounded-lg font-medium ${AI_COLORS.buttonPrimary} transition-colors`,

  // Secondary action button
  secondaryButton: 'text-xs py-2 px-3 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors',

  // Link style for "Get suggestion" etc.
  actionLink: `text-xs font-medium px-2 py-1 rounded-lg ${AI_COLORS.link} hover:bg-white/50 transition-colors`,

  // Confidence badges
  confidenceHigh: 'bg-green-100 text-green-700',
  confidenceMedium: 'bg-blue-100 text-blue-700',
  confidenceLow: 'bg-amber-100 text-amber-700',
} as const;

/**
 * AI Assistant / Floating button styles (for AI CFO, chatbots, etc.)
 */
export const AI_ASSISTANT_STYLES = {
  // Floating button gradient
  floatingButtonGradient: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 50%, #0ea5e9 100%)',

  // Z-index for AI floating elements (above most UI, below modals)
  zIndex: 'z-[100]',

  // Pulse animation classes for attention
  pulseRing: 'animate-ping opacity-30',
  pulseGlow: 'animate-pulse opacity-20',
} as const;

/**
 * Example usage in a component:
 *
 * ```tsx
 * import { AI_COLORS, AI_STYLES } from '@/lib/constants/ai-design';
 * import { Sparkles } from 'lucide-react';
 *
 * function AIFeaturePanel() {
 *   return (
 *     <div className={AI_STYLES.panel}>
 *       <div className="flex items-center gap-2">
 *         <div className={AI_STYLES.iconBadge}>
 *           <Sparkles className="w-3.5 h-3.5 text-white" />
 *         </div>
 *         <span className={AI_STYLES.headerText}>AI Suggestion</span>
 *       </div>
 *       <button className={AI_STYLES.primaryButton}>
 *         Use Suggestion
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
