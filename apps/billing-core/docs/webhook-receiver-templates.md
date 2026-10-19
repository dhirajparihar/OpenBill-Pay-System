# Merchant Webhook Integration Guide

This guide provides drop-in, copy-pasteable implementation templates for receiving and verifying Openbill Pay System authoritative webhooks.

---

## 1. Node.js (Express + TypeScript)

### Critical Requirement:
HMAC signatures are computed over the **exact raw request bytes**. Never use `JSON.stringify(req.body)` to re-serialize the body, as whitespace and key ordering will differ and invalidate the signature. Use the `verify` callback in `express.json()`.

```typescript
import express, { Request, Response } from 'express';
import crypto from 'node:crypto';

const app = express();
const MERCHANT_WEBHOOK_SECRET = process.env.MERCHANT_WEBHOOK_SECRET || 'your_merchant_webhook_secret_here';

// Custom interface to attach raw buffer to Request
interface AuthenticatedRequest extends Request {
  rawBody?: Buffer;
}

// Capture exact raw bytes BEFORE JSON parsing
app.use(express.json({
  verify: (req: AuthenticatedRequest, res: Response, buf: Buffer) => {
    req.rawBody = buf;
  }
}));

function verifyGatewaySignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader || !rawBody) return false;

  // Extract hash (supports both "sha256=<hex>" and "<hex>")
  const receivedHex = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  // Compute expected HMAC-SHA256
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedHex = hmac.digest('hex');

  const receivedBuffer = Buffer.from(receivedHex, 'hex');
  const expectedBuffer = Buffer.from(expectedHex, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  // Constant-time comparison prevents timing attacks
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

app.post('/webhook/openbill-pay', async (req: AuthenticatedRequest, res: Response) => {
  const signature = req.headers['x-gateway-signature'] as string;
  const rawBody = req.rawBody;

  if (!rawBody || !signature) {
    return res.status(400).json({ error: 'Missing raw payload or X-Gateway-Signature header' });
  }

  // 1. Authenticate signature
  const isValid = verifyGatewaySignature(rawBody, signature, MERCHANT_WEBHOOK_SECRET);
  if (!isValid) {
    console.warn('[Webhook] ✗ Invalid gateway signature rejected');
    return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
  }

  // 2. Process payload
  const { event, orderId, amount, utr, paymentId, timestamp } = req.body;

  if (event === 'SUCCESS') {
    console.log(`[Webhook] ✓ Payment verified for Order ${orderId}: ₹${(amount / 100).toFixed(2)} (UTR: ${utr})`);

    // TODO: Update your internal database (e.g. Orders, Invoices, Subscriptions)
    // await db.orders.update({ where: { id: orderId }, data: { status: 'PAID', utr } });
  }

  // 3. Acknowledge with HTTP 200 OK
  return res.status(200).json({ received: true });
});

app.listen(8080, () => {
  console.log('Merchant Webhook Receiver running on port 8080');
});
```

---

## 2. Python (FastAPI + Pydantic)

### Critical Requirement:
In FastAPI, read the raw unparsed request body directly using `await request.body()` (`bytes`). Perform constant-time verification using `hmac.compare_digest`.

```python
import hmac
import hashlib
import json
import os
from fastapi import FastAPI, Request, HTTPException, status
from pydantic import BaseModel

app = FastAPI(title="Merchant Webhook Receiver")

MERCHANT_WEBHOOK_SECRET = os.getenv("MERCHANT_WEBHOOK_SECRET", "your_merchant_webhook_secret_here")

class WebhookPayload(BaseModel):
    event: str
    orderId: str
    amount: int  # Amount in paise (e.g., 150002 = ₹1500.02)
    utr: str
    paymentId: str
    timestamp: int

def verify_gateway_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not raw_body:
        return False
        
    # Strip optional "sha256=" prefix
    received_hex = signature_header[7:] if signature_header.startswith("sha256=") else signature_header
    
    # Compute expected HMAC-SHA256 over raw request bytes
    expected_hex = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    # Constant-time comparison
    return hmac.compare_digest(received_hex, expected_hex)

@app.post("/webhook/openbill-pay")
async def handle_openbill_pay_webhook(request: Request):
    signature = request.headers.get("x-gateway-signature")
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Gateway-Signature header"
        )

    # 1. Read exact raw bytes
    raw_body = await request.body()

    # 2. Cryptographic signature check
    if not verify_gateway_signature(raw_body, signature, MERCHANT_WEBHOOK_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature"
        )

    # 3. Parse JSON after signature validation
    data = json.loads(raw_body.decode("utf-8"))
    payload = WebhookPayload(**data)

    if payload.event == "SUCCESS":
        rupees = payload.amount / 100.0
        print(f"[Webhook] Verified payment for Order: {payload.orderId}, Amount: ₹{rupees:.2f}, UTR: {payload.utr}")
        
        # TODO: Update your internal database (e.g., mark invoice as PAID)
        # await db.invoices.update_status(order_id=payload.orderId, status="PAID", utr=payload.utr)

    # 4. Return HTTP 200 acknowledgment
    return {"status": "ok", "received": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```
