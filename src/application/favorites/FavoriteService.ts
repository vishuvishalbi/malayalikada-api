import { IFavoriteRepository } from '../../domain/repositories/IFavoriteRepository';

export class FavoriteService {
  constructor(private repo: IFavoriteRepository) {}

  async add(customerId: number, productId: number) {
    return this.repo.add(customerId, productId);
  }

  async remove(customerId: number, productId: number) {
    return this.repo.remove(customerId, productId);
  }

  async list(customerId: number) {
    return this.repo.list(customerId);
  }
}
