import bcrypt from 'bcrypt';
import { createHmac, randomInt } from 'node:crypto';
import { ICustomerRepository } from '../../domain/repositories/ICustomerRepository';
import { IStaffRepository } from '../../domain/repositories/IStaffRepository';
import { UnauthorizedError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { config } from '../../shared/config';

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

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

// MVP replay guard — resets on server restart.
const usedCaptchaIds = new Set<string>();

const hmac = (data: string) =>
  createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

export class AuthService {
  constructor(
    private customers: ICustomerRepository,
    private staff: IStaffRepository,
  ) {}

  /// Stateless arithmetic captcha: captcha_id = `${exp}.${answerHash}.${sig}`,
  /// all HMAC-signed with the JWT secret — nothing stored server-side.
  generateCaptcha() {
    const a = randomInt(1, 10);
    const b = randomInt(1, 10);
    const exp = Date.now() + CAPTCHA_TTL_MS;
    const answerHash = hmac(`answer:${a + b}`);
    const sig = hmac(`captcha:${answerHash}:${exp}`);
    return { captcha_id: `${exp}.${answerHash}.${sig}`, question: `What is ${a} + ${b}?` };
  }

  private verifyCaptcha(captchaId: string, answer: string): void {
    const parts = captchaId.split('.');
    if (parts.length !== 3) throw new ValidationError('Invalid captcha');
    const [expStr, answerHash, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) throw new ValidationError('Captcha expired — tap refresh for a new question');
    if (sig !== hmac(`captcha:${answerHash}:${exp}`)) throw new ValidationError('Invalid captcha');
    if (usedCaptchaIds.has(captchaId)) throw new ValidationError('Captcha already used — tap refresh for a new question');
    if (answerHash !== hmac(`answer:${answer.trim()}`)) throw new ValidationError('Incorrect captcha answer');
    usedCaptchaIds.add(captchaId);
  }

  async register(
    data: {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      password: string;
      captcha_id: string;
      captcha_answer: string;
    },
    signFn: (payload: object) => string,
  ) {
    this.verifyCaptcha(data.captcha_id, data.captcha_answer);

    const email = data.email.toLowerCase();
    const [existingEmail, existingPhone] = await Promise.all([
      this.customers.findByEmail(email),
      this.customers.findByPhone(data.phone),
    ]);
    if (existingEmail) throw new ConflictError('An account with this email already exists');
    if (existingPhone) throw new ConflictError('An account with this mobile number already exists');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const customer = await this.customers.create({
      identifier: email,
      identifier_type: 'email',
      password_hash: passwordHash,
      first_name: data.first_name,
      last_name: data.last_name,
      email,
      phone_number: data.phone,
      preferred_store_id: null,
    });

    const token = signFn({ sub: customer.id, role: 'customer', storeIds: [] });
    return {
      token,
      user: { id: customer.id, name: `${customer.first_name} ${customer.last_name}`, role: 'customer' as const, preferredStoreId: customer.preferred_store_id, storeIds: [] },
      menus: MENUS.customer,
    };
  }

  /** Customers registered via the v5 form have identifier=email, so login must
   *  also match the email/phone_number columns (accepting +64/0 NZ variants). */
  private async findCustomerForLogin(identifier: string) {
    const direct = await this.customers.findByIdentifier(identifier);
    if (direct) return direct;
    const byEmail = await this.customers.findByEmail(identifier);
    if (byEmail) return byEmail;
    const phone = identifier.replace(/[\s-]/g, '');
    const alt = phone.startsWith('+64')
      ? `0${phone.slice(3)}`
      : phone.startsWith('0')
        ? `+64${phone.slice(1)}`
        : phone;
    return (await this.customers.findByPhone(phone)) ?? (await this.customers.findByPhone(alt));
  }

  async login(identifier: string, password: string, signFn: (payload: object) => string) {
    const customer = await this.findCustomerForLogin(identifier);
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
    if (!staffUser.is_active) throw new UnauthorizedError('Account deactivated');
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
    role: Role,
    data: { first_name?: string; last_name?: string; address?: string; phone?: string }
  ) {
    if (role !== 'customer') {
      const staffUser = await this.staff.findById(userId);
      if (!staffUser) throw new NotFoundError('User not found');
      const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || undefined;
      if (name) await this.staff.update(userId, { name });
      const updated = (await this.staff.findById(userId))!;
      return {
        id: updated.id,
        name: updated.name,
        role,
        preferredStoreId: null,
        storeIds: updated.store_ids ?? [],
        address: null,
        phone: null,
      };
    }
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

  async changePassword(userId: number, role: Role, oldPassword: string, newPassword: string) {
    if (role !== 'customer') {
      const staffUser = await this.staff.findById(userId);
      if (!staffUser) throw new NotFoundError('User not found');
      const valid = await bcrypt.compare(oldPassword, staffUser.password_hash);
      if (!valid) throw new ValidationError('Current password is incorrect');
      const hash = await bcrypt.hash(newPassword, 12);
      await this.staff.update(userId, { password_hash: hash });
      return;
    }
    const customer = await this.customers.findById(userId);
    if (!customer) throw new NotFoundError('User not found');
    const valid = await bcrypt.compare(oldPassword, customer.password_hash);
    if (!valid) throw new ValidationError('Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 12);
    await this.customers.update(userId, { password_hash: hash });
  }
}
