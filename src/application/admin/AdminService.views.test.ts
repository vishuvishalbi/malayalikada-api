import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../infrastructure/database/connection', () => ({
  db: { query: (...args: any[]) => query(...args) },
}));

import { AdminService } from './AdminService';

const staffRow = {
  id: 1, identifier: 'a@b.nz', identifier_type: 'email', password_hash: '$2b$hash', name: 'A',
  role: 'admin', is_active: true, store_ids: [1], store_ids_csv: '1', created_at: new Date(), updated_at: new Date(),
};
const customerRow = {
  id: 2, identifier: 'c@d.nz', identifier_type: 'email', password_hash: '$2b$hash', first_name: 'C', last_name: 'D',
  email: 'c@d.nz', phone_number: null, preferred_store_id: 1, address: null, phone: null, deleted_at: null,
  created_at: new Date(), updated_at: new Date(),
};
const STAFF_KEYS = ['created_at', 'id', 'identifier', 'identifier_type', 'is_active', 'name', 'role', 'store_ids', 'updated_at'];
const CUSTOMER_KEYS = [
  'address', 'created_at', 'email', 'first_name', 'id', 'identifier', 'identifier_type', 'last_name',
  'phone', 'phone_number', 'preferred_store_id', 'updated_at',
];
const keys = (o: object) => Object.keys(o).sort();

describe('AdminService response shapes', () => {
  beforeEach(() => query.mockReset());

  it('listStaff', async () => {
    const svc = new AdminService({ findAll: vi.fn().mockResolvedValue([staffRow]) } as any, {} as any);
    expect(keys((await svc.listStaff())[0])).toEqual(STAFF_KEYS);
  });

  it('createStaff', async () => {
    const staff = { roleExists: vi.fn().mockResolvedValue(true), create: vi.fn().mockResolvedValue(staffRow), setStoreIds: vi.fn(), findById: vi.fn().mockResolvedValue(staffRow) };
    const svc = new AdminService(staff as any, {} as any);
    const out = await svc.createStaff({ identifier: 'a@b.nz', identifier_type: 'email', password: 'x', name: 'A', role: 'admin' });
    expect(keys(out)).toEqual(STAFF_KEYS);
  });

  it('updateStaff', async () => {
    const staff = { roleExists: vi.fn().mockResolvedValue(true), update: vi.fn(), setStoreIds: vi.fn(), findById: vi.fn().mockResolvedValue(staffRow) };
    const svc = new AdminService(staff as any, {} as any);
    expect(keys((await svc.updateStaff(1, { name: 'A' }))!)).toEqual(STAFF_KEYS);
  });

  it('listCustomers', async () => {
    const customers = { findAll: vi.fn().mockResolvedValue({ items: [customerRow], total: 1 }) };
    const out = await new AdminService({} as any, customers as any).listCustomers();
    expect(out.total).toBe(1);
    expect(keys(out.items[0])).toEqual(CUSTOMER_KEYS);
  });

  it('getCustomer', async () => {
    query.mockResolvedValueOnce([[{ id: 9 }]]);
    const customers = { findById: vi.fn().mockResolvedValue(customerRow) };
    const out = await new AdminService({} as any, customers as any).getCustomer(2);
    expect(keys(out)).toEqual([...CUSTOMER_KEYS, 'orders'].sort());
  });
});

describe('AdminService role validation', () => {
  it('rejects a role that does not exist', async () => {
    const staff = { roleExists: vi.fn().mockResolvedValue(false), create: vi.fn() };
    const svc = new AdminService(staff as any, {} as any);
    await expect(
      svc.createStaff({ identifier: 'a@b.nz', identifier_type: 'email', password: 'x', name: 'A', role: 'nope' }),
    ).rejects.toThrow('Unknown role');
    expect(staff.create).not.toHaveBeenCalled();
  });
});
