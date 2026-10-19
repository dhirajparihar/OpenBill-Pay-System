import { compileUpiDeepLinks, paiseToRupeesDecimal } from './services/upi.js';
import { generateInlineVectorSvgQr } from './services/qr.js';
import { renderCheckoutHtml } from './views/checkout-page.js';

async function runPortalTests() {
  console.log('🧪 Starting Consumer Portal Test Suite...');

  // Test 1: NPCI UPI Deep Link Compiler
  const upi = compileUpiDeepLinks({
    upiVpa: 'merchant@hdfcbank',
    merchantName: 'Openbill Fiber Net',
    allocatedAmountPaise: 150002, // ₹1500.02
    transactionNote: 'Bill-202610',
    sessionId: 'sess_abc123',
  });

  console.log('✓ Compiled Generic NPCI UPI URI:', upi.generic);
  if (!upi.generic.startsWith('upi://pay?')) {
    throw new Error('Test 1 failed: Missing upi://pay scheme');
  }
  if (!upi.generic.includes('pa=merchant%40hdfcbank') && !upi.generic.includes('pa=merchant@hdfcbank')) {
    throw new Error('Test 1 failed: VPA not encoded properly');
  }
  if (!upi.generic.includes('am=1500.02')) {
    throw new Error('Test 1 failed: Amount mismatch in URI');
  }
  if (!upi.generic.includes('cu=INR')) {
    throw new Error('Test 1 failed: Currency must be strictly INR');
  }

  // App-specific intents check
  console.log('✓ GPay Intent:', upi.googlePay);
  console.log('✓ PhonePe Intent:', upi.phonePe);
  console.log('✓ Paytm Intent:', upi.paytm);
  if (!upi.googlePay.startsWith('tez://upi/pay?')) throw new Error('Invalid GPay intent');
  if (!upi.phonePe.startsWith('phonepe://pay?')) throw new Error('Invalid PhonePe intent');
  if (!upi.paytm.startsWith('paytmmp://pay?')) throw new Error('Invalid Paytm intent');

  // Test 2: Pure Local Vector SVG QR Generation
  const svg = await generateInlineVectorSvgQr(upi.generic, {
    title: 'Test QR',
  });
  console.log('✓ Vector SVG QR generated (length: %d chars)', svg.length);
  if (!svg.includes('<svg') || !svg.includes('</svg>')) {
    throw new Error('Test 2 failed: Did not generate valid SVG');
  }
  if (!svg.includes('viewBox')) {
    throw new Error('Test 2 failed: SVG missing viewBox');
  }

  // Test 3: HTML Rendering with Server-Authoritative 5-minute timer & SSE listener
  const html = renderCheckoutHtml({
    sessionId: 'sess_abc123',
    billId: 'bill_999',
    merchantName: 'Openbill Fiber Net',
    upiVpa: 'merchant@hdfcbank',
    consumerName: 'Aditya Verma',
    billingCycle: '2026-10',
    baseAmountPaise: 150000,
    fractionalOffset: 2,
    allocatedAmountPaise: 150002,
    expiresAtTimestamp: Math.floor(Date.now() / 1000) + 300,
    status: 'AWAITING_ALERT',
    upiLinks: upi,
    svgQr: svg,
  });

  console.log('✓ Checkout HTML rendered (length: %d chars)', html.length);
  if (!html.includes('EventSource')) {
    throw new Error('Test 3 failed: SSE listener missing from HTML');
  }
  if (!html.includes('countdownText')) {
    throw new Error('Test 3 failed: Countdown timer element missing');
  }
  if (!html.includes('btn-primary-intent')) {
    throw new Error('Test 3 failed: Pay via installed app button missing');
  }

  console.log('🎉 All Consumer Portal tests passed cleanly!');
}

runPortalTests().catch(err => {
  console.error('❌ Portal test failed:', err);
  process.exit(1);
});
