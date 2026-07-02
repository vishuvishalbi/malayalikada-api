import { RowDataPacket } from 'mysql2/promise';
import { ICartRepository } from '../../domain/repositories/ICartRepository';
import { ICartItem } from '../../domain/entities/Cart';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError';
import { db } from '../../infrastructure/database/connection';

export class CartService {
  constructor(private repo: ICartRepository) {}

  async get(customerId: number) {
    const cart = await this.repo.findByCustomer(customerId);
    if (!cart || cart.items.length === 0) {
      return { storeId: cart?.store_id ?? null, items: [], grandTotal: 0 };
    }

    const productIds = cart.items.map(i => i.product_id);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.id, p.name, sp.price_nzd,
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
      category_name: r.category_name ?? null,
      first_image_url: r.first_image_url ?? null,
    }]));

    let grandTotal = 0;
    const items = cart.items.map(i => {
      const info = priceMap.get(i.product_id);
      const unitPrice = info?.price ?? 0;
      const lineTotal = unitPrice * i.quantity;
      grandTotal += lineTotal;
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

    return { storeId: cart.store_id, items, grandTotal };
  }

  async addItem(customerId: number, productId: number, quantity: number) {
    const cart = await this.repo.findByCustomer(customerId);

    const [custRows] = await db.query<RowDataPacket[]>(
      'SELECT preferred_store_id FROM customers WHERE id = ?',
      [customerId]
    );
    const storeId = cart?.store_id ?? (custRows as any[])[0]?.preferred_store_id;
    if (!storeId) throw new ValidationError('No store selected. Set preferred store first.');

    const [priceRows] = await db.query<RowDataPacket[]>(
      'SELECT price_nzd FROM store_pricing WHERE product_id = ? AND store_id = ?',
      [productId, storeId]
    );
    if ((priceRows as any[]).length === 0) throw new ValidationError('Product not available at selected store');

    const currentItems = cart?.items ?? [];
    const existing = currentItems.find(i => i.product_id === productId);
    let newItems: ICartItem[];
    if (existing) {
      newItems = currentItems.map(i => i.product_id === productId ? { ...i, quantity: i.quantity + quantity } : i);
    } else {
      newItems = [...currentItems, { product_id: productId, quantity }];
    }

    return this.repo.upsert(customerId, storeId, newItems);
  }

  async setItem(customerId: number, productId: number, quantity: number) {
    const cart = await this.repo.findByCustomer(customerId);
    if (!cart) throw new NotFoundError('Cart not found');

    const existingItem = cart.items.find(i => i.product_id === productId);

    // Validate pricing when adding a product not already in cart
    if (quantity > 0 && !existingItem) {
      const [priceRows] = await db.query<RowDataPacket[]>(
        'SELECT price_nzd FROM store_pricing WHERE product_id = ? AND store_id = ?',
        [productId, cart.store_id]
      );
      if ((priceRows as any[]).length === 0) throw new ValidationError('Product not available at selected store');
    }

    let newItems: ICartItem[];
    if (quantity === 0) {
      newItems = cart.items.filter(i => i.product_id !== productId);
    } else if (existingItem) {
      newItems = cart.items.map(i => i.product_id === productId ? { ...i, quantity } : i);
    } else {
      newItems = [...cart.items, { product_id: productId, quantity }];
    }

    return this.repo.upsert(customerId, cart.store_id, newItems);
  }

  async removeItem(customerId: number, productId: number) {
    const cart = await this.repo.findByCustomer(customerId);
    if (!cart) return;
    const newItems = cart.items.filter(i => i.product_id !== productId);
    await this.repo.upsert(customerId, cart.store_id, newItems);
  }

  async clear(customerId: number) {
    await this.repo.clear(customerId);
  }
}
