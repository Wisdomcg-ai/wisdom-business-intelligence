// Hook for managing Xero sync state and auto-syncing stale data
'use client';

import { useState, useEffect, useCallback } from 'react';

interface XeroSyncState {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  isStale: boolean; // Data is >24h old
  tenantName: string | null;
  error: string | null;
}

interface UseXeroSyncOptions {
  businessId: string | null;
  autoSyncIfStale?: boolean; // Auto-sync if data is >24h old
  staleThresholdHours?: number; // Default 24 hours
}

export function useXeroSync({
  businessId,
  autoSyncIfStale = true,
  staleThresholdHours = 24
}: UseXeroSyncOptions) {
  const [state, setState] = useState<XeroSyncState>({
    isConnected: false,
    isSyncing: false,
    lastSyncedAt: null,
    isStale: false,
    tenantName: null,
    error: null
  });

  const [hasAutoSynced, setHasAutoSynced] = useState(false);

  // Check connection status
  const checkStatus = useCallback(async () => {
    if (!businessId) return;

    try {
      const response = await fetch(`/api/Xero/status?business_id=${businessId}`);
      const data = await response.json();

      if (data.connected && data.connection) {
        const lastSynced = data.connection.last_synced_at
          ? new Date(data.connection.last_synced_at)
          : null;

        const now = new Date();
        const staleThreshold = staleThresholdHours * 60 * 60 * 1000;
        const isStale = !lastSynced || (now.getTime() - lastSynced.getTime() > staleThreshold);

        setState(prev => ({
          ...prev,
          isConnected: true,
          lastSyncedAt: lastSynced,
          isStale,
          tenantName: data.connection.tenant_name,
          error: null
        }));

        return { isConnected: true, isStale, lastSynced };
      } else {
        setState(prev => ({
          ...prev,
          isConnected: false,
          lastSyncedAt: null,
          isStale: false,
          tenantName: null,
          error: data.message || null
        }));

        return { isConnected: false, isStale: false, lastSynced: null };
      }
    } catch (error) {
      console.error('[useXeroSync] Status check failed:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to check Xero connection'
      }));
      return { isConnected: false, isStale: false, lastSynced: null };
    }
  }, [businessId, staleThresholdHours]);

  // Trigger a sync
  const sync = useCallback(async () => {
    if (!businessId || state.isSyncing) return false;

    setState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const response = await fetch('/api/Xero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Sync failed');
      }

      // Refresh status after sync
      await checkStatus();

      setState(prev => ({ ...prev, isSyncing: false, isStale: false }));
      return true;

    } catch (error) {
      console.error('[useXeroSync] Sync failed:', error);
      setState(prev => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed'
      }));
      return false;
    }
  }, [businessId, state.isSyncing, checkStatus]);

  // Initial status check and auto-sync if stale
  useEffect(() => {
    if (!businessId) return;

    const init = async () => {
      const status = await checkStatus();

      // Auto-sync if enabled and data is stale
      if (autoSyncIfStale && status?.isConnected && status?.isStale && !hasAutoSynced) {
        console.log('[useXeroSync] Data is stale, auto-syncing...');
        setHasAutoSynced(true);
        await sync();
      }
    };

    init();
  }, [businessId, autoSyncIfStale, checkStatus, sync, hasAutoSynced]);

  // Format last synced time for display
  const formatLastSynced = useCallback(() => {
    if (!state.lastSyncedAt) return 'Never';

    const now = new Date();
    const diff = now.getTime() - state.lastSyncedAt.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }, [state.lastSyncedAt]);

  return {
    ...state,
    sync,
    checkStatus,
    formatLastSynced
  };
}
