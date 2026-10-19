import { randomUUID } from 'node:crypto';
import { sqlite } from '@openbill/database';

export interface ReconciliationInput {
  amountPaise: number;
  utr: string;
  sender?: string;
  rawMessage: string;
}

export interface ReconciliationOutcome {
  success: boolean;
  matchedSessionId?: string;
  billId?: string;
  allocatedAmountPaise?: number;
  isDuplicate?: boolean;
  message?: string;
}

/**
 * Reconciles an incoming bank credit alert with active payment sessions.
 * 
 * Logic:
 * 1. Begins SQLite IMMEDIATE transaction.
 * 2. Checks UTR idempotency to prevent double-crediting.
 * 3. Finds active payment_session matching allocated_amount_paise where status = 'AWAITING_ALERT'.
 * 4. Updates session status to 'SUCCESS' and attaches the bank UTR.
 * 5. Updates associated bill status to 'PAID'.
 * 6. Logs event to bank_sms_alerts audit ledger.
 */
export function reconcileCreditAlert(input: ReconciliationInput): ReconciliationOutcome {
  const { amountPaise, utr, sender = 'UNKNOWN', rawMessage } = input;

  const runTx = sqlite.transaction(() => {
    // 1. Idempotency Check: Verify if UTR was already recorded
    const existingAlert = sqlite.prepare(`
      SELECT id, matched_session_id FROM bank_sms_alerts WHERE extracted_utr = ?
    `).get(utr) as { id: string; matched_session_id: string | null } | undefined;

    if (existingAlert) {
      return {
        success: true,
        matchedSessionId: existingAlert.matched_session_id || undefined,
        isDuplicate: true,
        message: `Alert with UTR ${utr} was already reconciled.`,
      };
    }

    // 2. Query active session matching exact allocated amount
    // Ordered by expires_at ASC to match earliest active session in rare edge case
    const activeSession = sqlite.prepare(`
      SELECT id, bill_id, allocated_amount_paise, expires_at 
      FROM payment_sessions
      WHERE allocated_amount_paise = ?
        AND status = 'AWAITING_ALERT'
        AND expires_at > unixepoch()
      ORDER BY expires_at ASC
      LIMIT 1
    `).get(amountPaise) as {
      id: string;
      bill_id: string;
      allocated_amount_paise: number;
      expires_at: number;
    } | undefined;

    const alertId = randomUUID();

    if (!activeSession) {
      // Record unassigned credit for merchant audit
      sqlite.prepare(`
        INSERT INTO bank_sms_alerts (
          id, sender_id, raw_message, extracted_amount_paise, extracted_utr, matched_session_id, is_processed, received_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 0, unixepoch())
      `).run(alertId, sender, rawMessage, amountPaise, utr);

      return {
        success: false,
        message: `No active session awaiting alert for amount ${amountPaise} paise. Logged for manual review.`,
      };
    }

    // 3. Mark Payment Session as SUCCESS
    sqlite.prepare(`
      UPDATE payment_sessions 
      SET status = 'SUCCESS',
          bank_reference_utr = ?,
          updated_at = unixepoch()
      WHERE id = ?
    `).run(utr, activeSession.id);

    // 4. Mark Bill as PAID
    sqlite.prepare(`
      UPDATE bills 
      SET status = 'PAID',
          paid_at = unixepoch(),
          updated_at = unixepoch()
      WHERE id = ?
    `).run(activeSession.bill_id);

    // 5. Query Merchant Webhook Configuration
    const merchant = sqlite.prepare(`
      SELECT 
        m.id as merchantId,
        m.webhook_secret as webhookSecret,
        m.webhook_url as webhookUrl
      FROM payment_sessions ps
      JOIN bills b ON ps.bill_id = b.id
      JOIN consumers c ON b.consumer_id = c.id
      JOIN merchants m ON c.merchant_id = m.id
      WHERE ps.id = ?
    `).get(activeSession.id) as {
      merchantId: string;
      webhookSecret: string;
      webhookUrl: string | null;
    } | undefined;

    // 6. Insert into audit table
    sqlite.prepare(`
      INSERT INTO bank_sms_alerts (
        id, sender_id, raw_message, extracted_amount_paise, extracted_utr, matched_session_id, is_processed, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, unixepoch())
    `).run(alertId, sender, rawMessage, amountPaise, utr, activeSession.id);

    const webhookPayload = {
      event: 'SUCCESS' as const,
      orderId: activeSession.bill_id,
      amount: activeSession.allocated_amount_paise,
      utr,
      paymentId: activeSession.id,
      timestamp: Date.now(),
    };

    return {
      success: true,
      matchedSessionId: activeSession.id,
      billId: activeSession.bill_id,
      allocatedAmountPaise: activeSession.allocated_amount_paise,
      message: `Reconciled successfully with bill ${activeSession.bill_id}`,
      webhookPayload,
      merchantSecret: merchant?.webhookSecret,
      merchantWebhookUrl: merchant?.webhookUrl || undefined,
    };
  });

  const outcome = runTx.immediate();

  // If merchant has configured an authoritative webhook URL, trigger dispatch
  if (outcome.success && outcome.merchantWebhookUrl && outcome.merchantSecret && outcome.webhookPayload) {
    import('../webhook/merchant-webhook-notifier.js').then(({ dispatchMerchantWebhook }) => {
      dispatchMerchantWebhook(
        outcome.merchantWebhookUrl!,
        outcome.merchantSecret!,
        outcome.webhookPayload!
      ).catch((err) => {
        console.error('[Reconciler] Error delivering merchant webhook:', err);
      });
    });
  }

  return outcome;
}
