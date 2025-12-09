/**
 * Environment variable validation
 * Validates required environment variables at startup
 * Call validateEnv() in your app initialization
 */

interface EnvValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

/**
 * Required environment variables for the application to function
 */
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

/**
 * Environment variables that should be set for full functionality
 * but won't prevent the app from starting
 */
const OPTIONAL_ENV_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
] as const

/**
 * Validate that all required environment variables are set
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  // Check required variables
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar)
    }
  }

  // Check optional variables (warn but don't fail)
  for (const envVar of OPTIONAL_ENV_VARS) {
    if (!process.env[envVar]) {
      warnings.push(`${envVar} is not set - some features may not work`)
    }
  }

  // Validate Supabase URL format if present
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl && !supabaseUrl.includes('.supabase.co')) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL may not be a valid Supabase URL')
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Validate environment and log results
 * Should be called at app startup
 */
export function checkEnvAndLog(): boolean {
  const result = validateEnv()

  if (!result.valid) {
    console.error('=== ENVIRONMENT VALIDATION FAILED ===')
    console.error('Missing required environment variables:')
    result.missing.forEach(v => console.error(`  - ${v}`))
    console.error('====================================')
  }

  if (result.warnings.length > 0) {
    console.warn('=== ENVIRONMENT WARNINGS ===')
    result.warnings.forEach(w => console.warn(`  - ${w}`))
    console.warn('============================')
  }

  return result.valid
}

/**
 * Get an environment variable with type safety and default value
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key]
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Environment variable ${key} is not set`)
  }
  return value
}

/**
 * Get an environment variable as a boolean
 */
export function getEnvBool(key: string, defaultValue = false): boolean {
  const value = process.env[key]
  if (value === undefined) {
    return defaultValue
  }
  return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Get an environment variable as a number
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key]
  if (value === undefined) {
    return defaultValue
  }
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}
