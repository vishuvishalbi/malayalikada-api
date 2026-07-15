import { db } from '../database/connection';
import { IPaymentAttempt } from '../../domain/entities/PaymentAttempt';
import { IPaymentAttemptRepository } from '../../domain/repositories/IPaymentAttemptRepository';

export class PaymentAttemptMysqlRepository implements IPaymentAttemptRepository {
  async create(a: Omit<IPaymentAttempt, 'id'>): Promise<void> {
    await db.query(
      `INSERT INTO payment_attempts (order_id, stripe_payment_intent_id, status, error_message, attempted_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [a.order_id, a.stripe_payment_intent_id, a.status, a.error_message]
    );
  }
}
