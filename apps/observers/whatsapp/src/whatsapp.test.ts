process.env.NODE_ENV = 'test';
import Database from 'better-sqlite3';
import { formatBillNotification, normalizeWhatsappPhone, formatPaise } from './formatter/bill-notification-formatter.js';
import { BillReminderScheduler } from './scheduler/bill-scheduler.js';
import { BaileysService } from './socket/baileys-service.js';

function setupMockDatabase() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE merchants (
      id TEXT PRIMARY KEY NOT NULL,
      business_name TEXT NOT NULL,
      upi_vpa TEXT NOT NULL,
      webhook_secret TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE consumers (
      id TEXT PRIMARY KEY NOT NULL,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      consumer_reference_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE bills (
      id TEXT PRIMARY KEY NOT NULL,
      consumer_id TEXT NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
      billing_cycle TEXT NOT NULL,
      base_amount_paise INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'PAID', 'OVERDUE')) DEFAULT 'PENDING',
      due_date INTEGER NOT NULL,
      paid_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  db.prepare(`
    INSERT INTO merchants VALUES ('m_fiber', 'Openbill Broadband', 'broadband@upi', 'sec_1', unixepoch(), unixepoch())
  `).run();

  db.prepare(`
    INSERT INTO consumers VALUES ('c_priya', 'm_fiber', 'Priya Sharma', '9876543210', 'ACC-9921', unixepoch(), unixepoch())
  `).run();

  // Due tomorrow (within 3-day threshold)
  db.prepare(`
    INSERT INTO bills VALUES ('bill_wa_01', 'c_priya', 'October 2026', 79900, 'PENDING', unixepoch() + 86400, NULL, unixepoch(), unixepoch())
  `).run();

  // Due next month (outside 3-day threshold)
  db.prepare(`
    INSERT INTO bills VALUES ('bill_wa_02', 'c_priya', 'November 2026', 79900, 'PENDING', unixepoch() + 86400 * 30, NULL, unixepoch(), unixepoch())
  `).run();

  return db;
}

async function runWhatsappObserverTests() {
  console.log('🧪 Starting WhatsApp Observer Test Suite...\n');

  // Test 1: Phone normalization
  const norm1 = normalizeWhatsappPhone('9876543210');
  const norm2 = normalizeWhatsappPhone('+91 98765-43210');
  console.log('✓ Normalized Phones:', { norm1, norm2 });
  if (norm1 !== '919876543210' || norm2 !== '919876543210') {
    throw new Error('Phone normalization failed');
  }

  // Test 2: Notification text formatting
  const formatted = formatBillNotification({
    billId: 'bill_wa_01',
    consumerName: 'Priya Sharma',
    consumerReferenceId: 'ACC-9921',
    whatsappNumber: '919876543210',
    merchantName: 'Openbill Broadband',
    billingCycle: 'October 2026',
    baseAmountPaise: 79900, // ₹799.00
    dueDate: Math.floor(Date.now() / 1000) + 86400,
    consumerPortalBaseUrl: 'http://localhost:3000',
  });

  console.log('✓ Formatted Notification Output:\n---\n' + formatted + '\n---');
  if (!formatted.includes('Openbill Broadband') || !formatted.includes('₹799.00') || !formatted.includes('/pay/bill_wa_01')) {
    throw new Error('Notification formatting missing required fields');
  }

  // Test 3: Scheduler scan with mock Baileys
  const mockDb = setupMockDatabase();
  const sentMessages: Array<{ phone: string; text: string }> = [];

  const mockBaileys = {
    sendTextMessage: async (phone: string, text: string) => {
      sentMessages.push({ phone, text });
      return true;
    },
    isConnected: () => true,
    getQr: () => null,
  } as unknown as BaileysService;

  const scheduler = new BillReminderScheduler(mockBaileys, {
    sqlite: mockDb,
    consumerPortalUrl: 'http://localhost:3000',
    dueWindowDays: 3,
  });

  // First Scan: should find 1 bill due soon ('bill_wa_01') and dispatch
  console.log('\nRunning First Scheduler Scan...');
  const result1 = await scheduler.triggerScan();
  console.log('✓ First Scan Result:', result1);
  if (result1.dispatchedCount !== 1 || sentMessages.length !== 1) {
    throw new Error('Expected 1 dispatched message in first scan');
  }

  // Second Scan immediately after: should skip 'bill_wa_01' because already notified today
  console.log('\nRunning Second Scheduler Scan (Idempotency Check)...');
  const result2 = await scheduler.triggerScan();
  console.log('✓ Second Scan Result:', result2);
  if (result2.dispatchedCount !== 0 || result2.skippedCount !== 1) {
    throw new Error('Expected 0 dispatched and 1 skipped due to 24h throttling');
  }

  console.log('\n🎉 All WhatsApp Observer and Scheduler tests passed cleanly!');
  process.exit(0);
}

runWhatsappObserverTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
