import { IItemRequestRepository } from '../../domain/repositories/IItemRequestRepository';
import { IItemRequest } from '../../domain/entities/ItemRequest';
import { db } from '../../infrastructure/database/connection';
import { RowDataPacket } from 'mysql2/promise';
import { ValidationError } from '../../shared/errors/AppError';

export class ItemRequestService {
  constructor(private repo: IItemRequestRepository) {}

  async submit(customerId: number, data: { product_name: string; barcode?: string; notes?: string }) {
    const [custRows] = await db.query<RowDataPacket[]>(
      'SELECT preferred_store_id FROM customers WHERE id = ?', [customerId]
    );
    const storeId = (custRows as any)[0]?.preferred_store_id;
    if (!storeId) throw new ValidationError('No preferred store set');

    return this.repo.create({
      customer_id: customerId,
      store_id: storeId,
      product_name: data.product_name,
      barcode: data.barcode ?? null,
      notes: data.notes ?? null,
      status: 'new',
      admin_notes: null,
    });
  }

  customerList(customerId: number) {
    return this.repo.findByCustomer(customerId);
  }

  adminList(storeId?: number, status?: IItemRequest['status']) {
    return this.repo.findAllAdmin(storeId, status);
  }

  updateStatus(id: number, status: IItemRequest['status'], adminNotes?: string) {
    return this.repo.updateStatus(id, status, adminNotes);
  }
}
