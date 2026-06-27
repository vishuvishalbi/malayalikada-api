import { StockMysqlRepository } from '../../infrastructure/repositories/StockMysqlRepository';

export class StockService {
  constructor(private repo: StockMysqlRepository) {}

  list(filters: { store_id?: number; product_id?: number; low_stock?: boolean }) {
    return this.repo.findAll(filters);
  }

  set(productId: number, storeId: number, quantity: number, lowStockThreshold: number) {
    return this.repo.upsert(productId, storeId, quantity, lowStockThreshold);
  }
}
