import { IProductReview } from '../entities/ProductReview';

export interface IProductReviewRepository {
  findByProduct(productId: number): Promise<IProductReview[]>;
  upsert(data: Pick<IProductReview, 'product_id' | 'customer_id' | 'rating' | 'comment'>): Promise<IProductReview>;
  getStats(productId: number): Promise<{ rating: number; review_count: number }>;
}
