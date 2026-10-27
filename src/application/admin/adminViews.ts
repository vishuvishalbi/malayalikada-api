import { IStaffUser } from '../../domain/entities/StaffUser';
import { ICustomer } from '../../domain/entities/Customer';

/** Explicit response shapes: credentials and internal columns never reach admin clients. */
export const toStaffView = (s: IStaffUser) => ({
  id: s.id,
  identifier: s.identifier,
  identifier_type: s.identifier_type,
  name: s.name,
  role: s.role,
  is_active: s.is_active,
  store_ids: s.store_ids ?? [],
  created_at: s.created_at,
  updated_at: s.updated_at,
});

export const toCustomerView = (c: ICustomer) => ({
  id: c.id,
  identifier: c.identifier,
  identifier_type: c.identifier_type,
  first_name: c.first_name,
  last_name: c.last_name,
  email: c.email ?? null,
  phone_number: c.phone_number ?? null,
  preferred_store_id: c.preferred_store_id,
  address: c.address ?? null,
  phone: c.phone ?? null,
  created_at: c.created_at,
  updated_at: c.updated_at,
});
