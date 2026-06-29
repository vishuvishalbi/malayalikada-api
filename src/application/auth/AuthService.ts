import bcrypt from 'bcrypt';
import { ICustomerRepository } from '../../domain/repositories/ICustomerRepository';
import { IStaffRepository } from '../../domain/repositories/IStaffRepository';
import { UnauthorizedError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError';

type Role = 'customer' | 'worker' | 'admin';

const MENUS: Record<Role, Array<{ key: string; label: string; icon: string }>> = {
  customer: [
    { key: 'home',         label: 'Home',         icon: 'home' },
    { key: 'categories',   label: 'Categories',   icon: 'grid' },
    { key: 'cart',         label: 'Cart',         icon: 'shopping-cart' },
    { key: 'orders',       label: 'My Orders',    icon: 'package' },
    { key: 'item-request', label: 'Request Item', icon: 'plus-circle' },
    { key: 'profile',      label: 'Profile',      icon: 'user' },
  ],
  worker: [
    { key: 'queue',   label: 'Order Queue', icon: 'inbox' },
    { key: 'done',    label: 'Completed',   icon: 'check-circle' },
    { key: 'profile', label: 'Profile',     icon: 'user' },
  ],
  admin: [
    { key: 'dashboard',     label: 'Dashboard',     icon: 'bar-chart' },
    { key: 'orders',        label: 'Orders',        icon: 'package' },
    { key: 'products',      label: 'Products',      icon: 'box' },
    { key: 'categories',    label: 'Categories',    icon: 'grid' },
    { key: 'stock',         label: 'Stock',         icon: 'layers' },
    { key: 'pricing',       label: 'Pricing',       icon: 'tag' },
    { key: 'staff',         label: 'Staff',         icon: 'users' },
    { key: 'customers',     label: 'Customers',     icon: 'user-check' },
    { key: 'item-requests', label: 'Item Requests', icon: 'clipboard' },
    { key: 'import',        label: 'CSV Import',    icon: 'upload' },
  ],
};

export class AuthService {
  constructor(
    private customers: ICustomerRepository,
    private staff: IStaffRepository,
  ) {}

  async register(
    identifier: string,
    identifierType: 'email' | 'mobile',
    password: string,
    firstName: string,
    lastName: string,
    signFn: (payload: object) => string,
  ) {
    const existing = await this.customers.findByIdentifier(identifier);
    if (existing) throw new ConflictError('Account already exists');

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await this.customers.create({
      identifier,
      identifier_type: identifierType,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      preferred_store_id: null,
    });

    const token = signFn({ sub: customer.id, role: 'customer', storeIds: [] });
    return {
      token,
      user: { id: customer.id, name: `${customer.first_name} ${customer.last_name}`, role: 'customer' as const, preferredStoreId: customer.preferred_store_id, storeIds: [] },
      menus: MENUS.customer,
    };
  }

  async login(identifier: string, password: string, signFn: (payload: object) => string) {
    const customer = await this.customers.findByIdentifier(identifier);
    if (customer) {
      const valid = await bcrypt.compare(password, customer.password_hash);
      if (!valid) throw new UnauthorizedError('Invalid credentials');
      const token = signFn({ sub: customer.id, role: 'customer', storeIds: [] });
      return {
        token,
        user: {
          id: customer.id,
          name: `${customer.first_name} ${customer.last_name}`,
          role: 'customer' as Role,
          preferredStoreId: customer.preferred_store_id,
          storeIds: [],
        },
        menus: MENUS.customer,
      };
    }

    const staffUser = await this.staff.findByIdentifier(identifier);
    if (!staffUser || !staffUser.is_active) throw new UnauthorizedError('Invalid credentials');
    const valid = await bcrypt.compare(password, staffUser.password_hash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    const storeIds = staffUser.role === 'worker' ? await this.staff.getStoreIds(staffUser.id) : [];
    const token = signFn({ sub: staffUser.id, role: staffUser.role, storeIds });
    return {
      token,
      user: {
        id: staffUser.id,
        name: staffUser.name,
        role: staffUser.role as Role,
        preferredStoreId: null,
        storeIds,
      },
      menus: MENUS[staffUser.role],
    };
  }

  async me(userId: number, role: Role, signFn: (payload: object) => string) {
    if (role === 'customer') {
      const customer = await this.customers.findById(userId);
      if (!customer) throw new NotFoundError('User not found');
      const token = signFn({ sub: customer.id, role: 'customer', storeIds: [] });
      return {
        token,
        user: { id: customer.id, name: `${customer.first_name} ${customer.last_name}`, role: 'customer' as Role, preferredStoreId: customer.preferred_store_id, storeIds: [] },
        menus: MENUS.customer,
      };
    }
    const staffUser = await this.staff.findById(userId);
    if (!staffUser) throw new NotFoundError('User not found');
    const storeIds = staffUser.role === 'worker' ? await this.staff.getStoreIds(staffUser.id) : [];
    const token = signFn({ sub: staffUser.id, role: staffUser.role, storeIds });
    return {
      token,
      user: { id: staffUser.id, name: staffUser.name, role: staffUser.role as Role, preferredStoreId: null, storeIds },
      menus: MENUS[staffUser.role],
    };
  }

  async setPreferredStore(customerId: number, storeId: number) {
    const updated = await this.customers.update(customerId, { preferred_store_id: storeId });
    if (!updated) throw new NotFoundError('Customer not found');
    return { preferredStoreId: updated.preferred_store_id };
  }

  async adminResetPassword(adminId: number, targetId: number, newPassword: string, targetType: 'customer' | 'staff') {
    const hash = await bcrypt.hash(newPassword, 10);
    if (targetType === 'customer') {
      await this.customers.update(targetId, { password_hash: hash });
    } else {
      await this.staff.update(targetId, { password_hash: hash });
    }
  }

  async updateProfile(
    userId: number,
    data: { first_name?: string; last_name?: string; address?: string; phone?: string }
  ) {
    const updated = await this.customers.update(userId, data);
    if (!updated) throw new NotFoundError('User not found');
    return {
      id: updated.id,
      name: `${updated.first_name} ${updated.last_name}`.trim(),
      role: 'customer',
      preferredStoreId: updated.preferred_store_id ?? null,
      storeIds: [],
      address: updated.address ?? null,
      phone: updated.phone ?? null,
    };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const customer = await this.customers.findById(userId);
    if (!customer) throw new NotFoundError('User not found');
    const valid = await bcrypt.compare(oldPassword, customer.password_hash);
    if (!valid) throw new ValidationError('Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 12);
    await this.customers.update(userId, { password_hash: hash });
  }
}
