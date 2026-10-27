import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcrypt';
import { AppError } from '../../shared/errors/AppError';

const h = vi.hoisted(() => ({
  customers: { findById: vi.fn(), findByIdentifier: vi.fn(), findByEmail: vi.fn(), findByPhone: vi.fn(), create: vi.fn(), update: vi.fn() },
  staff: { findById: vi.fn(), findByIdentifier: vi.fn(), getStoreIds: vi.fn(), getPermissions: vi.fn().mockResolvedValue([]) },
  deletion: { anonymizeCustomer: vi.fn() },
  tokens: { isActive: vi.fn(), issue: vi.fn(), retire: vi.fn(), evictUser: vi.fn() },
}));

vi.mock('../../shared/config', () => ({ config: { jwtSecret: 'test-secret' } }));
vi.mock('../../infrastructure/repositories/CustomerMysqlRepository', () => ({ CustomerMysqlRepository: class { constructor() { return h.customers as any; } } }));
vi.mock('../../infrastructure/repositories/StaffMysqlRepository', () => ({ StaffMysqlRepository: class { constructor() { return h.staff as any; } } }));
vi.mock('../../infrastructure/repositories/AccountDeletionMysqlRepository', () => ({ AccountDeletionMysqlRepository: class { constructor() { return h.deletion as any; } } }));
vi.mock('../../infrastructure/auth/tokenRegistry', () => ({ tokenService: h.tokens }));

import { authRoutes } from './auth.routes';

const hash = bcrypt.hashSync('correct-pw', 4);
let app: FastifyInstance;

const bearer = (payload: object) => ({ authorization: `Bearer ${app.jwt.sign(payload as any)}` });
const customerToken = (sub = 7, jti = 'jti-1') => bearer({ sub, role: 'customer', storeIds: [], jti });
const deleteAccount = (headers: Record<string, string>, payload: object = { password: 'correct-pw' }) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/delete-account', headers, payload });

beforeAll(async () => {
  app = Fastify();
  app.setErrorHandler((error, _req, reply) =>
    error instanceof AppError
      ? reply.status(error.statusCode).send({ error: error.message })
      : reply.status(500).send({ error: 'Internal server error' }));
  app.register(jwt, { secret: 'test-secret', sign: { expiresIn: '30d' } });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => {
  Object.values(h).forEach((group) => Object.values(group).forEach((fn) => fn.mockReset()));
  h.tokens.isActive.mockResolvedValue(true);
  h.tokens.issue.mockResolvedValue(undefined);
  h.tokens.retire.mockResolvedValue(undefined);
  h.deletion.anonymizeCustomer.mockResolvedValue(true);
  h.customers.findById.mockImplementation(async (id: number) => ({ id, identifier: `u${id}@b.co`, first_name: 'A', last_name: 'B', password_hash: hash, preferred_store_id: null }));
});

describe('POST /auth/delete-account', () => {
  it('rejects a call without a token', async () => {
    const res = await deleteAccount({});
    expect(res.statusCode).toBe(401);
    expect(h.deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('deletes the caller\'s own account', async () => {
    const res = await deleteAccount(customerToken(7));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: true });
    expect(h.deletion.anonymizeCustomer).toHaveBeenCalledWith(7);
    expect(h.tokens.evictUser).toHaveBeenCalledWith('customer', 7);
  });

  it('cannot be pointed at another customer: only the token\'s id is ever deleted', async () => {
    const res = await deleteAccount(customerToken(8), { password: 'correct-pw', customer_id: 7, id: 7 });
    expect(res.statusCode).toBe(200);
    expect(h.deletion.anonymizeCustomer).toHaveBeenCalledTimes(1);
    expect(h.deletion.anonymizeCustomer).toHaveBeenCalledWith(8);
  });

  it('forbids staff tokens', async () => {
    h.staff.findById.mockResolvedValue({ id: 3, is_active: 1, store_ids: [] });
    const res = await deleteAccount(bearer({ sub: 3, role: 'admin', storeIds: [], jti: 'jti-s' }));
    expect(res.statusCode).toBe(403);
    expect(h.deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('rejects a revoked token', async () => {
    h.tokens.isActive.mockResolvedValue(false);
    const res = await deleteAccount(customerToken());
    expect(res.statusCode).toBe(401);
    expect(h.deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('answers a wrong password with 422, not 401, and deletes nothing', async () => {
    const res = await deleteAccount(customerToken(), { password: 'nope' });
    expect(res.statusCode).toBe(422);
    expect(h.deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('answers a missing password with 422', async () => {
    const res = await deleteAccount(customerToken(), {});
    expect(res.statusCode).toBe(422);
    expect(h.deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('succeeds again for an account that is already gone (idempotent)', async () => {
    h.customers.findById.mockResolvedValue(null);
    const res = await deleteAccount(customerToken());
    expect(res.statusCode).toBe(200);
    expect(h.deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });
});

describe('GET /auth/me token rotation', () => {
  it('registers a replacement token and retires the presented one', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: customerToken(7, 'old-jti') });
    expect(res.statusCode).toBe(200);
    const newJti = (app.jwt.decode(res.json().token) as any).jti;
    expect(newJti).toBeTruthy();
    expect(newJti).not.toBe('old-jti');
    expect(h.tokens.issue).toHaveBeenCalledWith(newJti, 'customer', 7, 30 * 24 * 3600);
    expect(h.tokens.retire).toHaveBeenCalledWith('old-jti');
  });
});
