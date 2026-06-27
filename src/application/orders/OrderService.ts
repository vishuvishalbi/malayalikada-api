import { RowDataPacket } from 'mysql2/promise';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { ICartRepository } from '../../domain/repositories/ICartRepository';
import { NotFoundError, ValidationError, ForbiddenError } from '../../shared/errors/AppError';
import { paginate } from '../../shared/utils';
import { db } from '../../infrastructure/database/connection';

export class OrderService {
  constructor(
    private orders: IOrderRepository,
    private carts: ICartRepository,
  ) {}

  async submit(customerId: number) {
    const cart = await this.carts.findByCustomer(customerId);
    if (!cart || cart.items.length === 0) throw new ValidationError('Cart is empty');

    const productIds = cart.items.map(i => i.product_id);
    const [priceRows] = await db.query<RowDataPacket[]>(
      `SELECT product_id, price_nzd FROM store_pricing WHERE store_id = ? AND product_id IN (${productIds.map(() => '?').join(',')})`,
      [cart.store_id, ...productIds]
    );
    const priceMap = new Map((priceRows as any[]).map((r: any) => [r.product_id, Number(r.price_nzd)]));

    let total = 0;
    const orderItems = cart.items.map(i => {
      const price = priceMap.get(i.product_id);
      if (price === undefined) throw new ValidationError(`Product ${i.product_id} not available at selected store`);
      total += price * i.quantity;
      return { order_id: 0, product_id: i.product_id, quantity: i.quantity, unit_price_nzd: price };
    });

    const paymentIntentId = `pi_stub_${customerId}_${Date.now()}`;

    const order = await this.orders.create(
      {
        reference_no: '',
        customer_id: customerId,
        store_id: cart.store_id,
        status: 'pending_approval',
        total_nzd: Math.round(total * 100) / 100,
        stripe_payment_intent_id: paymentIntentId,
        payment_status: 'unpaid',
        rejection_reason: null,
        actioned_by: null,
        actioned_at: null,
      },
      orderItems
    );

    await this.carts.clear(customerId);
    return order;
  }

  async customerHistory(customerId: number, page = 1, limit = 20) {
    const { offset } = paginate(page, limit);
    return this.orders.findByCustomer(customerId, offset, limit);
  }

  async customerDetail(customerId: number, orderId: number) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.customer_id !== customerId) throw new ForbiddenError();
    return order;
  }

  async workerQueue(storeIds: number[]) {
    return this.orders.findWorkerQueue(storeIds);
  }

  async approve(orderId: number, staffId: number) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.status !== 'pending_approval') throw new ValidationError('Order is not pending approval');
    await this.orders.deductStock(orderId);
    await this.orders.updateStatus(orderId, 'approved', staffId);
    return this.orders.findById(orderId);
  }

  async reject(orderId: number, staffId: number, reason: string) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.status !== 'pending_approval') throw new ValidationError('Order is not pending approval');
    await this.orders.updateStatus(orderId, 'rejected', staffId, reason);
    return this.orders.findById(orderId);
  }

  async adminList(filters: { store_id?: number; status?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const { limit } = paginate(filters.page ?? 1, filters.limit ?? 20);
    return this.orders.findAllAdmin({
      storeId: filters.store_id,
      status: filters.status as any,
      from: filters.from,
      to: filters.to,
      page: filters.page ?? 1,
      limit,
    });
  }

  async adminExportCsv(filters: { store_id?: number; from?: string; to?: string }): Promise<string> {
    const rows = await this.orders.getExportRows(filters.store_id, filters.from, filters.to);
    const header = 'id,reference_no,customer_id,store_id,status,total_nzd,payment_status,created_at\n';
    const lines = rows.map(o =>
      `${o.id},${o.reference_no},${o.customer_id},${o.store_id},${o.status},${o.total_nzd},${o.payment_status},${o.created_at}`
    ).join('\n');
    return header + lines;
  }
}
