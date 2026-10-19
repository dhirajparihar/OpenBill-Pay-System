import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MerchantWebhookPayload {
  event: 'SUCCESS';
  orderId: string;    // Bill ID or Merchant Consumer Reference
  amount: number;     // Integer minor units (Paise)
  utr: string;        // 12-digit Bank Transaction Reference
  paymentId: string;  // Payment Session UUID
  timestamp: number;  // Epoch milliseconds
}

export interface WebhookDispatchResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  signature: string;
}

/**
 * Computes an HMAC-SHA256 hash over the raw JSON payload bytes using the merchant's secret.
 * Formats header as: `X-Gateway-Signature: sha256=<hex_hash>`
 */
export function computeGatewaySignature(rawPayload: string | Buffer, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(rawPayload);
  const digest = hmac.digest('hex');
  return `sha256=${digest}`;
}

/**
 * Validates the X-Gateway-Signature header against the raw request bytes in constant time
 */
export function verifyGatewaySignature(
  rawPayload: string | Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Handle prefix 'sha256='
  const providedHash = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  const expectedSignature = computeGatewaySignature(rawPayload, secret);
  const expectedHash = expectedSignature.slice(7);

  const providedBuffer = Buffer.from(providedHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Dispatches the signed merchant webhook notification over HTTP POST
 */
export async function dispatchMerchantWebhook(
  webhookUrl: string,
  secret: string,
  payload: MerchantWebhookPayload,
  timeoutMs: number = 8000
): Promise<WebhookDispatchResult> {
  const rawBody = JSON.stringify(payload);
  const signature = computeGatewaySignature(rawBody, secret);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Openbill-Webhook-Dispatcher/1.0',
        'X-Gateway-Signature': signature,
        'X-Gateway-Timestamp': payload.timestamp.toString(),
      },
      body: rawBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await res.text().catch(() => '');

    if (!res.ok) {
      console.warn(`[Merchant Webhook] Endpoint returned non-2xx status: ${res.status}`);
      return {
        success: false,
        statusCode: res.status,
        responseBody: responseText,
        error: `HTTP ${res.status}`,
        signature,
      };
    }

    console.log(`[Merchant Webhook] ✓ Successfully acknowledged by merchant (${res.status})`);
    return {
      success: true,
      statusCode: res.status,
      responseBody: responseText,
      signature,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Merchant Webhook] Failed to deliver webhook to ${webhookUrl}:`, errorMsg);
    return {
      success: false,
      error: errorMsg,
      signature,
    };
  }
}
