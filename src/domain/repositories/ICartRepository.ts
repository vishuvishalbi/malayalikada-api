import { ICart } from '../entities/Cart';

export interface ICartRepository {
  findByCustomer(customerId: number): Promise<ICart | null>;
  upsert(customerId: number, storeId: number, items: ICart['items']): Promise<ICart>;
  clear(customerId: number): Promise<void>;
}
