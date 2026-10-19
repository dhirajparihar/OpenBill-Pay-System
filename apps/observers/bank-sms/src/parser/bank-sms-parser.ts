import { normalizeCurrencyToPaise } from '@openbill/common';

export interface ParsedBankAlert {
  bank: 'HDFC' | 'ICICI' | 'SBI' | 'AXIS' | 'GENERIC';
  accountLast4?: string;
  amountPaise: number;
  amountDecimal: string;
  utr: string; // 12-digit UPI Transaction Reference Number (RRN)
  sender?: string;
  rawText: string;
  confidence: 'HIGH' | 'MEDIUM';
}

/**
 * Normalizes decimal amount string e.g. "1,500.02" -> "1500.02"
 */
function cleanDecimalString(amountStr: string): string {
  const paise = normalizeCurrencyToPaise(amountStr);
  const rupees = Math.floor(paise / 100);
  const remPaise = (paise % 100).toString().padStart(2, '0');
  return `${rupees}.${remPaise}`;
}

/**
 * 1. HDFC Bank SMS Parser
 * Patterns:
 * - "Dear Customer, INR 1,500.02 credited to A/c **1234 on 19-OCT-26 by UPI-BHIM-user@upi-429381729384. Bal: INR 25,000.00."
 * - "Your A/C ending in 1234 has been credited with INR 1500.02 on 19/10/26 via UPI Ref 429381729384."
 * - "Money Transfer: INR 500.05 credited to HDFC Bank A/c xx1234 on 19-OCT-26. Info: UPI/429381729384/P2A."
 */
export function parseHdfc(text: string, sender?: string): ParsedBankAlert | null {
  // Discard debits
  if (/\b(?:debited|withdrawn|sent|spent)\b/i.test(text) && !/\bcredited\b/i.test(text)) {
    return null;
  }

  const amountMatch = text.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]{0,2})\s*(?:credited|has been credited)/i)
    || text.match(/(?:credited\s+(?:with|by|to)\s+(?:INR|Rs\.?|₹)?\s*([0-9,]+\.?[0-9]{0,2}))/i);

  const utrMatch = text.match(/UPI[-/](?:[a-zA-Z0-9._-]+@\w+[-/])?([0-9]{12})\b/)
    || text.match(/(?:UPI\s*(?:Ref|RRN|Txn)?(?:\s*no\.?)?[:\s/]*)([0-9]{12})\b/i);

  const accMatch = text.match(/A\/c\s*(?:ending\s+in\s+)?(?:\*\*|xx|no\.?\s*)?([0-9]{4})\b/i);

  if (amountMatch && utrMatch) {
    const rawAmt = amountMatch[1];
    return {
      bank: 'HDFC',
      accountLast4: accMatch ? accMatch[1] : undefined,
      amountPaise: normalizeCurrencyToPaise(rawAmt),
      amountDecimal: cleanDecimalString(rawAmt),
      utr: utrMatch[1],
      sender,
      rawText: text,
      confidence: 'HIGH',
    };
  }

  return null;
}

/**
 * 2. ICICI Bank SMS Parser
 * Patterns:
 * - "ICICI Bank Acct XX1234 credited with INR 1,500.02 on 19-Oct-26. UPI:429381729384-Payee Name."
 * - "Dear Customer, your Account XX1234 has been credited with INR 1500.02 on 19-OCT-26 by UPI Ref no 429381729384."
 */
export function parseIcici(text: string, sender?: string): ParsedBankAlert | null {
  if (/\bdebited\b/i.test(text) && !/\bcredited\b/i.test(text)) {
    return null;
  }

  const amountMatch = text.match(/credited\s+with\s+(?:INR|Rs\.?|₹)?\s*([0-9,]+\.?[0-9]{0,2})/i)
    || text.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]{0,2})\s+credited/i);

  const utrMatch = text.match(/UPI[:\s/-]*([0-9]{12})\b/i)
    || text.match(/UPI\s+Ref\s+(?:no\.?)?\s*([0-9]{12})\b/i);

  const accMatch = text.match(/(?:Acct|Account|A\/c)\s+(?:XX|xx)?([0-9]{4})\b/i);

  if (amountMatch && utrMatch) {
    const rawAmt = amountMatch[1];
    return {
      bank: 'ICICI',
      accountLast4: accMatch ? accMatch[1] : undefined,
      amountPaise: normalizeCurrencyToPaise(rawAmt),
      amountDecimal: cleanDecimalString(rawAmt),
      utr: utrMatch[1],
      sender,
      rawText: text,
      confidence: 'HIGH',
    };
  }

  return null;
}

/**
 * 3. SBI (State Bank of India) SMS Parser
 * Patterns:
 * - "Your A/C 1234 credited by INR 1500.02 on 19Oct26 by UPI/ref no 429381729384."
 * - "Dear SBI User, A/C 1234 Credited by Rs.1500.02 on 19/10/2026 transfer from UPI/429381729384."
 */
