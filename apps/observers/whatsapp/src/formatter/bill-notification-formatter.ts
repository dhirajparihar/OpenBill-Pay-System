export interface BillNotificationContext {
  billId: string;
  consumerName: string;
  consumerReferenceId: string;
  whatsappNumber: string;
  merchantName: string;
  billingCycle: string;
  baseAmountPaise: number;
  dueDate: Date | number; // Date object or Unix timestamp in seconds
  consumerPortalBaseUrl: string;
}

/**
 * Formats minor paise integer into localized Indian Rupee currency string
 */
export function formatPaise(paise: number): string {
  const absPaise = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(absPaise / 100);
  const remainingPaise = absPaise % 100;
  const formattedRupees = new Intl.NumberFormat('en-IN').format(rupees);
  return `₹${formattedRupees}.${remainingPaise.toString().padStart(2, '0')}`;
}

/**
 * Formats a timestamp into human-readable date (e.g. '25 Oct 2026')
 */
export function formatDueDate(dateInput: Date | number): string {
  const date = typeof dateInput === 'number' 
    ? new Date(dateInput * 1000) 
    : dateInput;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Normalizes phone number into E.164 without '+'
 * If 10 digits provided, defaults to country code 91 (India)
 */
export function normalizeWhatsappPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

/**
 * Compiles a structured, professional WhatsApp text notification for pending bills
 */
export function formatBillNotification(ctx: BillNotificationContext): string {
  const amountStr = formatPaise(ctx.baseAmountPaise);
  const dueDateStr = formatDueDate(ctx.dueDate);
  const paymentUrl = `${ctx.consumerPortalBaseUrl.replace(/\/$/, '')}/pay/${ctx.billId}`;

  return [
    `🧾 *${ctx.merchantName} — Bill Reminder*`,
    ``,
    `Dear *${ctx.consumerName}*,`,
    ``,
    `Your bill for *${ctx.billingCycle}* is currently pending payment.`,
    ``,
    `📌 *Bill Details:*`,
    `• Account / Ref: *${ctx.consumerReferenceId}*`,
    `• Billing Cycle: *${ctx.billingCycle}*`,
    `• Due Date: *${dueDateStr}*`,
    `• Amount Due: *${amountStr}*`,
    ``,
    `⚡ *Pay Now via UPI (GPay / PhonePe / Paytm / BHIM):*`,
    `${paymentUrl}`,
    ``,
    `_Instant automatic receipt and verification will be generated upon completion._`,
    `_Thank you!_`,
  ].join('\n');
}
