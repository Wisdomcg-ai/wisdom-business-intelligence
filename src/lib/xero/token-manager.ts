/**
 * Xero Token Manager
 *
 * Centralized token refresh logic with:
 * - Standardized 15-minute refresh threshold
 * - Retry logic with exponential backoff
 * - Race condition prevention via database locking
 * - Comprehensive error categorization
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/utils/encryption';

// Standardized refresh threshold - refresh if token expires within 15 minutes
const REFRESH_THRESHOLD_MINUTES = 15;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Error types for better handling
export type TokenRefreshError =
  | 'token_expired_permanently' // Refresh token expired (60 days), need to reconnect
  | 'token_revoked' // User revoked access in Xero
  | 'network_error' // Transient network issue
  | 'rate_limited' // Too many requests
  | 'server_error' // Xero API error
  | 'database_error' // Failed to save tokens
  | 'unknown';

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  error?: TokenRefreshError;
  message?: string;
  shouldDeactivate?: boolean; // True if connection should be marked inactive
}

export interface XeroConnection {
  id: string;
  business_id: string;
  tenant_id: string;
  tenant_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  is_active: boolean;
  token_refreshing_at?: string | null;
}

/**
 * Get a valid access token, refreshing if needed
 * This is the main entry point for all Xero API calls
 */
export async function getValidAccessToken(
  connectionOrId: XeroConnection | { id: string },
  supabase: SupabaseClient
): Promise<TokenRefreshResult> {
  // Always re-fetch connection from database to ensure we have latest tokens
  // This prevents stale token issues when another process has refreshed
  const connectionId = 'tenant_id' in connectionOrId ? connectionOrId.id : connectionOrId.id;

  const { data: connection, error: fetchError } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (fetchError || !connection) {
    console.error('[Token Manager] Failed to fetch connection:', fetchError);
    return {
      success: false,
      error: 'database_error',
      message: 'Failed to fetch connection from database',
      shouldDeactivate: false
    };
  }

  const now = new Date();
  const expiry = new Date(connection.expires_at);
  const thresholdTime = new Date(now.getTime() + REFRESH_THRESHOLD_MINUTES * 60 * 1000);

  // Decrypt tokens
  let decryptedAccessToken: string;
  let decryptedRefreshToken: string;

  try {
    decryptedAccessToken = decrypt(connection.access_token);
    decryptedRefreshToken = decrypt(connection.refresh_token);
  } catch (error) {
    console.error('[Token Manager] Failed to decrypt tokens:', error);
    return {
      success: false,
      error: 'database_error',
      message: 'Failed to decrypt tokens',
      shouldDeactivate: true
    };
  }

  // If token is still valid beyond threshold, return it
  if (expiry > thresholdTime) {
    console.log(`[Token Manager] Token still valid, expires at ${expiry.toISOString()}`);
    return {
      success: true,
      accessToken: decryptedAccessToken
    };
  }

  console.log(`[Token Manager] Token expires at ${expiry.toISOString()}, refreshing...`);

  // Check if another process is already refreshing (race condition prevention)
  const lockResult = await acquireRefreshLock(connection.id, supabase);
  if (!lockResult.acquired) {
    // Another process is refreshing, wait and re-fetch
    console.log('[Token Manager] Another process is refreshing, waiting...');
    await sleep(2000);

    // Re-fetch connection to get updated tokens
    const { data: updatedConnection } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('id', connection.id)
      .single();

    if (updatedConnection && new Date(updatedConnection.expires_at) > thresholdTime) {
      return {
        success: true,
        accessToken: decrypt(updatedConnection.access_token)
      };
    }

    // Still expired, try to refresh ourselves
  }

  try {
    // Attempt refresh with retry logic
    const result = await refreshTokenWithRetry(
      decryptedRefreshToken,
      connection.id,
      supabase
    );

    return result;
  } finally {
    // Always release the lock
    await releaseRefreshLock(connection.id, supabase);
  }
}

/**
 * Refresh token with exponential backoff retry
 */
