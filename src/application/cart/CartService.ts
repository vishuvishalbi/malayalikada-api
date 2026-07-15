import { RowDataPacket } from 'mysql2/promise';
import { ICartRepository } from '../../domain/repositories/ICartRepository';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError';
import { db } from '../../infrastructure/database/connection';
import { DeliveryService } from '../delivery/DeliveryService';

export class CartService {
  constructor(
    private repo: ICartRepository,
    private delivery: DeliveryService,
  ) {}

  async get(customerId: number) {
    const cart = await this.repo.findByCustomer(customerId);
    const items = cart ? await this.repo.expireAndFindItems(customerId) : [];
    if (!cart || items.length === 0) {
      return { storeId: cart?.store_id ?? null, items: [], grandTotal: 0, total_weight_kg: 0, delivery_fee_nzd: 0 };
    }

    const productIds = items.map(i => i.product_id);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.id, p.name, p.weight, sp.price_nzd,
              c.name AS category_name,
              COALESCE(pi.url, CONCAT('/uploads/', pi.filename)) AS first_image_url
       FROM products p
       JOIN store_pricing sp ON sp.product_id = p.id AND sp.store_id = ?
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT pi2.product_id, pi2.url, pi2.filename
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       WHERE p.id IN (${productIds.map(() => '?').join(',')})`,
      [cart.store_id, ...productIds]
    );

    const priceMap = new Map((rows as any[]).map((r: any) => [r.id, {
      name: r.name,
      price: Number(r.price_nzd),
      weight_kg: r.weight !== null && r.weight !== undefined ? Number(r.weight) : 0,
      category_name: r.category_name ?? null,
      first_image_url: r.first_image_url ?? null,
    }]));

    let grandTotal = 0;
    let total_weight_kg = 0;
    const respItems = items.map(i => {
      const info = priceMap.get(i.product_id);
      const unitPrice = info?.price ?? 0;
      const lineTotal = unitPrice * i.quantity;
      grandTotal += lineTotal;
      total_weight_kg += (info?.weight_kg ?? 0) * i.quantity;
      return {
        productId: i.product_id,
        name: info?.name ?? '',
        quantity: i.quantity,
        unitPrice,
        lineTotal,
        category_name: info?.category_name ?? null,
        first_image_url: info?.first_image_url ?? null,
      };
    });

    total_weight_kg = Math.round(total_weight_kg * 1000) / 1000;
    const delivery_fee_nzd = await this.delivery.feeForWeight(total_weight_kg);

    return { storeId: cart.store_id, items: respItems, grandTotal, total_weight_kg, delivery_fee_nzd };
  }

  async addItem(customerId: number, productId: number, quantity: number) {
    if (quantity <= 0) throw new ValidationError('Quantity must be positive');

    const cart = await this.repo.findByCustomer(customerId);
    let storeId = cart?.store_id;
    if (!storeId) {
      const [custRows] = await db.query<RowDataPacket[]>(
        'SELECT preferred_store_id FROM customers WHERE id = ?',
        [customerId]
      );
      storeId = (custRows as any[])[0]?.preferred_store_id;
    }
    if (!storeId) throw new ValidationError('No store selected. Set preferred store first.');

    const items = await this.repo.findItems(customerId);
    const existing = items.find(i => i.product_id === productId);
    const newQuantity = (existing?.quantity ?? 0) + quantity;

    return this.repo.reserveItem(customerId, storeId, productId, newQuantity);
  }

  async setItem(customerId: number, productId: number, quantity: number) {
    const cart = await this.repo.findByCustomer(customerId);
    if (!cart) throw new NotFoundError('Cart not found');

    if (quantity === 0) {
      await this.repo.releaseItem(customerId, productId);
      return;
    }

    return this.repo.reserveItem(customerId, cart.store_id, productId, quantity);
  }

  async removeItem(customerId: number, productId: number) {
    await this.repo.releaseItem(customerId, productId);
  }

  async clear(customerId: number) {
    await this.repo.clear(customerId);
  }
}
