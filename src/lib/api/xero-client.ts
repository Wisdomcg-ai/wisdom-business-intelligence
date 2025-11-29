// lib/api/xero-client.ts
// Client for calling AWS Lambda Xero integration endpoints

const XERO_API_ENDPOINT = process.env.NEXT_PUBLIC_XERO_API_URL ||
  'https://fxbc3bbjo9.execute-api.ap-southeast-2.amazonaws.com/Prod';

interface XeroAuthResponse {
  authUrl: string;
  state: string;
}

interface XeroConnection {
  id: string;
  tenantId: string;
  tenantName: string;
  connectedAt: string;
  lastSync?: string;
}

/**
 * Initiate Xero OAuth flow
 * Called when user clicks "Connect Xero" button
 */
export async function initiateXeroAuth(userId: string): Promise<XeroAuthResponse> {
  try {
    console.log('Initiating Xero auth for user:', userId);

    const response = await fetch(
      `${XERO_API_ENDPOINT}/xero/auth/initiate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data: XeroAuthResponse = await response.json();
    
    // Store state in sessionStorage for verification on callback
    sessionStorage.setItem('xero_oauth_state', data.state);
    
    console.log('Successfully initiated Xero auth');
    return data;
  } catch (error) {
    console.error('Failed to initiate Xero auth:', error);
    throw error;
  }
}

/**
 * Handle Xero OAuth callback
 * Called from /api/xero/callback route
 */
export async function handleXeroCallback(
  code: string,
  state: string
): Promise<XeroConnection[]> {
  try {
    console.log('Handling Xero callback');

    // Verify state matches what we stored (CSRF protection)
    const storedState = sessionStorage.getItem('xero_oauth_state');
    if (state !== storedState) {
      throw new Error('OAuth state mismatch - possible CSRF attack');
    }

    const response = await fetch(
      `${XERO_API_ENDPOINT}/xero/auth/callback?code=${code}&state=${state}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Clear stored state
    sessionStorage.removeItem('xero_oauth_state');
    
    console.log('Successfully handled Xero callback');
    return data.tenants || [];
  } catch (error) {
    console.error('Failed to handle Xero callback:', error);
    throw error;
  }
}

/**
 * Get list of connected Xero organizations for user
 */
export async function getXeroConnections(userId: string): Promise<XeroConnection[]> {
  try {
    const response = await fetch(
      `${XERO_API_ENDPOINT}/xero/connections?userId=${userId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Failed to get Xero connections:', error);
    throw error;
  }
}

/**
 * Manually trigger Xero data sync
 */
export async function triggerXeroSync(tenantId: string): Promise<{
  status: 'queued' | 'in_progress' | 'complete';
  message: string;
}> {
  try {
    const response = await fetch(
      `${XERO_API_ENDPOINT}/xero/sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Failed to trigger sync:', error);
    throw error;
  }
}

/**
 * Get financial data from Xero
 */
export async function getXeroData(
  tenantId: string,
  dataType: 'invoices' | 'transactions' | 'p_and_l',
  filters?: Record<string, string>
) {
  try {
    const queryParams = new URLSearchParams({
      tenantId,
      dataType,
      ...filters,
    });

    const response = await fetch(
      `${XERO_API_ENDPOINT}/xero/data?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Failed to get Xero data:', error);
    throw error;
  }
}