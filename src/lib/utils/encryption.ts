/**
 * Encryption utilities for sensitive data at rest
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto'

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16  // 128 bits for GCM
const AUTH_TAG_LENGTH = 16  // 128 bits
const SALT_LENGTH = 32

/**
 * Get encryption key from environment variable
 * Key must be 32 bytes (256 bits) for AES-256
 * Checks multiple env var names for flexibility across deployments
 *
 * SEC-04 PART 2 (Phase 46 plan 46-04): APP_SECRET_KEY (or ENCRYPTION_KEY)
 * MUST be set explicitly. The previous SUPABASE_SERVICE_KEY PBKDF2-derivation
 * fallback is removed — see
 * .planning/phases/46-server-side-hardening/SEC-04-MIGRATION-NOTE.md for
 * the 2-PR migration path (PR 1 = plan 46-02, this is PR 2).
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.APP_SECRET_KEY || process.env.ENCRYPTION_KEY

  if (!keyString) {
    throw new Error(
      'APP_SECRET_KEY (or ENCRYPTION_KEY) must be set for encryption — see .planning/phases/46-server-side-hardening/SEC-04-MIGRATION-NOTE.md'
    )
  }

  // If key is hex-encoded (64 chars = 32 bytes)
  if (keyString.length === 64 && /^[0-9a-fA-F]+$/.test(keyString)) {
    return Buffer.from(keyString, 'hex')
  }

  // If key is base64-encoded
  if (keyString.length === 44 && keyString.endsWith('=')) {
    return Buffer.from(keyString, 'base64')
  }

  // Otherwise, derive a key from the string using PBKDF2
  // This is less secure but allows using simpler secrets
  const salt = Buffer.from('xero-tokens-salt-v1', 'utf8')
  return crypto.pbkdf2Sync(keyString, salt, 100000, 32, 'sha256')
}

/**
 * Encrypt sensitive data
 * @param plaintext - The data to encrypt
 * @returns Base64-encoded encrypted data (iv:authTag:ciphertext)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return ''
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Combine IV + AuthTag + Ciphertext (all base64 encoded)
  // Format: base64(iv):base64(authTag):base64(ciphertext)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Decrypt encrypted data
 * @param encryptedData - Base64-encoded encrypted data (iv:authTag:ciphertext)
 * @returns Decrypted plaintext
 *
 * SEC-04 PART 2 (Phase 46 plan 46-04): all 3 silent fallbacks removed.
 *  - No more plaintext-tolerance for inputs without `:`
 *  - No more plaintext-tolerance for inputs with parts.length !== 3
 *  - No more catch-and-return-plaintext on cipher errors
 * Decryption failures now surface as thrown Errors. Callers
 * (src/lib/xero/token-manager.ts:194,195,241,258,295,310,464 and
 *  src/app/api/Xero/complete-connection/route.ts:126,127) must handle
 * those throws — the prod migration window in plan 46-02 verified that
 * every existing xero_connections row decrypts cleanly with the new key
 * chain (see SEC-04-MIGRATION-NOTE.md).
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    return ''
  }

  // SEC-04 PART 2: strict shape check; throw rather than return plaintext.
  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    throw new Error(
      'decrypt: invalid token format (expected iv:authTag:ciphertext)'
    )
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(parts[0], 'base64')
  const authTag = Buffer.from(parts[1], 'base64')
  const ciphertext = parts[2]

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Check if a string appears to be encrypted with our format
 */
export function isEncrypted(data: string): boolean {
  if (!data || !data.includes(':')) {
    return false
  }

  const parts = data.split(':')
  if (parts.length !== 3) {
    return false
  }

  // Check if all parts are valid base64
  try {
    Buffer.from(parts[0], 'base64')
    Buffer.from(parts[1], 'base64')
    Buffer.from(parts[2], 'base64')
    return true
  } catch {
    return false
  }
}

/**
 * Generate a new encryption key (for initial setup)
 * Run this once and save the result in your environment variables
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Create HMAC signature for OAuth state
 * Checks multiple env var names for flexibility across deployments
 *
 * SEC-04 PART 2 (Phase 46 plan 46-04): SUPABASE_SERVICE_KEY fallback
 * removed (consistent with getEncryptionKey hardening). OAUTH_STATE_SECRET
 * is preserved — it has its own rotation cadence. Operator must confirm
 * OAUTH_STATE_SECRET is set in Vercel Production before this lands;
 * otherwise OAuth state HMACs in flight at deploy time will fail to
 * verify (signup completion mid-flight).
 */
export function createHmacSignature(data: string, secret?: string): string {
  const key = secret
    || process.env.APP_SECRET_KEY
    || process.env.OAUTH_STATE_SECRET
    || process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('No secret available for HMAC signature')
  }

  return crypto
    .createHmac('sha256', key)
    .update(data)
    .digest('hex')
}

/**
 * Verify HMAC signature for OAuth state
 */
export function verifyHmacSignature(data: string, signature: string, secret?: string): boolean {
  const expectedSignature = createHmacSignature(data, secret)

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * Create a signed OAuth state parameter
 * Format: base64(payload):signature
 */
export function createSignedOAuthState(payload: object): string {
  const payloadString = JSON.stringify(payload)
  // Use base64url encoding to avoid URL-unsafe characters (+, /, =)
  // that can get corrupted through OAuth redirect chains
  const encoded = Buffer.from(payloadString).toString('base64url')
  const signature = createHmacSignature(encoded)

  return `${encoded}.${signature}`
}

/**
 * Verify and parse a signed OAuth state parameter
 * Returns null if invalid
 */
export function verifySignedOAuthState<T = object>(state: string): T | null {
  if (!state || !state.includes('.')) {
    return null
  }

  const [encoded, signature] = state.split('.')

  if (!encoded || !signature) {
    return null
  }

  if (!verifyHmacSignature(encoded, signature)) {
    return null
  }

  try {
    // Try base64url first (current format), then standard base64 (legacy)
    let payloadString: string
    try {
      payloadString = Buffer.from(encoded, 'base64url').toString('utf8')
      JSON.parse(payloadString) // validate it parses
    } catch {
      payloadString = Buffer.from(encoded, 'base64').toString('utf8')
    }
    return JSON.parse(payloadString) as T
  } catch {
    return null
  }
}
