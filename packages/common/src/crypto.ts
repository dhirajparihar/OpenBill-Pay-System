import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignatureResult {
  signature: string;
  timestamp: number;
}

/**
 * Serializes payload deterministically for HMAC signing
 */
export function canonicalizePayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  return JSON.stringify(payload);
}

/**
 * Computes an HMAC-SHA256 signature for a given payload and shared secret.
 * Binds the timestamp to mitigate replay attacks.
 */
export function signPayload(
  payload: unknown,
  secret: string,
  timestamp: number = Date.now()
): SignatureResult {
  const canonicalData = canonicalizePayload(payload);
  const dataToSign = `${timestamp}.${canonicalData}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(dataToSign);
  const signature = hmac.digest('hex');

  return { signature, timestamp };
}

/**
 * Validates an HMAC-SHA256 signature with constant-time equality check
 * and configurable clock drift tolerance (default: 5 minutes).
 */
export function verifySignature(
  payload: unknown,
  signature: string,
  secret: string,
  timestamp: number,
  maxDriftMs: number = 300000 // 5 minutes
): boolean {
  if (!signature || !secret || !timestamp) {
    return false;
  }

  // Check clock drift / replay window
  const now = Date.now();
  if (Math.abs(now - timestamp) > maxDriftMs) {
    return false;
  }

  const expected = signPayload(payload, secret, timestamp).signature;
  const sigBuffer = Buffer.from(signature, 'hex');
  const expBuffer = Buffer.from(expected, 'hex');

  if (sigBuffer.length !== expBuffer.length) {
    return false;
  }

  return timingSafeEqual(sigBuffer, expBuffer);
}

/**
 * Normalizes an Indian currency string (e.g. "1,500.02", "INR 500", "Rs. 250.5") into minor-unit paise.
 * Avoids IEEE 754 floating-point rounding errors.
 */
export function normalizeCurrencyToPaise(rawAmountStr: string): number {
  if (!rawAmountStr) {
    throw new Error('Empty currency string provided for normalization');
  }

  // Remove currency identifiers and commas
  const cleaned = rawAmountStr
    .replace(/[₹$,]/g, '')
    .replace(/\b(INR|Rs|Rs\.)\b/gi, '')
    .trim();

  // Split integer and fraction parts
  const parts = cleaned.split('.');
  const integerPart = parts[0] ? parseInt(parts[0], 10) : 0;
  
  if (isNaN(integerPart)) {
    throw new Error(`Failed to parse integer amount from: "${rawAmountStr}"`);
  }

  let fractionPart = 0;
  if (parts.length > 1 && parts[1]) {
    const fractionStr = parts[1].slice(0, 2).padEnd(2, '0');
    fractionPart = parseInt(fractionStr, 10);
  }

  return (integerPart * 100) + fractionPart;
}
