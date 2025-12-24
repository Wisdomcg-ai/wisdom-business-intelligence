// Hook to keep Xero tokens fresh while user is actively using the app
// Runs every 10 minutes when the app is open

import { useEffect, useRef } from 'react';

export function useXeroKeepalive(businessId: string | null, enabled: boolean = true) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !businessId) {
      return;
    }

    const refreshTokens = async () => {
      try {
        // Call the status endpoint which will trigger a token refresh if needed
        const response = await fetch(`/api/Xero/status?business_id=${businessId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.connected) {
            console.log('[Xero Keepalive] Token check complete, connection active');
          }
        }
      } catch (error) {
        console.error('[Xero Keepalive] Error:', error);
      }
    };

    // Initial check after 1 minute
    const initialTimeout = setTimeout(refreshTokens, 60 * 1000);

    // Then check every 10 minutes
    intervalRef.current = setInterval(refreshTokens, 10 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [businessId, enabled]);
}
