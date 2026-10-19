import { randomUUID } from 'node:crypto';
import { sqlite as defaultSqlite } from '@openbill/database';
import type Database from 'better-sqlite3';

export interface SlotAllocationOptions {
  /** Maximum minor unit offset allowed (default: 99 paise = ₹0.99) */
  maxOffset?: number;
  /** Expiration window in minutes (default: 5 minutes) */
  ttlMinutes?: number;
  /** Optional custom SQLite connection handle */
  sqlite?: Database.Database;
}

export interface AllocatedSessionResult {
  id: string;
  billId: string;
  baseAmountPaise: number;
  fractionalOffset: number;
  allocatedAmountPaise: number;
  status: 'AWAITING_ALERT' | 'SUCCESS' | 'EXPIRED';
  expiresAt: Date;
  expiresAtTimestamp: number;
  createdAt: Date;
}

export class SlotAllocationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SlotAllocationError';
  }
}

/**
 * Mutex for in-process async sequencing.
 * Ensures concurrent event-loop requests queue cleanly before acquiring SQLite IMMEDIATE lock.
 */
class AsyncLock {
  private queue: Promise<void> = Promise.resolve();

  acquire<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(async () => {
      return await task();
    });
    this.queue = next.then(() => {}, () => {});
    return next;
  }
}

const allocatorLock = new AsyncLock();

/**
 * Allocates a unique fractional paise payment session for a bill.
 * 
 * Exact Algorithm:
 * 1. Begins an IMMEDIATE SQLite transaction to secure an exclusive write lock (preventing concurrent race conditions).
 * 2. Fetches the bill and its `base_amount_paise`. Validates that the bill is pending.
 * 3. Queries all active `Payment_Sessions` where `status = 'AWAITING_ALERT'` and `expires_at > CURRENT_TIMESTAMP`
 *    for that specific `base_amount_paise` across the entire merchant ledger.
 * 4. Identifies the lowest available integer minor-unit offset (e.g., 0, 1, 2, 3...).
 * 5. Creates a new payment session with `allocated_amount_paise = base_amount_paise + fractional_offset`.
 * 6. Sets the expiration timestamp to exactly 5 minutes into the future.
 * 7. Commits the transaction and returns the newly minted session.
 *
 * @param billId The unique identifier of the bill to be paid
 * @param options Allocation configuration options
 * @returns The newly allocated payment session record
 */
export async function allocatePaymentSession(
  billId: string,
  options: SlotAllocationOptions = {}
): Promise<AllocatedSessionResult> {
  const {
    maxOffset = 99,
    ttlMinutes = 5,
    sqlite = defaultSqlite
  } = options;

  // Process-level async mutex + SQLite IMMEDIATE transaction ensures strict serializability
  return allocatorLock.acquire(async () => {
    // Prepared statements for maximum performance inside the transaction
    const getBillStmt = sqlite.prepare(`
      SELECT id, base_amount_paise, status 
      FROM bills 
      WHERE id = ?
    `);

    const getActiveOffsetsStmt = sqlite.prepare(`
      SELECT ps.fractional_offset
      FROM payment_sessions ps
      JOIN bills b ON ps.bill_id = b.id
      WHERE b.base_amount_paise = ?
        AND ps.status = 'AWAITING_ALERT'
        AND ps.expires_at > unixepoch()
      ORDER BY ps.fractional_offset ASC
    `);

    const insertSessionStmt = sqlite.prepare(`
      INSERT INTO payment_sessions (
        id,
        bill_id,
        fractional_offset,
        allocated_amount_paise,
        status,
        expires_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'AWAITING_ALERT', ?, unixepoch(), unixepoch())
    `);

    // Execute within SQLite transaction with BEGIN IMMEDIATE
    // This immediately reserves the write lock on the database file
    const runTransaction = sqlite.transaction(() => {
      // 1. Fetch and validate bill
      const bill = getBillStmt.get(billId) as {
        id: string;
        base_amount_paise: number;
        status: string;
      } | undefined;

      if (!bill) {
        throw new SlotAllocationError(`Bill with ID '${billId}' does not exist`, 'BILL_NOT_FOUND');
      }

      if (bill.status === 'PAID') {
        throw new SlotAllocationError(`Bill '${billId}' has already been paid`, 'BILL_ALREADY_PAID');
      }

      const baseAmountPaise = bill.base_amount_paise;

      // 2. Query all active sessions for this base_amount_paise where status='AWAITING_ALERT' and expires_at > CURRENT_TIMESTAMP
      const activeRows = getActiveOffsetsStmt.all(baseAmountPaise) as Array<{ fractional_offset: number }>;
      const usedOffsets = new Set<number>(activeRows.map(row => row.fractional_offset));

      // 3. Find the lowest available integer minor-unit offset starting at 0
      let lowestOffset = 0;
      while (usedOffsets.has(lowestOffset)) {
        lowestOffset++;
      }

      if (lowestOffset > maxOffset) {
        throw new SlotAllocationError(
          `All available fractional payment slots (0-${maxOffset}) for base amount ${baseAmountPaise} paise are currently occupied. Please retry in a few moments.`,
          'SLOTS_EXHAUSTED'
        );
      }

      // 4. Calculate allocated amount
      const allocatedAmountPaise = baseAmountPaise + lowestOffset;

      // 5. Calculate expiration: exactly 5 minutes (ttlMinutes) into the future
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiresAtSeconds = nowSeconds + (ttlMinutes * 60);
      const sessionId = randomUUID();

      // 6. Persist new payment session
      insertSessionStmt.run(
        sessionId,
        bill.id,
        lowestOffset,
        allocatedAmountPaise,
        expiresAtSeconds
      );

      return {
        id: sessionId,
        billId: bill.id,
        baseAmountPaise,
        fractionalOffset: lowestOffset,
        allocatedAmountPaise,
        status: 'AWAITING_ALERT' as const,
        expiresAt: new Date(expiresAtSeconds * 1000),
        expiresAtTimestamp: expiresAtSeconds,
        createdAt: new Date(nowSeconds * 1000),
      };
    });

    // .immediate() forces SQLite to execute `BEGIN IMMEDIATE`
    return runTransaction.immediate();
  });
}
