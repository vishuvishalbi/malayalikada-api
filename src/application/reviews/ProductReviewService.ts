import { IProductReviewRepository } from '../../domain/repositories/IProductReviewRepository';
import { ValidationError } from '../../shared/errors/AppError';

export class ProductReviewService {
  constructor(private repo: IProductReviewRepository) {}

  async list(productId: number) {
    return this.repo.findByProduct(productId);
  }

  async create(customerId: number, productId: number, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new ValidationError('Rating must be between 1 and 5');
    return this.repo.upsert({ product_id: productId, customer_id: customerId, rating, comment: comment ?? null });
  }
}
