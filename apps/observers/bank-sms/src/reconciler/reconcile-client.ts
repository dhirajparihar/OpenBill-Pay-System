import { signPayload } from '@openbill/common';

export interface ReconcileRequest {
  amountPaise: number;
  utr: string;
  sender?: string;
  rawMessage: string;
}

export interface ReconcileResponse {
  success: boolean;
  matchedSessionId?: string;
  billId?: string;
  allocatedAmountPaise?: number;
  error?: string;
}

const DEFAULT_BILLING_CORE_URL = process.env.BILLING_CORE_URL || 'http://localhost:4000';
const SHARED_SECRET = process.env.SHARED_SYSTEM_SECRET || 'openbill_system_secret_2026';

/**
 * Issues an authenticated HMAC-SHA256 signed POST request to billing-core /api/reconcile
 */
export async function dispatchReconcileAlert(
  data: ReconcileRequest,
  billingCoreUrl: string = DEFAULT_BILLING_CORE_URL,
  secret: string = SHARED_SECRET
): Promise<ReconcileResponse> {
  const timestamp = Date.now();
  const payload = {
    amountPaise: data.amountPaise,
    utr: data.utr,
    sender: data.sender || 'UNKNOWN',
    rawMessage: data.rawMessage,
    timestamp,
  };

  const { signature } = signPayload(payload, secret, timestamp);

  const endpoint = `${billingCoreUrl.replace(/\/$/, '')}/api/reconcile`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
        'x-timestamp': timestamp.toString(),
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json() as ReconcileResponse;

    if (!res.ok) {
      console.error(`[Reconciler] HTTP error ${res.status}:`, body);
      return {
        success: false,
        error: body.error || `HTTP ${res.status}`,
      };
    }

    console.log(`[Reconciler] Successfully dispatched reconciliation for UTR ${data.utr}:`, body);
    return body;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Reconciler] Failed to post reconciliation to ${endpoint}:`, errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
