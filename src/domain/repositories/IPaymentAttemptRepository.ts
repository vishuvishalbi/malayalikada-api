import { IPaymentAttempt } from '../entities/PaymentAttempt';

export interface IPaymentAttemptRepository {
  create(a: Omit<IPaymentAttempt, 'id'>): Promise<void>;
}
