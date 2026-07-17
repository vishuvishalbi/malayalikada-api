import { RowDataPacket } from 'mysql2/promise';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { ICartRepository } from '../../domain/repositories/ICartRepository';
import { NotFoundError, ValidationError, ForbiddenError } from '../../shared/errors/AppError';
import { paginate } from '../../shared/utils';
import { db } from '../../infrastructure/database/connection';
import { DeliveryService } from '../delivery/DeliveryService';
import { PaymentService } from '../payments/PaymentService';

export class OrderService {
  constructor(
    private orders: IOrderRepository,
    private carts: ICartRepository,
    private delivery: DeliveryService,
    private payments: PaymentService,
  ) {}

  async submit(customerId: number) {
    const cart = await this.carts.findByCustomer(customerId);
    const items = cart ? await this.carts.findItems(customerId) : [];
    if (!cart || items.length === 0) throw new ValidationError('Cart is empty');

    const productIds = items.map(i => i.product_id);
    const [priceRows] = await db.query<RowDataPacket[]>(
      `SELECT sp.product_id, sp.price_nzd, p.weight
       FROM store_pricing sp
       JOIN products p ON p.id = sp.product_id
       WHERE sp.store_id = ? AND sp.product_id IN (${productIds.map(() => '?').join(',')})`,
      [cart.store_id, ...productIds]
    );
    const priceMap = new Map((priceRows as any[]).map((r: any) => [
      r.product_id,
      { price: Number(r.price_nzd), weight_kg: r.weight !== null ? Number(r.weight) : 0 },
    ]));

    let subtotal = 0;
    // product.weight is in kilograms per unit; item weight = product.weight * quantity;
    // products with null weight contribute 0 kg
    let total_weight_kg = 0;
    const orderItems = items.map(i => {
      const info = priceMap.get(i.product_id);
      if (info === undefined) throw new ValidationError(`Product ${i.product_id} not available at selected store`);
      subtotal += info.price * i.quantity;
      total_weight_kg += info.weight_kg * i.quantity;
      return { product_id: i.product_id, quantity: i.quantity, unit_price_nzd: info.price };
    });

    total_weight_kg = Math.round(total_weight_kg * 1000) / 1000;
    const delivery_fee_nzd = await this.delivery.feeForWeight(total_weight_kg);
    const total_nzd = Math.round((subtotal + delivery_fee_nzd) * 100) / 100;

    const order = await this.orders.createWithReservation(
      {
        reference_no: '',
        customer_id: customerId,
        store_id: cart.store_id,
        status: 'pending_approval',
        total_nzd,
        delivery_fee_nzd,
        total_weight_kg,
        stripe_payment_intent_id: null,
        payment_status: 'unpaid',
        rejection_reason: null,
        actioned_by: null,
        actioned_at: null,
        stock_deducted_at: null,
      },
      orderItems,
      customerId
    );

    const { clientSecret, paymentIntentId } = await this.payments.createIntent(order.id, total_nzd);
    await this.orders.setPaymentIntent(order.id, paymentIntentId);

    return { ...order, stripe_payment_intent_id: paymentIntentId, client_secret: clientSecret };
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

  async workerCompleted(storeIds: number[] | null, page = 1, limit = 20) {
    // null = admin (all stores), pass empty array to signal "all stores"
    return this.orders.findWorkerCompleted(storeIds ?? [], page, limit);
  }

  async adminDetail(orderId: number, callerRole: string, callerStoreIds: number[]) {
    const detail = await this.orders.findAdminDetail(orderId);
    if (!detail) throw new NotFoundError('Order not found');
    if (callerRole === 'worker' && !callerStoreIds.includes(detail.store_id)) {
      throw new ForbiddenError();
    }
    return detail;
  }

  async approve(orderId: number, staffId: number, callerRole: string, callerStoreIds: number[]) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (callerRole === 'worker' && !callerStoreIds.includes(order.store_id)) {
      throw new ForbiddenError();
    }
    if (order.status !== 'pending_approval') throw new ValidationError('Order is not pending approval');
    await this.orders.deductStock(orderId);
    await this.orders.updateStatus(orderId, 'approved', staffId);
    return this.orders.findById(orderId);
  }

  async reject(orderId: number, staffId: number, reason: string, callerRole: string, callerStoreIds: number[]) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (callerRole === 'worker' && !callerStoreIds.includes(order.store_id)) {
      throw new ForbiddenError();
    }
    if (order.status !== 'pending_approval') throw new ValidationError('Order is not pending approval');
    await this.orders.releaseReservation(orderId);
    await this.orders.updateStatus(orderId, 'rejected', staffId, reason);
    return this.orders.findById(orderId);
  }

  async adminList(filters: { store_id?: number; status?: string; from?: string; to?: string; search?: string; page?: number; limit?: number }) {
    const { limit } = paginate(filters.page ?? 1, filters.limit ?? 20);
    return this.orders.findAllAdmin({
      storeId: filters.store_id,
      status: filters.status as any,
      from: filters.from,
      to: filters.to,
      search: filters.search,
      page: filters.page ?? 1,
      limit,
    });
  }

  async adminExportCsv(filters: { store_id?: number; from?: string; to?: string }): Promise<string> {
    const rows = await this.orders.getExportRows(filters.store_id, filters.from, filters.to);
    const header = 'reference_no,created_at,customer_name,customer_identifier,store_name,status,payment_status,item_count,total_nzd,delivery_fee_nzd\n';
    const lines = rows.map(o =>
      [
        o.reference_no,
        o.created_at instanceof Date ? o.created_at.toISOString() : o.created_at,
        `"${String(o.customer_name).replace(/"/g, '""')}"`,
        o.customer_identifier,
        `"${String(o.store_name).replace(/"/g, '""')}"`,
        o.status,
        o.payment_status,
        o.item_count,
        o.total_nzd,
        o.delivery_fee_nzd,
      ].join(',')
    ).join('\n');
    return header + lines;
  }
}
