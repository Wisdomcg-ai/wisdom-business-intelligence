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
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.ENCRYPTION_KEY

  if (!keyString) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
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
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    return ''
  }

  // Check if data appears to be encrypted (has our format)
  if (!encryptedData.includes(':')) {
    // Data is not encrypted, return as-is (for migration purposes)
    return encryptedData
  }

  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    // Invalid format, return as-is
    return encryptedData
  }

  try {
    const key = getEncryptionKey()
    const iv = Buffer.from(parts[0], 'base64')
    const authTag = Buffer.from(parts[1], 'base64')
    const ciphertext = parts[2]

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    // If decryption fails, assume data is not encrypted
    // This allows graceful migration from unencrypted to encrypted data
    console.error('Decryption failed, returning original data:', error)
    return encryptedData
  }
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
 */
export function createHmacSignature(data: string, secret?: string): string {
  const key = secret || process.env.OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY
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
  const encoded = Buffer.from(payloadString).toString('base64')
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
    const payloadString = Buffer.from(encoded, 'base64').toString('utf8')
    return JSON.parse(payloadString) as T
  } catch {
    return null
  }
}
