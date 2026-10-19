import Database from 'better-sqlite3';
import { allocatePaymentSession } from './slot-allocator.js';

// Setup an in-memory SQLite database instance with WAL schema for isolated test verification
function setupTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
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
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(merchant_id, consumer_reference_id)
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

    CREATE TABLE payment_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      fractional_offset INTEGER NOT NULL,
      allocated_amount_paise INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('AWAITING_ALERT', 'SUCCESS', 'EXPIRED')) DEFAULT 'AWAITING_ALERT',
      expires_at INTEGER NOT NULL,
      bank_reference_utr TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Seed Merchant, Consumer, Bills
  sqlite.prepare(`
    INSERT INTO merchants (id, business_name, upi_vpa, webhook_secret)
    VALUES ('m_test', 'Acme Broadband', 'acme@upi', 'secret_xyz')
  `).run();

  sqlite.prepare(`
    INSERT INTO consumers (id, merchant_id, name, whatsapp_number, consumer_reference_id)
    VALUES ('c_test', 'm_test', 'Rahul Sharma', '919876543210', 'CUST-1001')
  `).run();

  // Create two bills with same base amount (₹500.00 = 50000 paise) to test offset collision avoidance across ledger
  sqlite.prepare(`
    INSERT INTO bills (id, consumer_id, billing_cycle, base_amount_paise, status, due_date)
    VALUES ('bill_001', 'c_test', '2026-10', 50000, 'PENDING', unixepoch() + 86400)
  `).run();

  sqlite.prepare(`
    INSERT INTO bills (id, consumer_id, billing_cycle, base_amount_paise, status, due_date)
    VALUES ('bill_002', 'c_test', '2026-11', 50000, 'PENDING', unixepoch() + 86400 * 30)
  `).run();

  return sqlite;
}

async function runTests() {
  console.log('🧪 Starting Fractional Slot Allocation Test Suite...');
  const testDb = setupTestDb();

  // Test 1: First allocation gets offset 0
  const session1 = await allocatePaymentSession('bill_001', { sqlite: testDb });
  console.log('✓ Session 1 Allocated:', {
    offset: session1.fractionalOffset,
    allocatedAmountPaise: session1.allocatedAmountPaise,
    expiresInSeconds: session1.expiresAtTimestamp - Math.floor(Date.now() / 1000)
  });
  if (session1.fractionalOffset !== 0 || session1.allocatedAmountPaise !== 50000) {
    throw new Error('Test 1 failed: Expected offset 0 and amount 50000');
  }

  // Test 2: Second concurrent allocation for same base amount gets offset 1
  const session2 = await allocatePaymentSession('bill_002', { sqlite: testDb });
  console.log('✓ Session 2 Allocated:', {
    offset: session2.fractionalOffset,
    allocatedAmountPaise: session2.allocatedAmountPaise
  });
  if (session2.fractionalOffset !== 1 || session2.allocatedAmountPaise !== 50001) {
    throw new Error('Test 2 failed: Expected offset 1 and amount 50001');
  }

  // Test 3: Third concurrent allocation gets offset 2
  const session3 = await allocatePaymentSession('bill_001', { sqlite: testDb });
  console.log('✓ Session 3 Allocated:', {
    offset: session3.fractionalOffset,
    allocatedAmountPaise: session3.allocatedAmountPaise
  });
  if (session3.fractionalOffset !== 2 || session3.allocatedAmountPaise !== 50002) {
    throw new Error('Test 3 failed: Expected offset 2 and amount 50002');
  }

  // Test 4: Expire Session 1 and verify offset 0 is reclaimed
  testDb.prepare(`UPDATE payment_sessions SET status = 'EXPIRED' WHERE id = ?`).run(session1.id);
  const session4 = await allocatePaymentSession('bill_001', { sqlite: testDb });
  console.log('✓ Session 4 Reclaimed Lowest Offset:', {
    offset: session4.fractionalOffset,
    allocatedAmountPaise: session4.allocatedAmountPaise
  });
  if (session4.fractionalOffset !== 0 || session4.allocatedAmountPaise !== 50000) {
    throw new Error('Test 4 failed: Expected reclaimed offset 0');
  }

  // Test 5: Parallel race condition testing (10 concurrent requests at the exact same millisecond)
  console.log('🚀 Running 10 concurrent requests via Promise.all...');
  const concurrentResults = await Promise.all(
    Array.from({ length: 10 }).map(() => allocatePaymentSession('bill_001', { sqlite: testDb }))
  );

  const offsets = concurrentResults.map(r => r.fractionalOffset);
  console.log('✓ Concurrent Offsets allocated:', offsets);
  const uniqueOffsets = new Set(offsets);
  if (uniqueOffsets.size !== offsets.length) {
    throw new Error('Test 5 failed: Collision detected in concurrent allocations!');
  }

  console.log('🎉 All Fractional Slot Allocation tests passed cleanly!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
