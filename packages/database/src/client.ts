import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'node:path';
import fs from 'node:fs';

export type DatabaseInstance = BetterSQLite3Database<typeof schema>;
export type RawSqliteDatabase = SqliteDatabase;

const DEFAULT_DB_PATH = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'openbill.db');

export function createDatabaseClient(dbPath: string = DEFAULT_DB_PATH): {
  sqlite: RawSqliteDatabase;
  db: DatabaseInstance;
} {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Open SQLite handle
  const sqlite = new Database(dbPath);

  // Apply critical performance & concurrency Pragmas
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');

  // Initialize tables if they do not exist
  initializeSchema(sqlite);

  // Wrap with Drizzle ORM
  const db = drizzle(sqlite, { schema });

  return { sqlite, db };
}

function initializeSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY NOT NULL,
      business_name TEXT NOT NULL,
      upi_vpa TEXT NOT NULL,
      webhook_secret TEXT NOT NULL,
      webhook_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS consumers (
      id TEXT PRIMARY KEY NOT NULL,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      consumer_reference_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(merchant_id, consumer_reference_id)
    );

    CREATE INDEX IF NOT EXISTS idx_consumers_merchant_phone 
    ON consumers(merchant_id, whatsapp_number);

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY NOT NULL,
      consumer_id TEXT NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
      billing_cycle TEXT NOT NULL,
      base_amount_paise INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'PAID', 'OVERDUE')) DEFAULT 'PENDING',
      due_date INTEGER NOT NULL,
      paid_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(consumer_id, billing_cycle)
    );

    CREATE INDEX IF NOT EXISTS idx_bills_consumer_status 
    ON bills(consumer_id, status);

    CREATE INDEX IF NOT EXISTS idx_bills_base_amount 
    ON bills(base_amount_paise);

    CREATE TABLE IF NOT EXISTS payment_sessions (
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

    CREATE INDEX IF NOT EXISTS idx_sessions_reconciliation 
    ON payment_sessions(allocated_amount_paise, status, expires_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_bill 
    ON payment_sessions(bill_id, status);

    CREATE INDEX IF NOT EXISTS idx_sessions_status_expires 
    ON payment_sessions(status, expires_at);

    CREATE TABLE IF NOT EXISTS bank_sms_alerts (
      id TEXT PRIMARY KEY NOT NULL,
      sender_id TEXT NOT NULL,
      raw_message TEXT NOT NULL,
      extracted_amount_paise INTEGER NOT NULL,
      extracted_utr TEXT,
      matched_session_id TEXT REFERENCES payment_sessions(id) ON DELETE SET NULL,
      received_at INTEGER NOT NULL DEFAULT (unixepoch()),
      is_processed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(extracted_utr)
    );

    -- Seed baseline demo merchant & bill if table is empty
    INSERT OR IGNORE INTO merchants (id, business_name, upi_vpa, webhook_secret, webhook_url, created_at, updated_at)
    VALUES ('m_demo', 'Acme Fiber Broadband', 'acme@upi', 'whsec_demo_secret_2026', 'http://localhost:7001/webhook', unixepoch(), unixepoch());

    INSERT OR IGNORE INTO consumers (id, merchant_id, name, whatsapp_number, consumer_reference_id, created_at, updated_at)
    VALUES ('c_demo', 'm_demo', 'Rahul Sharma', '919876543210', 'CUST-1001', unixepoch(), unixepoch());

    INSERT OR IGNORE INTO bills (id, consumer_id, billing_cycle, base_amount_paise, status, due_date, created_at, updated_at)
    VALUES ('bill_demo', 'c_demo', 'October 2026', 50000, 'PENDING', unixepoch() + 259200, unixepoch(), unixepoch());
  `);
}

// Global default singleton
const defaultClient = createDatabaseClient();
export const sqlite: RawSqliteDatabase = defaultClient.sqlite;
export const db: DatabaseInstance = defaultClient.db;
