// src/components/integrations/XeroConnect.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { 
  initiateXeroAuth,
  getXeroConnections,
  triggerXeroSync 
} from '@/lib/api/xero-client';

interface XeroConnection {
  id: string;
  tenantId: string;
  tenantName: string;
  connectedAt: string;
  lastSync?: string;
}

interface XeroConnectProps {
  userId: string;
}

export function XeroConnect({ userId }: XeroConnectProps) {
  const [connections, setConnections] = useState<XeroConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing connections on mount
  useEffect(() => {
    loadConnections();
  }, [userId]);

  const loadConnections = async () => {
    setIsLoading(true);
    try {
      const data = await getXeroConnections(userId);
      setConnections(data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load Xero connections');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initiate Xero OAuth
  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const { authUrl } = await initiateXeroAuth(userId);
      
      // Redirect to Xero
      window.location.href = authUrl;
    } catch (err) {
      setError('Failed to initiate connection');
      console.error(err);
      setIsLoading(false);
    }
  };

  // Manually sync data
  const handleSync = async (tenantId: string) => {
    setIsSyncing(tenantId);
    try {
      await triggerXeroSync(tenantId);
      setError(null);
      
      // Reload connections to show updated lastSync
      await loadConnections();
    } catch (err) {
      setError('Failed to sync data');
      console.error(err);
    } finally {
      setIsSyncing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Xero Integration</h2>
          <p className="text-gray-600 mt-1">
            Connect your Xero account to automatically sync financial data
          </p>
        </div>
        {!isLoading && connections.length === 0 && (
          <Button 
            onClick={handleConnect}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Connect Xero
          </Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !connections.length && (
        <div className="flex gap-2 justify-center py-8">
          <Loader className="animate-spin" />
          <p>Loading connections...</p>
        </div>
      )}

      {/* Connected organizations */}
      {connections.length > 0 && (
        <div className="grid gap-4">
          <p className="text-sm text-gray-600">
            Connected to {connections.length} Xero organization{connections.length !== 1 ? 's' : ''}
          </p>
          
          {connections.map((connection) => (
            <Card key={connection.id} className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="text-green-600 h-5 w-5" />
                    <h3 className="font-semibold">{connection.tenantName}</h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Connected on{' '}
                    {new Date(connection.connectedAt).toLocaleDateString()}
                  </p>
                  {connection.lastSync && (
                    <p className="text-sm text-gray-600">
                      Last synced:{' '}
                      {new Date(connection.lastSync).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => handleSync(connection.tenantId)}
                  disabled={isSyncing === connection.tenantId}
                  variant="outline"
                >
                  {isSyncing === connection.tenantId ? (
                    <>
                      <Loader className="animate-spin mr-2 h-4 w-4" />
                      Syncing...
                    </>
                  ) : (
                    'Sync Now'
                  )}
                </Button>
              </div>
            </Card>
          ))}

          {/* Add another connection button */}
          <Button 
            onClick={handleConnect}
            variant="outline"
            className="w-full"
          >
            Connect Another Organization
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && connections.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-600 mb-4">
            No Xero accounts connected yet
          </p>
          <Button onClick={handleConnect}>
            Connect Your First Xero Account
          </Button>
        </Card>
      )}
    </div>
  );
}