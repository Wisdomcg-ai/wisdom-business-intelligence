// Hook to keep Xero tokens fresh while user is actively using the app
// Runs every 10 minutes when the app is open
// Now with improved error handling and status callbacks

import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { fetchXeroBusinessStatus, type XeroStatusResponse } from '@/lib/xero/business-status-view';

export interface XeroConnectionStatus {
  /** The business has at least one live Xero org. */
  connected: boolean;
  expired: boolean;
  /** An org is disconnected or has stopped refreshing — a person must reconnect. */
  needsReconnect: boolean;
  /** The org that needs it, when only part of a multi-org business does. */
  scope?: string | null;
  health?: {
    isHealthy: boolean;
    expiresInMinutes: number | null;
    warnings: string[];
  };
  error?: string;
  lastChecked: Date;
  /**
   * The full status answer this check received, so a page can re-render from it —
   * otherwise a toast could say "reconnect" above a panel still showing the
   * answer from page load.
   */
  response?: XeroStatusResponse;
}

interface UseXeroKeepaliveOptions {
  onStatusChange?: (status: XeroConnectionStatus) => void;
  showToasts?: boolean;
}

export function useXeroKeepalive(
  businessId: string | null,
  enabled: boolean = true,
  options: UseXeroKeepaliveOptions = {}
) {
  const { onStatusChange, showToasts = true } = options;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<XeroConnectionStatus | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<XeroConnectionStatus | null>(null);
  const failureCountRef = useRef(0);

  // A different business is a fresh start: its first check must not be compared
  // with the last business's state (a stray "expired" or "restored" toast).
  useEffect(() => {
    lastStatusRef.current = null;
    failureCountRef.current = 0;
    setStatus(null);
  }, [businessId]);

  const refreshTokens = useCallback(async () => {
    if (!businessId) return;

    // Abort any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // The status route refreshes the token of EVERY live org of the business,
    // then reports the whole business.
    let check: Awaited<ReturnType<typeof fetchXeroBusinessStatus>>;
    try {
      check = await fetchXeroBusinessStatus(businessId, { signal: controller.signal });
    } catch {
      // Only an abort reaches here: this check was superseded by a newer one.
      return;
    }

    if (!check.ok) {
      // A non-2xx or network failure says nothing about Xero. It used to be
      // parsed as a body with `connected` missing, i.e. "connection lost".
      failureCountRef.current++;
      console.error('[Xero Keepalive] Could not check the connection (attempt', failureCountRef.current, ')');

      // Only show toast after 3 consecutive failures to avoid noise
      if (failureCountRef.current >= 3 && showToasts) {
        toast.error('Unable to check Xero connection. Check your network.', {
          duration: 5000,
          id: 'xero-network-error'
        });
      }

      const errorStatus: XeroConnectionStatus = {
        connected: lastStatusRef.current?.connected ?? false, // Assume still connected if was before
        expired: false,
        needsReconnect: false,
        error: 'Unable to check connection',
        lastChecked: new Date()
      };
      setStatus(errorStatus);
      return;
    }

    const data = check.data;
    failureCountRef.current = 0;

    const newStatus: XeroConnectionStatus = {
      connected: data.connected,
      expired: data.expired,
      needsReconnect: data.needsReconnect,
      scope: data.status_scope,
      health: data.health,
      error: data.error || data.message,
      lastChecked: new Date(),
      response: data
    };

    const prevStatus = lastStatusRef.current;
    if (prevStatus && showToasts) {
      const scoped = newStatus.scope ? `${newStatus.scope}: ` : '';
      if (!prevStatus.needsReconnect && newStatus.needsReconnect) {
        // A person has to act — including when only one org of several needs it,
        // which the old connected-flag check could never see.
        console.warn('[Xero Keepalive] Reconnect needed:', newStatus.scope ?? 'business', newStatus.error);
        toast.error(`${scoped}Xero connection expired. Please reconnect from Integrations.`, {
          duration: 10000,
          id: 'xero-disconnected'
        });
      } else if (prevStatus.connected && !newStatus.connected) {
        console.warn('[Xero Keepalive] Connection lost:', newStatus.error);
        toast.warning('Xero is no longer connected.', {
          duration: 5000,
          id: 'xero-issue'
        });
      } else if (
        (prevStatus.needsReconnect && !newStatus.needsReconnect) ||
        (!prevStatus.connected && newStatus.connected)
      ) {
        console.log('[Xero Keepalive] Connection restored');
        toast.success('Xero connection restored', {
          duration: 3000,
          id: 'xero-restored'
        });
      }
    }

    // Log health warnings
    if (newStatus.health?.warnings?.length) {
      console.warn('[Xero Keepalive] Health warnings:', newStatus.health.warnings);
    }

    // Update refs and state
    lastStatusRef.current = newStatus;
    setStatus(newStatus);
    onStatusChange?.(newStatus);

    if (newStatus.connected) {
      console.log('[Xero Keepalive] Token check complete, connection active. Expires in:',
        newStatus.health?.expiresInMinutes, 'minutes');
    }
  }, [businessId, onStatusChange, showToasts]);

  useEffect(() => {
    if (!enabled || !businessId) {
      return;
    }

    // Initial check after 30 seconds (faster first check)
    const initialTimeout = setTimeout(refreshTokens, 30 * 1000);

    // Then check every 10 minutes
    intervalRef.current = setInterval(refreshTokens, 10 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, [businessId, enabled, refreshTokens]);

  // Manual refresh function
  const checkNow = useCallback(() => {
    return refreshTokens();
  }, [refreshTokens]);

  return { status, checkNow };
}
