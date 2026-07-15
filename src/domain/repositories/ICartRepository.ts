import { ICart } from '../entities/Cart';
import { ICartItem } from '../entities/CartItem';

export interface ICartRepository {
  findByCustomer(customerId: number): Promise<ICart | null>;
  findItems(customerId: number): Promise<ICartItem[]>;
  expireAndFindItems(customerId: number): Promise<ICartItem[]>;
  reserveItem(customerId: number, storeId: number, productId: number, quantity: number): Promise<ICartItem>;
  // quantity is the ABSOLUTE new total for that product line, not a delta
  releaseItem(customerId: number, productId: number): Promise<void>;
  clear(customerId: number): Promise<void>;
}
