import express, { Request, Response } from 'express';
import { sqlite } from '@openbill/database';
import { allocatePaymentSession, reconcileCreditAlert } from '@openbill/billing-core';
import { compileUpiDeepLinks } from './services/upi.js';
import { generateInlineVectorSvgQr } from './services/qr.js';
import { renderCheckoutHtml, CheckoutPageData } from './views/checkout-page.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Root route: Automatically redirect to demo bill checkout
app.get('/', async (req: Request, res: Response) => {
  res.redirect('/pay/bill_demo');
});

// Pay link: Auto-allocate fractional session on the fly
app.get('/pay/:billId', async (req: Request, res: Response) => {
  const { billId } = req.params;
  try {
    const session = await allocatePaymentSession(billId);
    res.redirect(`/checkout/${session.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).send(`
      <body style="font-family:sans-serif;background:#090d16;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;">
        <div style="text-align:center;">
          <h2>Payment Slot Allocation Error</h2>
          <p style="color:#f87171;">${msg}</p>
          <a href="/" style="color:#38bdf8;">Return to Dashboard</a>
        </div>
      </body>
    `);
  }
});

// Developer Simulation Endpoint: Simulate incoming bank SMS credit alert in browser
app.post('/api/sessions/:sessionId/simulate-bank-payment', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sqlite.prepare(`
    SELECT allocated_amount_paise FROM payment_sessions WHERE id = ?
  `).get(sessionId) as { allocated_amount_paise: number } | undefined;

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const simulatedUtr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  const outcome = reconcileCreditAlert({
    amountPaise: session.allocated_amount_paise,
    utr: simulatedUtr,
    sender: 'VK-HDFCBK',
    rawMessage: `Simulated Credit: INR ${(session.allocated_amount_paise / 100).toFixed(2)} via UPI Ref ${simulatedUtr}`,
  });

  res.json({ success: true, utr: simulatedUtr, outcome });
});

interface SessionRecordRow {
  sessionId: string;
  fractionalOffset: number;
  allocatedAmountPaise: number;
  status: string;
  expiresAtTimestamp: number;
  billId: string;
  baseAmountPaise: number;
  billingCycle: string;
  consumerName: string;
  merchantName: string;
  upiVpa: string;
  bankReferenceUtr: string | null;
}

/**
 * Helper to fetch hydrated session details from SQLite
 */
function getHydratedSession(sessionId: string): SessionRecordRow | undefined {
  const query = `
    SELECT 
      ps.id as sessionId,
      ps.fractional_offset as fractionalOffset,
      ps.allocated_amount_paise as allocatedAmountPaise,
      ps.status as status,
      ps.expires_at as expiresAtTimestamp,
      ps.bank_reference_utr as bankReferenceUtr,
      b.id as billId,
      b.base_amount_paise as baseAmountPaise,
      b.billing_cycle as billingCycle,
      c.name as consumerName,
      m.business_name as merchantName,
      m.upi_vpa as upiVpa
    FROM payment_sessions ps
    JOIN bills b ON ps.bill_id = b.id
    JOIN consumers c ON b.consumer_id = c.id
    JOIN merchants m ON c.merchant_id = m.id
    WHERE ps.id = ?
  `;

  return sqlite.prepare(query).get(sessionId) as SessionRecordRow | undefined;
}

/**
 * 1. Consumer Checkout Page
 * Renders the responsive bottom sheet UI with Vector SVG QR and 5-min countdown timer
 */
app.get('/checkout/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = getHydratedSession(sessionId);

  if (!session) {
    res.status(404).send(`
      <body style="font-family:sans-serif;background:#090d16;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;">
        <div style="text-align:center;">
          <h2>Session Not Found</h2>
          <p style="color:#94a3b8;">The requested payment session does not exist or has expired.</p>
        </div>
      </body>
    `);
    return;
  }

  // Compile NPCI UPI URI and mobile app deep links
  const upiLinks = compileUpiDeepLinks({
    upiVpa: session.upiVpa,
    merchantName: session.merchantName,
    allocatedAmountPaise: session.allocatedAmountPaise,
    transactionNote: `Bill-${session.billingCycle}-${session.consumerName.split(' ')[0]}`,
    sessionId: session.sessionId,
  });

  // Generate pure inline Vector SVG QR without external API
  const svgQr = await generateInlineVectorSvgQr(upiLinks.generic, {
    title: `Pay ₹${upiLinks.amountFormatted} to ${session.merchantName}`,
  });

  const pageData: CheckoutPageData = {
    sessionId: session.sessionId,
    billId: session.billId,
    merchantName: session.merchantName,
    upiVpa: session.upiVpa,
    consumerName: session.consumerName,
    billingCycle: session.billingCycle,
    baseAmountPaise: session.baseAmountPaise,
    fractionalOffset: session.fractionalOffset,
    allocatedAmountPaise: session.allocatedAmountPaise,
    expiresAtTimestamp: session.expiresAtTimestamp,
    status: session.status,
    upiLinks,
    svgQr,
  };

  const html = renderCheckoutHtml(pageData);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

/**
 * 2. JSON API endpoint for headless or custom UI consumers
 */
app.get('/api/checkout/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = getHydratedSession(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const upiLinks = compileUpiDeepLinks({
    upiVpa: session.upiVpa,
    merchantName: session.merchantName,
    allocatedAmountPaise: session.allocatedAmountPaise,
    transactionNote: `Bill-${session.billingCycle}`,
    sessionId: session.sessionId,
  });

  const svgQr = await generateInlineVectorSvgQr(upiLinks.generic);

  res.json({
    session,
    upiLinks,
    svgQr,
  });
});

/**
 * 3. Server-Sent Events (SSE) Endpoint
 * Pushes real-time status mutations ('AWAITING_ALERT', 'SUCCESS', 'EXPIRED') to the client
 */
app.get('/api/sessions/:sessionId/stream', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial keep-alive ping
  res.write(`event: ping\ndata: {"time":${Date.now()}}\n\n`);

  let isClosed = false;

  const checkStatusInterval = setInterval(() => {
    if (isClosed) return;

    const row = sqlite.prepare(`
      SELECT status, bank_reference_utr, expires_at 
      FROM payment_sessions 
      WHERE id = ?
    `).get(sessionId) as { status: string; bank_reference_utr: string | null; expires_at: number } | undefined;

    if (!row) {
      res.write(`event: status\ndata: {"status":"NOT_FOUND"}\n\n`);
      clearInterval(checkStatusInterval);
      res.end();
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // If marked SUCCESS
    if (row.status === 'SUCCESS') {
      res.write(`event: status\ndata: {"status":"SUCCESS","utr":"${row.bank_reference_utr || ''}"}\n\n`);
      clearInterval(checkStatusInterval);
      res.end();
      return;
    }

    // If expired
    if (row.status === 'EXPIRED' || now >= row.expires_at) {
      res.write(`event: status\ndata: {"status":"EXPIRED"}\n\n`);
      clearInterval(checkStatusInterval);
      res.end();
      return;
    }

    // Default status heartbeat
    res.write(`event: status\ndata: {"status":"AWAITING_ALERT","expiresAt":${row.expires_at}}\n\n`);
  }, 1000);

  req.on('close', () => {
    isClosed = true;
    clearInterval(checkStatusInterval);
  });
});

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`⚡ Openbill Pay Consumer Portal running on http://localhost:${PORT}`);
  });
}
