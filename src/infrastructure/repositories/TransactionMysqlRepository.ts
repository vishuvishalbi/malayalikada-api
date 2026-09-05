import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { ITransaction } from '../../domain/entities/Transaction';
import { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

export class TransactionMysqlRepository implements ITransactionRepository {
  // provider_ref carries a unique index; a webhook retry or a confirmPayment
  // poll racing that same webhook can both pass the caller's findByProviderRef
  // check before either INSERT lands, so the DB constraint — not the
  // check-then-act read — is the real idempotency guard. Concurrent losers
  // fall back to reading the winner's row rather than erroring.
  async create(t: Omit<ITransaction, 'id' | 'created_at'>): Promise<ITransaction> {
    try {
      const [result] = await db.query<ResultSetHeader>(
        `INSERT INTO transactions (order_id, payment_channel, payment_method, status, amount_nzd, provider_ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [t.order_id, t.payment_channel, t.payment_method, t.status, t.amount_nzd, t.provider_ref]
      );
      const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM transactions WHERE id = ?', [result.insertId]);
      return (rows[0] as unknown) as ITransaction;
    } catch (err: any) {
      if (err?.code === DUPLICATE_ENTRY && t.provider_ref) {
        const existing = await this.findByProviderRef(t.provider_ref);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async findByProviderRef(providerRef: string): Promise<ITransaction | null> {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM transactions WHERE provider_ref = ?', [providerRef]);
    return (rows[0] as unknown as ITransaction) ?? null;
  }

  async sumSucceededByOrder(orderId: number): Promise<number> {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(amount_nzd), 0) AS total FROM transactions WHERE order_id = ? AND status = 'succeeded'",
      [orderId]
    );
    return Number((rows[0] as any).total);
  }
}
