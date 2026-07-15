import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { ITransaction } from '../../domain/entities/Transaction';
import { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';

export class TransactionMysqlRepository implements ITransactionRepository {
  async create(t: Omit<ITransaction, 'id' | 'created_at'>): Promise<ITransaction> {
    const [result] = await db.query<ResultSetHeader>(
      `INSERT INTO transactions (order_id, payment_channel, payment_method, status, amount_nzd, provider_ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [t.order_id, t.payment_channel, t.payment_method, t.status, t.amount_nzd, t.provider_ref]
    );
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM transactions WHERE id = ?', [result.insertId]);
    return (rows[0] as unknown) as ITransaction;
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
