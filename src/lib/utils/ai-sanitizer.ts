/**
 * AI Input Sanitization Utilities
 * Helps prevent prompt injection attacks by sanitizing user inputs
 * before they are included in AI prompts.
 */

/**
 * Maximum allowed length for user inputs to AI
 * Prevents excessively long inputs that could be used for attacks
 */
export const AI_INPUT_LIMITS = {
  userMessage: 5000,      // Chat messages
  transcript: 50000,      // Session transcripts
  fieldValue: 1000,       // Individual field values
  conversationHistory: 10 // Max messages in history
} as const

/**
 * Patterns that might indicate prompt injection attempts
 * These are common patterns used to try to manipulate AI behavior
 */
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /forget\s+(everything|all|what)\s+(you|i)\s+(said|told|wrote)/i,
  /new\s+instructions?:/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /```system/i,
  /act\s+as\s+(if\s+)?you\s+(are|were)\s+a/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /you\s+are\s+now\s+a/i,
  /roleplay\s+as/i,
]

/**
 * Sanitize user input for AI prompts
 * @param input - The raw user input
 * @param maxLength - Maximum allowed length
 * @returns Sanitized input safe for AI prompts
 */
export function sanitizeAIInput(input: string, maxLength: number = AI_INPUT_LIMITS.userMessage): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength)

  // Remove null bytes and other control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return sanitized
}

/**
 * Check if input contains suspicious prompt injection patterns
 * @param input - The user input to check
 * @returns Object with isSuspicious flag and matched pattern if found
 */
export function detectPromptInjection(input: string): { isSuspicious: boolean; pattern?: string } {
  if (!input || typeof input !== 'string') {
    return { isSuspicious: false }
  }

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(input)) {
      return {
        isSuspicious: true,
        pattern: pattern.source
      }
    }
  }

  return { isSuspicious: false }
}

/**
 * Sanitize conversation history for AI context
 * Limits the number of messages and sanitizes each one
 */
export function sanitizeConversationHistory(
  history: Array<{ role: string; content: string }>,
  maxMessages: number = AI_INPUT_LIMITS.conversationHistory
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(history)) {
    return []
  }

  // Take only the most recent messages
  const recentHistory = history.slice(-maxMessages)

  return recentHistory
    .filter(msg => msg && typeof msg.content === 'string')
    .map(msg => ({
      role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: sanitizeAIInput(msg.content, AI_INPUT_LIMITS.userMessage)
    }))
}

/**
 * Sanitize an object's string values for AI context
 * Useful for sanitizing business context or field values
 */
export function sanitizeObjectForAI<T extends Record<string, unknown>>(
  obj: T,
  maxValueLength: number = AI_INPUT_LIMITS.fieldValue
): T {
  if (!obj || typeof obj !== 'object') {
    return {} as T
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeAIInput(value, maxValueLength)
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObjectForAI(value as Record<string, unknown>, maxValueLength)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized as T
}

/**
 * Log suspicious AI input for security monitoring
 * In production, this could send to a security monitoring service
 */
export function logSuspiciousInput(
  endpoint: string,
  userId: string,
  input: string,
  pattern: string
): void {
  // Truncate the input for logging to avoid log bloat
  const truncatedInput = input.slice(0, 200)

  console.warn('[AI Security] Suspicious input detected', {
    endpoint,
    userId,
    pattern,
    inputPreview: truncatedInput,
    timestamp: new Date().toISOString()
  })
}
