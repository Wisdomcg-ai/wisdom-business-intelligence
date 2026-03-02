// Xero sync status indicator with manual sync button
'use client';

import { RefreshCw, CheckCircle, AlertCircle, Clock, CloudOff } from 'lucide-react';
import { useXeroSync } from '@/hooks/useXeroSync';

interface XeroSyncIndicatorProps {
  businessId: string | null;
  showLabel?: boolean;
  compact?: boolean;
}

export function XeroSyncIndicator({
  businessId,
  showLabel = true,
  compact = false
}: XeroSyncIndicatorProps) {
  const {
    isConnected,
    isSyncing,
    isStale,
    tenantName,
    error,
    sync,
    formatLastSynced
  } = useXeroSync({
    businessId,
    autoSyncIfStale: true
  });

  if (!businessId) {
    return null;
  }

  // Not connected state
  if (!isConnected) {
    if (compact) {
      return (
        <div className="flex items-center gap-1.5 text-gray-400">
          <CloudOff className="w-4 h-4" />
          <span className="text-xs">Xero not connected</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        <CloudOff className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500">Xero not connected</span>
      </div>
    );
  }

  // Syncing state
  if (isSyncing) {
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'px-3 py-2 bg-blue-50 rounded-lg'}`}>
        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
        {showLabel && (
          <span className={`text-blue-600 ${compact ? 'text-xs' : 'text-sm'}`}>
            Syncing with Xero...
          </span>
        )}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'px-3 py-2 bg-red-50 rounded-lg'}`}>
        <AlertCircle className="w-4 h-4 text-red-500" />
        {showLabel && (
          <span className={`text-red-600 ${compact ? 'text-xs' : 'text-sm'}`}>
            Sync error
          </span>
        )}
        <button
          onClick={() => sync()}
          className="ml-2 text-xs text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Stale data state
  if (isStale) {
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'px-3 py-2 bg-yellow-50 rounded-lg'}`}>
        <Clock className="w-4 h-4 text-yellow-600" />
        {showLabel && (
          <div className="flex flex-col">
            <span className={`text-yellow-700 ${compact ? 'text-xs' : 'text-sm'}`}>
              Data outdated
            </span>
            {!compact && (
              <span className="text-xs text-yellow-600">
                Last synced: {formatLastSynced()}
              </span>
            )}
          </div>
        )}
        <button
          onClick={() => sync()}
          className={`ml-2 flex items-center gap-1 ${
            compact
              ? 'text-xs text-yellow-700 hover:text-yellow-900'
              : 'px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          Sync
        </button>
      </div>
    );
  }

  // Connected and up-to-date state
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'px-3 py-2 bg-green-50 rounded-lg'}`}>
      <CheckCircle className="w-4 h-4 text-green-500" />
      {showLabel && (
        <div className="flex flex-col">
          <span className={`text-green-700 ${compact ? 'text-xs' : 'text-sm'}`}>
            {tenantName || 'Xero connected'}
          </span>
          {!compact && (
            <span className="text-xs text-green-600">
              Synced: {formatLastSynced()}
            </span>
          )}
        </div>
      )}
      <button
        onClick={() => sync()}
        className={`ml-2 ${
          compact
            ? 'text-green-600 hover:text-green-800'
            : 'p-1 text-green-600 hover:bg-green-100 rounded'
        }`}
        title="Sync now"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
