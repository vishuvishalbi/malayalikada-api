import { PricingMysqlRepository } from '../../infrastructure/repositories/PricingMysqlRepository';

export class PricingService {
  constructor(private repo: PricingMysqlRepository) {}

  list(filters: { store_id?: number; product_id?: number }) {
    return this.repo.findAll(filters);
  }

  upsert(productId: number, storeId: number, priceNzd: number, effectiveDate: string) {
    return this.repo.upsert(productId, storeId, priceNzd, effectiveDate);
  }
}
