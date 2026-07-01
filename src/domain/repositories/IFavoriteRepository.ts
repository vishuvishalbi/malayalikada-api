import { IFavorite } from '../entities/Favorite';

export interface IFavoriteRepository {
  add(customerId: number, productId: number): Promise<IFavorite>;
  remove(customerId: number, productId: number): Promise<void>;
  list(customerId: number): Promise<IFavorite[]>;
}
