process.env.NODE_ENV = 'test';
import http from 'node:http';
import {
  computeGatewaySignature,
  verifyGatewaySignature,
  dispatchMerchantWebhook,
  MerchantWebhookPayload,
} from './merchant-webhook-notifier.js';

async function runWebhookTests() {
  console.log('🧪 Starting Merchant Webhook Notifier Test Suite...\n');

  const merchantSecret = 'whsec_99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4';
  const samplePayload: MerchantWebhookPayload = {
    event: 'SUCCESS',
    orderId: 'BILL_OCT2026_9942',
    amount: 150002, // 150002 Paise = ₹1,500.02
    utr: '429381729384',
    paymentId: 'sess_f8b1c2d3-4e5a-6b7c-8d9e-0f1a2b3c4d5e',
    timestamp: 1776612000000,
  };

  const rawJson = JSON.stringify(samplePayload);

  // Test 1: Signature Computation Format
  const signature = computeGatewaySignature(rawJson, merchantSecret);
  console.log('✓ Generated X-Gateway-Signature:', signature);
  if (!signature.startsWith('sha256=') || signature.length !== 71) {
    throw new Error('Test 1 failed: Signature must be prefixed with sha256= and have 64 hex chars');
  }

  // Test 2: Signature Verification
  const isValid = verifyGatewaySignature(rawJson, signature, merchantSecret);
  console.log('✓ Signature Verified Successfully:', isValid);
  if (!isValid) {
    throw new Error('Test 2 failed: Valid signature was rejected');
  }

  // Test 3: Tamper Resistance (Payload Tampering)
  const tamperedJson = JSON.stringify({ ...samplePayload, amount: 150000 });
  const isTamperedValid = verifyGatewaySignature(tamperedJson, signature, merchantSecret);
  console.log('✓ Tampered Payload Rejected:', !isTamperedValid);
  if (isTamperedValid) {
    throw new Error('Test 3 failed: Tampered payload was erroneously accepted');
  }

  // Test 4: Secret Mismatch Rejection
  const isWrongSecretValid = verifyGatewaySignature(rawJson, signature, 'wrong_secret');
  console.log('✓ Wrong Secret Rejected:', !isWrongSecretValid);
  if (isWrongSecretValid) {
    throw new Error('Test 4 failed: Signature verified with incorrect secret');
  }

  // Test 5: Live HTTP Dispatch to Simulated Merchant Server
  console.log('\n🚀 Starting Ephemeral Merchant HTTP Receiver Server...');
  let receivedSignatureHeader: string | null = null;
  let receivedRawBytes: Buffer | null = null;
  let receivedJson: any = null;

  const mockServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhook/openbill-pay') {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        receivedRawBytes = Buffer.concat(chunks);
        receivedSignatureHeader = req.headers['x-gateway-signature'] as string || null;
        try {
          receivedJson = JSON.parse(receivedRawBytes.toString('utf8'));
        } catch {}

        // Validate signature using raw bytes
        const verified = verifyGatewaySignature(
          receivedRawBytes,
          receivedSignatureHeader || '',
          merchantSecret
        );

        if (verified) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true, status: 'PROCESSED' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_SIGNATURE' }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const address = mockServer.address() as any;
  const targetUrl = `http://127.0.0.1:${address.port}/webhook/openbill-pay`;
  console.log(`✓ Merchant Server listening on: ${targetUrl}`);

  // Dispatch webhook via client
  const dispatchResult = await dispatchMerchantWebhook(targetUrl, merchantSecret, samplePayload);
  console.log('✓ Dispatch Result:', dispatchResult);

  mockServer.close();

  if (!dispatchResult.success || dispatchResult.statusCode !== 200) {
    throw new Error('Test 5 failed: Webhook dispatch was not acknowledged with HTTP 200');
  }

  if (!receivedJson || receivedJson.event !== 'SUCCESS' || receivedJson.utr !== '429381729384') {
    throw new Error('Test 5 failed: Payload mismatch on merchant side');
  }

  console.log('\n🎉 All Merchant Webhook Notifier tests passed with 100% precision!');
  process.exit(0);
}

runWebhookTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