async function refreshTokenWithRetry(
  refreshToken: string,
  connectionId: string,
  supabase: SupabaseClient,
  attempt: number = 1
): Promise<TokenRefreshResult> {
  try {
    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
        ).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (response.ok) {
      const tokens = await response.json();

      // Calculate new expiry
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

      // Save new tokens to database
      const { error: updateError } = await supabase
        .from('xero_connections')
        .update({
          access_token: encrypt(tokens.access_token),
          refresh_token: encrypt(tokens.refresh_token),
          expires_at: newExpiry.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId);

      if (updateError) {
        console.error('[Token Manager] Failed to save refreshed tokens:', updateError);
        // Return the new token anyway - it's valid even if we couldn't save it
        // Next request will refresh again
        return {
          success: true,
          accessToken: tokens.access_token,
          error: 'database_error',
          message: 'Token refreshed but failed to save to database'
        };
      }

      console.log('[Token Manager] Token refreshed successfully, expires:', newExpiry.toISOString());
      return {
        success: true,
        accessToken: tokens.access_token
      };
    }

    // Handle error responses
    const errorText = await response.text();
    const errorInfo = categorizeError(response.status, errorText);

    // If it's a permanent error, don't retry
    if (errorInfo.shouldDeactivate) {
      console.error(`[Token Manager] Permanent token error: ${errorInfo.error} - ${errorInfo.message}`);

      // Mark connection as inactive
      await supabase
        .from('xero_connections')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId);

      return errorInfo;
    }

    // For transient errors, retry with backoff
    if (attempt < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Token Manager] Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
      await sleep(delay);
      return refreshTokenWithRetry(refreshToken, connectionId, supabase, attempt + 1);
    }

    console.error(`[Token Manager] All ${MAX_RETRIES} retry attempts failed`);
    return errorInfo;

  } catch (error) {
    // Network error
    if (attempt < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Token Manager] Network error, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
      await sleep(delay);
      return refreshTokenWithRetry(refreshToken, connectionId, supabase, attempt + 1);
    }

    console.error('[Token Manager] Network error after all retries:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'Failed to reach Xero servers after multiple attempts'
    };
  }
}

/**
 * Categorize error response from Xero
 */
function categorizeError(status: number, errorText: string): TokenRefreshResult {
  // Parse error if JSON
  let errorData: any = {};
  try {
    errorData = JSON.parse(errorText);
  } catch {
    // Not JSON, use raw text
  }

  const errorCode = errorData.error || '';

  // Permanent failures - need to reconnect
  // Only deactivate on specific error codes, not generic 400s
  if (errorCode === 'invalid_grant') {
    return {
      success: false,
      error: 'token_expired_permanently',
      message: 'Refresh token has expired (60 days). Please reconnect Xero.',
      shouldDeactivate: true
    };
  }

  // Generic 400 error - could be temporary, don't deactivate
  if (status === 400 && !errorCode) {
    return {
      success: false,
      error: 'unknown',
      message: `Bad request to Xero: ${errorText}`,
      shouldDeactivate: false // Don't deactivate on generic 400s
    };
  }

  if (errorCode === 'unauthorized_client' || errorCode === 'access_denied') {
    return {
      success: false,
      error: 'token_revoked',
      message: 'Access has been revoked. Please reconnect Xero.',
      shouldDeactivate: true
    };
  }

  // Rate limiting - retry later
  if (status === 429) {
    return {
      success: false,
      error: 'rate_limited',
      message: 'Too many requests to Xero. Please try again later.'
    };
  }

  // Server errors - transient
  if (status >= 500) {
    return {
      success: false,
      error: 'server_error',
      message: 'Xero API is temporarily unavailable.'
    };
  }

  // Unknown error
  return {
    success: false,
    error: 'unknown',
    message: `Unexpected error: ${status} - ${errorText}`
  };
}

/**
 * Acquire a lock to prevent concurrent token refreshes
 * Uses database timestamp to coordinate between processes
 */
async function acquireRefreshLock(
  connectionId: string,
  supabase: SupabaseClient
): Promise<{ acquired: boolean }> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - 30000); // Lock expires after 30 seconds

  // Try to acquire lock by setting token_refreshing_at
  // Only succeed if no other process has the lock
  const { data, error } = await supabase
    .from('xero_connections')
    .update({ token_refreshing_at: now.toISOString() })
    .eq('id', connectionId)
    .or(`token_refreshing_at.is.null,token_refreshing_at.lt.${lockExpiry.toISOString()}`)
    .select('id')
    .single();

  if (error || !data) {
    return { acquired: false };
  }

  return { acquired: true };
}

/**
 * Release the refresh lock
 */
async function releaseRefreshLock(
  connectionId: string,
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from('xero_connections')
    .update({ token_refreshing_at: null })
    .eq('id', connectionId);
}

/**
 * Check connection health and return status
 */
export async function checkConnectionHealth(
  connection: XeroConnection
): Promise<{
  isHealthy: boolean;
  expiresIn: number; // minutes until token expires
  refreshTokenAge?: number; // days since connection was created (proxy for refresh token age)
  warnings: string[];
}> {
  const now = new Date();
  const expiry = new Date(connection.expires_at);
  const expiresInMs = expiry.getTime() - now.getTime();
  const expiresInMinutes = Math.floor(expiresInMs / 60000);

  const warnings: string[] = [];

  // Check if token is expired or about to expire
  if (expiresInMinutes <= 0) {
    warnings.push('Access token has expired');
  } else if (expiresInMinutes <= 5) {
    warnings.push('Access token expires in less than 5 minutes');
  }

  // Note: We can't directly check refresh token age without storing creation date
  // Could add this field to xero_connections table in future

  return {
    isHealthy: expiresInMinutes > 0 && connection.is_active,
    expiresIn: expiresInMinutes,
    warnings
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
