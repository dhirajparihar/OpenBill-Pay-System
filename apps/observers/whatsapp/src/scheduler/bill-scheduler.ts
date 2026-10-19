import { sqlite } from '@openbill/database';
import type Database from 'better-sqlite3';
import { BaileysService } from '../socket/baileys-service.js';
import { formatBillNotification } from '../formatter/bill-notification-formatter.js';

export interface SchedulerConfig {
  /** Days threshold ahead of due_date to trigger alerts (default: 3 days) */
  dueWindowDays?: number;
  /** Morning schedule hour in 24h format (default: 9 for 09:00 AM) */
  morningHour?: number;
  /** Morning schedule minute (default: 0) */
  morningMinute?: number;
  /** Check interval in milliseconds when polling (default: 60,000ms = 1 min) */
  pollIntervalMs?: number;
  /** Consumer portal base URL for payment links */
  consumerPortalUrl?: string;
  /** Optional custom SQLite connection handle */
  sqlite?: Database.Database;
}

export interface PendingBillAlertRow {
  billId: string;
  consumerName: string;
  consumerReferenceId: string;
  whatsappNumber: string;
  merchantName: string;
  billingCycle: string;
  baseAmountPaise: number;
  dueDate: number; // Unix seconds
}

export interface ScanResult {
  scannedCount: number;
  dispatchedCount: number;
  skippedCount: number;
  failedCount: number;
}

export class BillReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private db: Database.Database;
  private portalUrl: string;
  private dueWindowDays: number;
  private morningHour: number;
  private morningMinute: number;
  private pollIntervalMs: number;
  private lastExecutedDay: string | null = null;

  constructor(
    private baileys: BaileysService,
    config: SchedulerConfig = {}
  ) {
    this.db = config.sqlite || sqlite;
    this.portalUrl = config.consumerPortalUrl || process.env.CONSUMER_PORTAL_URL || 'http://localhost:3000';
    this.dueWindowDays = config.dueWindowDays ?? 3;
    this.morningHour = config.morningHour ?? 9; // 09:00 AM
    this.morningMinute = config.morningMinute ?? 0;
    this.pollIntervalMs = config.pollIntervalMs ?? 60000;

    this.ensureLogTable();
  }

  /**
   * Provisions notification audit table in SQLite to prevent spamming customers
   */
  private ensureLogTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_notification_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id TEXT NOT NULL,
        whatsapp_number TEXT NOT NULL,
        sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
        date_stamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wa_logs_bill_date 
      ON whatsapp_notification_logs(bill_id, date_stamp);
    `);
  }

  /**
   * Starts the internal cron-like scheduler
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[Bill Scheduler] Started. Configured for morning alerts at ${String(this.morningHour).padStart(2, '0')}:${String(this.morningMinute).padStart(2, '0')} daily.`);

    this.timer = setInterval(() => {
      this.checkScheduledTrigger();
    }, this.pollIntervalMs);

    // Initial check immediately on boot
    this.checkScheduledTrigger();
  }

  /**
   * Verifies if current system time matches the morning schedule window and has not run yet today
   */
  private checkScheduledTrigger(): void {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const todayStamp = now.toISOString().split('T')[0];

    // If it's at or after morningHour:morningMinute and hasn't run today
    if (currentHour === this.morningHour && currentMinute >= this.morningMinute && this.lastExecutedDay !== todayStamp) {
      console.log(`[Bill Scheduler] ⏰ Morning schedule triggered for date ${todayStamp}...`);
      this.lastExecutedDay = todayStamp;
      this.triggerScan().catch(err => {
        console.error('[Bill Scheduler] Error during morning bill scan:', err);
      });
    }
  }

  /**
   * Scans SQLite for PENDING bills nearing due_date and dispatches structured WhatsApp reminders
   */
  async triggerScan(): Promise<ScanResult> {
    const todayStamp = new Date().toISOString().split('T')[0];
    const thresholdSeconds = this.dueWindowDays * 86400;

    console.log(`[Bill Scheduler] Scanning SQLite for bills nearing due date (within ${this.dueWindowDays} days)...`);

    // Query PENDING bills nearing due date
    const query = `
      SELECT 
        b.id as billId,
        b.billing_cycle as billingCycle,
        b.base_amount_paise as baseAmountPaise,
        b.due_date as dueDate,
        c.name as consumerName,
        c.whatsapp_number as whatsappNumber,
        c.consumer_reference_id as consumerReferenceId,
        m.business_name as merchantName
      FROM bills b
      JOIN consumers c ON b.consumer_id = c.id
      JOIN merchants m ON c.merchant_id = m.id
      WHERE b.status = 'PENDING'
        AND b.due_date <= (unixepoch() + ?)
      ORDER BY b.due_date ASC
    `;

    const pendingBills = this.db.prepare(query).all(thresholdSeconds) as PendingBillAlertRow[];

    const result: ScanResult = {
      scannedCount: pendingBills.length,
      dispatchedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    console.log(`[Bill Scheduler] Found ${pendingBills.length} pending bill(s) matching criteria.`);

    for (const bill of pendingBills) {
      // 1. Check if already notified today
      const alreadyNotified = this.db.prepare(`
        SELECT id FROM whatsapp_notification_logs 
        WHERE bill_id = ? AND date_stamp = ?
      `).get(bill.billId, todayStamp);

      if (alreadyNotified) {
        result.skippedCount++;
        continue;
      }

      // 2. Format structured message
      const text = formatBillNotification({
        billId: bill.billId,
        consumerName: bill.consumerName,
        consumerReferenceId: bill.consumerReferenceId,
        whatsappNumber: bill.whatsappNumber,
        merchantName: bill.merchantName,
        billingCycle: bill.billingCycle,
        baseAmountPaise: bill.baseAmountPaise,
        dueDate: bill.dueDate,
        consumerPortalBaseUrl: this.portalUrl,
      });

      // 3. Dispatch via Baileys socket
      const sent = await this.baileys.sendTextMessage(bill.whatsappNumber, text);

      if (sent) {
        // Record in log table
        this.db.prepare(`
          INSERT INTO whatsapp_notification_logs (bill_id, whatsapp_number, date_stamp)
          VALUES (?, ?, ?)
        `).run(bill.billId, bill.whatsappNumber, todayStamp);

        result.dispatchedCount++;
      } else {
        result.failedCount++;
      }
    }

    console.log(`[Bill Scheduler] Scan complete: ${result.dispatchedCount} dispatched, ${result.skippedCount} skipped (already sent today), ${result.failedCount} failed.`);
    return result;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }
}
