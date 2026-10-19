import express, { Request, Response } from 'express';
import { verifySignature } from '@openbill/common';
import { reconcileCreditAlert } from './reconciliation/reconciler.js';
import { allocatePaymentSession } from './allocator/slot-allocator.js';

const app = express();
const PORT = process.env.PORT || 4000;
const SHARED_SECRET = process.env.SHARED_SYSTEM_SECRET || 'openbill_system_secret_2026';

app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'openbill-billing-core', timestamp: Date.now() });
});

/**
 * POST /api/reconcile
 * Secure webhook called by bank-sms and observer services
 * Protected via HMAC-SHA256 signature
 */
app.post('/api/reconcile', (req: Request, res: Response) => {
  const signature = req.headers['x-signature'] as string;
  const timestampHeader = req.headers['x-timestamp'] as string;

  if (!signature || !timestampHeader) {
    res.status(401).json({ error: 'Missing x-signature or x-timestamp headers' });
    return;
  }

  const timestamp = parseInt(timestampHeader, 10);
  const isValid = verifySignature(req.body, signature, SHARED_SECRET, timestamp);

  if (!isValid) {
    res.status(403).json({ error: 'Invalid HMAC signature or expired timestamp window' });
    return;
  }

  const { amountPaise, utr, sender, rawMessage } = req.body;

  if (typeof amountPaise !== 'number' || !utr) {
    res.status(400).json({ error: 'amountPaise (number) and utr (string) are required' });
    return;
  }

  try {
    const outcome = reconcileCreditAlert({
      amountPaise,
      utr,
      sender,
      rawMessage: rawMessage || '',
    });

    res.json(outcome);
  } catch (err) {
    console.error('[BillingCore] Reconciliation error:', err);
    res.status(500).json({ error: 'Internal reconciliation failure' });
  }
});

/**
 * POST /api/bills/:billId/allocate-session
 * Endpoint to request a fractional slot payment session
 */
app.post('/api/bills/:billId/allocate-session', async (req: Request, res: Response) => {
  const { billId } = req.params;

  try {
    const session = await allocatePaymentSession(billId);
    res.json({ success: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: message });
  }
});

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Openbill Pay Core API listening on http://localhost:${PORT}`);
  });
}
