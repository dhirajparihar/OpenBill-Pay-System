export interface UpiUriParams {
  /** Merchant UPI Virtual Payment Address (e.g., 'merchant@icici' or 'store@upi') */
  upiVpa: string;
  /** Legal or business display name of merchant */
  merchantName: string;
  /** Exact integer amount in minor units (paise) */
  allocatedAmountPaise: number;
  /** Transaction reference or note (e.g., 'Bill-Ref-202610') */
  transactionNote: string;
  /** Unique session ID or transaction reference for NPCI 'tr' param */
  sessionId?: string;
  /** Merchant Category Code (optional, defaults to 0000 or bill payment) */
  mcc?: string;
}

export interface UpiDeepLinks {
  /** Universal standard NPCI UPI URI */
  generic: string;
  /** Google Pay / Tez deep link */
  googlePay: string;
  /** PhonePe deep link */
  phonePe: string;
  /** Paytm deep link */
  paytm: string;
  /** BHIM deep link */
  bhim: string;
  /** CRED deep link */
  cred: string;
  /** Formatted rupee decimal string e.g. "1500.02" */
  amountFormatted: string;
  /** Human readable INR display string e.g. "₹1,500.02" */
  displayCurrency: string;
}

/**
 * Converts integer paise into exact two-decimal Rupee string.
 * Strict integer arithmetic avoids floating-point inaccuracies.
 * E.g., 150002 paise => "1500.02"
 */
export function paiseToRupeesDecimal(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(absPaise / 100);
  const remainingPaise = absPaise % 100;
  const paddedPaise = remainingPaise.toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${rupees}.${paddedPaise}`;
}

/**
 * Formats paise into Indian Rupee localized format (₹ 1,500.02)
 */
export function formatPaiseToInr(paise: number): string {
  const decimalStr = paiseToRupeesDecimal(paise);
  const [rupees, fractions] = decimalStr.split('.');
  const formattedRupees = new Intl.NumberFormat('en-IN').format(Number(rupees));
  return `₹${formattedRupees}.${fractions}`;
}

/**
 * Compiles a certified NPCI UPI Deep Link URI and mobile-specific intent variants.
 * 
 * Complies with NPCI UPI Linking Specifications:
 * - pa: Payee VPA
 * - pn: Payee Name
 * - am: Exact Amount in INR with 2 decimals
 * - cu: Currency (strictly INR)
 * - tn: Transaction note
 * - tr: Transaction reference ID (Session ID)
 */
export function compileUpiDeepLinks(params: UpiUriParams): UpiDeepLinks {
  const {
    upiVpa,
    merchantName,
    allocatedAmountPaise,
    transactionNote,
    sessionId,
    mcc
  } = params;

  if (!upiVpa || !upiVpa.includes('@')) {
    throw new Error(`Invalid UPI VPA: ${upiVpa}`);
  }

  const amountDecimal = paiseToRupeesDecimal(allocatedAmountPaise);

  const queryParams = new URLSearchParams();
  queryParams.set('pa', upiVpa.trim());
  queryParams.set('pn', merchantName.trim());
  queryParams.set('am', amountDecimal);
  queryParams.set('cu', 'INR');
  queryParams.set('tn', transactionNote.trim());
  
  if (sessionId) {
    queryParams.set('tr', sessionId.trim());
  }

  if (mcc) {
    queryParams.set('mc', mcc.trim());
  }

  const queryString = queryParams.toString();
  const genericUri = `upi://pay?${queryString}`;

  return {
    generic: genericUri,
    googlePay: `tez://upi/pay?${queryString}`,
    phonePe: `phonepe://pay?${queryString}`,
    paytm: `paytmmp://pay?${queryString}`,
    bhim: `bhim://pay?${queryString}`,
    cred: `cred://pay?${queryString}`,
    amountFormatted: amountDecimal,
    displayCurrency: formatPaiseToInr(allocatedAmountPaise),
  };
}
