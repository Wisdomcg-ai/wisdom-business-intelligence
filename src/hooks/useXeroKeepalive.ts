// Hook to keep Xero tokens fresh while user is actively using the app
// Runs every 10 minutes when the app is open
// Now with improved error handling and status callbacks

import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';

export interface XeroConnectionStatus {
  connected: boolean;
  expired: boolean;
  needsReconnect: boolean;
  health?: {
    isHealthy: boolean;
    expiresInMinutes: number;
    warnings: string[];
  };
  error?: string;
  lastChecked: Date;
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
  const [status, setStatus] = useState<XeroConnectionStatus | null>(null);
  const failureCountRef = useRef(0);

  const refreshTokens = useCallback(async () => {
    if (!businessId) return;

    try {
      const response = await fetch(`/api/Xero/status?business_id=${businessId}`);
      const data = await response.json();

      const newStatus: XeroConnectionStatus = {
        connected: data.connected ?? false,
        expired: data.expired ?? false,
        needsReconnect: data.needsReconnect ?? false,
        health: data.health,
        error: data.error || data.message,
        lastChecked: new Date()
      };

      // Reset failure count on successful check
      if (response.ok && data.connected) {
        failureCountRef.current = 0;
      }

      // Detect status changes for notifications
      const prevStatus = lastStatusRef.current;
      const statusChanged = !prevStatus ||
        prevStatus.connected !== newStatus.connected ||
        prevStatus.expired !== newStatus.expired;

      if (statusChanged) {
        // Connection lost
        if (prevStatus?.connected && !newStatus.connected) {
          console.warn('[Xero Keepalive] Connection lost:', newStatus.error);
          if (showToasts) {
            if (newStatus.needsReconnect) {
              toast.error('Xero connection expired. Please reconnect from Integrations.', {
                duration: 10000,
                id: 'xero-disconnected'
              });
            } else {
              toast.warning('Xero connection issue. Retrying...', {
                duration: 5000,
                id: 'xero-issue'
              });
            }
          }
        }

        // Connection restored
        if (!prevStatus?.connected && newStatus.connected) {
          console.log('[Xero Keepalive] Connection restored');
          if (showToasts && prevStatus) {
            toast.success('Xero connection restored', {
              duration: 3000,
              id: 'xero-restored'
            });
          }
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

    } catch (error) {
      failureCountRef.current++;
      console.error('[Xero Keepalive] Network error (attempt', failureCountRef.current, '):', error);

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
        error: 'Network error - unable to check connection',
        lastChecked: new Date()
      };
      setStatus(errorStatus);
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
    };
  }, [businessId, enabled, refreshTokens]);

  // Manual refresh function
  const checkNow = useCallback(() => {
    return refreshTokens();
  }, [refreshTokens]);

  return { status, checkNow };
}
