import { parseBankSmsAlert } from './parser/bank-sms-parser.js';
import { signPayload, verifySignature } from '@openbill/common';

function runBankSmsTests() {
  console.log('🧪 Starting Bank SMS Parser and HMAC Test Suite...\n');

  // Test 1: HDFC Bank Credit SMS
  const hdfcSms = 'Dear Customer, INR 1,500.02 credited to A/c **1234 on 19-OCT-26 by UPI-BHIM-rahul@upi-429381729384. Bal: INR 25,000.00.';
  const hdfcParsed = parseBankSmsAlert(hdfcSms, 'VK-HDFCBK');
  console.log('✓ HDFC Parsed:', hdfcParsed);
  if (!hdfcParsed || hdfcParsed.amountPaise !== 150002 || hdfcParsed.utr !== '429381729384' || hdfcParsed.bank !== 'HDFC') {
    throw new Error('HDFC Parser test failed');
  }

  // Test 2: ICICI Bank Credit SMS
  const iciciSms = 'ICICI Bank Acct XX5678 credited with INR 750.05 on 19-Oct-26. UPI:529381729385-Payee Name. Call 1800...';
  const iciciParsed = parseBankSmsAlert(iciciSms, 'ICICIB');
  console.log('✓ ICICI Parsed:', iciciParsed);
  if (!iciciParsed || iciciParsed.amountPaise !== 75005 || iciciParsed.utr !== '529381729385' || iciciParsed.bank !== 'ICICI') {
    throw new Error('ICICI Parser test failed');
  }

  // Test 3: SBI Credit SMS
  const sbiSms = 'Your A/C 9988 credited by INR 2500.10 on 19Oct26 by UPI/ref no 629381729386. Download YONO.';
  const sbiParsed = parseBankSmsAlert(sbiSms, 'SBIUPI');
  console.log('✓ SBI Parsed:', sbiParsed);
  if (!sbiParsed || sbiParsed.amountPaise !== 250010 || sbiParsed.utr !== '629381729386' || sbiParsed.bank !== 'SBI') {
    throw new Error('SBI Parser test failed');
  }

  // Test 4: Axis Bank Credit SMS
  const axisSms = 'INR 1,200.00 credited to Axis Bank A/c no. XX3456 on 19-10-2026 through UPI:729381729387.';
  const axisParsed = parseBankSmsAlert(axisSms, 'AXISBK');
  console.log('✓ Axis Parsed:', axisParsed);
  if (!axisParsed || axisParsed.amountPaise !== 120000 || axisParsed.utr !== '729381729387' || axisParsed.bank !== 'AXIS') {
    throw new Error('Axis Parser test failed');
  }

  // Test 5: Rejection of Debit Alerts
  const debitSms = 'Dear Customer, INR 500.00 debited from A/c **1234 on 19-OCT-26 via UPI Ref 112233445566.';
  const debitParsed = parseBankSmsAlert(debitSms, 'VK-HDFCBK');
  console.log('✓ Debit Discard Check:', debitParsed === null ? 'Correctly Ignored' : 'FAILED');
  if (debitParsed !== null) {
    throw new Error('Debit alert should not be parsed as credit!');
  }

  // Test 6: HMAC-SHA256 Signing and Verification
  const sharedSecret = 'openbill_system_secret_2026';
  const timestamp = Date.now();
  const payload = {
    amountPaise: hdfcParsed.amountPaise,
    utr: hdfcParsed.utr,
    sender: 'VK-HDFCBK',
    timestamp,
  };

  const { signature } = signPayload(payload, sharedSecret, timestamp);
  console.log('\n✓ Generated HMAC-SHA256 Signature:', signature);

  const isValid = verifySignature(payload, signature, sharedSecret, timestamp);
  console.log('✓ Signature Verification Result:', isValid);
  if (!isValid) {
    throw new Error('HMAC signature verification failed');
  }

  // Test 7: Tampered payload rejection
  const tamperedPayload = { ...payload, amountPaise: 999999 };
  const isTamperedValid = verifySignature(tamperedPayload, signature, sharedSecret, timestamp);
  console.log('✓ Tampered Payload Rejected:', !isTamperedValid);
  if (isTamperedValid) {
    throw new Error('Tampered payload should have failed verification!');
  }

  console.log('\n🎉 All Bank SMS Observer tests passed with 100% precision!');
}

runBankSmsTests();
