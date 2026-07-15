import { ITransaction } from '../entities/Transaction';

export interface ITransactionRepository {
  create(t: Omit<ITransaction, 'id' | 'created_at'>): Promise<ITransaction>;
  findByProviderRef(providerRef: string): Promise<ITransaction | null>;
  sumSucceededByOrder(orderId: number): Promise<number>;
}
