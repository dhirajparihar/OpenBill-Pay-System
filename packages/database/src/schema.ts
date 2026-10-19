import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Merchants Table
export const merchants = sqliteTable('merchants', {
  id: text('id').primaryKey(),
  businessName: text('business_name').notNull(),
  upiVpa: text('upi_vpa').notNull(),
  webhookSecret: text('webhook_secret').notNull(),
  webhookUrl: text('webhook_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// 2. Consumers Table
export const consumers = sqliteTable('consumers', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  whatsappNumber: text('whatsapp_number').notNull(),
  consumerReferenceId: text('consumer_reference_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  merchantConsumerRefIdx: uniqueIndex('idx_consumers_merchant_ref').on(table.merchantId, table.consumerReferenceId),
  merchantPhoneIdx: index('idx_consumers_merchant_phone').on(table.merchantId, table.whatsappNumber),
}));

// 3. Bills Table
export const bills = sqliteTable('bills', {
  id: text('id').primaryKey(),
  consumerId: text('consumer_id').notNull().references(() => consumers.id, { onDelete: 'cascade' }),
  billingCycle: text('billing_cycle').notNull(),
  baseAmountPaise: integer('base_amount_paise', { mode: 'number' }).notNull(), // 64-bit integer paise (e.g. ₹500 = 50000)
  status: text('status', { enum: ['PENDING', 'PAID', 'OVERDUE'] }).notNull().default('PENDING'),
  dueDate: integer('due_date', { mode: 'timestamp' }).notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  consumerCycleIdx: uniqueIndex('idx_bills_consumer_cycle').on(table.consumerId, table.billingCycle),
  consumerStatusIdx: index('idx_bills_consumer_status').on(table.consumerId, table.status),
  baseAmountIdx: index('idx_bills_base_amount').on(table.baseAmountPaise),
}));

// 4. Payment Sessions Table (Fractional Slot Allocator Engine)
export const paymentSessions = sqliteTable('payment_sessions', {
  id: text('id').primaryKey(),
  billId: text('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
  fractionalOffset: integer('fractional_offset', { mode: 'number' }).notNull(), // 0, 1, 2... paise
  allocatedAmountPaise: integer('allocated_amount_paise', { mode: 'number' }).notNull(), // baseAmountPaise + fractionalOffset
  status: text('status', { enum: ['AWAITING_ALERT', 'SUCCESS', 'EXPIRED'] }).notNull().default('AWAITING_ALERT'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  bankReferenceUtr: text('bank_reference_utr'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  reconciliationIdx: index('idx_sessions_reconciliation').on(table.allocatedAmountPaise, table.status, table.expiresAt),
  billSessionIdx: index('idx_sessions_bill').on(table.billId, table.status),
  activeExpiresIdx: index('idx_sessions_status_expires').on(table.status, table.expiresAt),
}));

// 5. Inbound Bank SMS Alerts Table (Audit & Idempotency)
export const bankSmsAlerts = sqliteTable('bank_sms_alerts', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').notNull(),
  rawMessage: text('raw_message').notNull(),
  extractedAmountPaise: integer('extracted_amount_paise', { mode: 'number' }).notNull(),
  extractedUtr: text('extracted_utr'),
  matchedSessionId: text('matched_session_id').references(() => paymentSessions.id, { onDelete: 'set null' }),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  isProcessed: integer('is_processed', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  utrUniqueIdx: uniqueIndex('idx_bank_alerts_utr').on(table.extractedUtr),
}));

// Type exports
export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;

export type Consumer = typeof consumers.$inferSelect;
export type NewConsumer = typeof consumers.$inferInsert;

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;

export type PaymentSession = typeof paymentSessions.$inferSelect;
export type NewPaymentSession = typeof paymentSessions.$inferInsert;

export type BankSmsAlert = typeof bankSmsAlerts.$inferSelect;
export type NewBankSmsAlert = typeof bankSmsAlerts.$inferInsert;