export function parseSbi(text: string, sender?: string): ParsedBankAlert | null {
  if (/\bdebited\b/i.test(text) && !/\bcredited\b/i.test(text)) {
    return null;
  }

  const amountMatch = text.match(/credited\s+by\s+(?:INR|Rs\.?|₹)?\s*([0-9,]+\.?[0-9]{0,2})/i)
    || text.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]{0,2})\s+credited/i);

  const utrMatch = text.match(/UPI\/(?:ref\s*no\s*)?([0-9]{12})\b/i)
    || text.match(/UPI[:\s/-]*([0-9]{12})\b/i);

  const accMatch = text.match(/A\/C\s+([0-9]{4})\b/i);

  if (amountMatch && utrMatch) {
    const rawAmt = amountMatch[1];
    return {
      bank: 'SBI',
      accountLast4: accMatch ? accMatch[1] : undefined,
      amountPaise: normalizeCurrencyToPaise(rawAmt),
      amountDecimal: cleanDecimalString(rawAmt),
      utr: utrMatch[1],
      sender,
      rawText: text,
      confidence: 'HIGH',
    };
  }

  return null;
}

/**
 * 4. Axis Bank SMS Parser
 * Patterns:
 * - "INR 1,500.02 credited to Axis Bank A/c no. XX1234 on 19-10-2026 through UPI:429381729384."
 * - "Your A/c no. XX1234 is credited with INR 1500.02 on 19-10-26 via UPI Ref 429381729384."
 */
export function parseAxis(text: string, sender?: string): ParsedBankAlert | null {
  if (/\bdebited\b/i.test(text) && !/\bcredited\b/i.test(text)) {
    return null;
  }

  const amountMatch = text.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]{0,2})\s+credited/i)
    || text.match(/credited\s+with\s+(?:INR|Rs\.?|₹)?\s*([0-9,]+\.?[0-9]{0,2})/i);

  const utrMatch = text.match(/UPI[:\s/-]*([0-9]{12})\b/i)
    || text.match(/UPI\s+Ref\s*([0-9]{12})\b/i);

  const accMatch = text.match(/A\/c\s*(?:no\.?)?\s*(?:XX|xx)?([0-9]{4})\b/i);

  if (amountMatch && utrMatch) {
    const rawAmt = amountMatch[1];
    return {
      bank: 'AXIS',
      accountLast4: accMatch ? accMatch[1] : undefined,
      amountPaise: normalizeCurrencyToPaise(rawAmt),
      amountDecimal: cleanDecimalString(rawAmt),
      utr: utrMatch[1],
      sender,
      rawText: text,
      confidence: 'HIGH',
    };
  }

  return null;
}

/**
 * 5. Universal Fallback Parser
 * Matches any standardized UPI credit alert containing amount + 12-digit UTR/RRN
 */
export function parseGenericCreditAlert(text: string, sender?: string): ParsedBankAlert | null {
  // Must explicitly be a credit event
  if (!/\b(credited|received|deposited)\b/i.test(text) || /\b(debited|spent|withdrawn)\b/i.test(text)) {
    return null;
  }

  const amountMatch = text.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]{0,2})/i)
    || text.match(/([0-9,]+\.?[0-9]{0,2})\s*(?:INR|Rs\.?|₹)/i);

  const utrMatch = text.match(/(?:\bUPI\b[^\d]{1,20}|\b(?:Ref|UTR|RRN|Txn|Transaction)\b[^\d]{0,10})([0-9]{12})\b/i);

  if (amountMatch && utrMatch) {
    const rawAmt = amountMatch[1];
    return {
      bank: 'GENERIC',
      amountPaise: normalizeCurrencyToPaise(rawAmt),
      amountDecimal: cleanDecimalString(rawAmt),
      utr: utrMatch[1],
      sender,
      rawText: text,
      confidence: 'MEDIUM',
    };
  }

  return null;
}

/**
 * Master parser: Routes through bank-specific parsers based on sender or text content,
 * falling back to generic regex parser.
 */
export function parseBankSmsAlert(text: string, sender?: string): ParsedBankAlert | null {
  const normSender = (sender || '').toUpperCase();
  const normText = text.toUpperCase();

  if (normSender.includes('HDFC') || normText.includes('HDFC')) {
    const res = parseHdfc(text, sender);
    if (res) return res;
  }

  if (normSender.includes('ICICI') || normText.includes('ICICI')) {
    const res = parseIcici(text, sender);
    if (res) return res;
  }

  if (normSender.includes('SBI') || normText.includes('SBI')) {
    const res = parseSbi(text, sender);
    if (res) return res;
  }

  if (normSender.includes('AXIS') || normText.includes('AXIS')) {
    const res = parseAxis(text, sender);
    if (res) return res;
  }

  // Try all bank parsers in succession
  return parseHdfc(text, sender)
    || parseIcici(text, sender)
    || parseSbi(text, sender)
    || parseAxis(text, sender)
    || parseGenericCreditAlert(text, sender);
}
