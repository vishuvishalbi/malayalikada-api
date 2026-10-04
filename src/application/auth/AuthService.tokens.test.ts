import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';

vi.mock('../../shared/config', () => ({ config: { jwtSecret: 'test-secret' } }));

import { AuthService } from './AuthService';

const TTL = 30 * 24 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Stand-in for jwt.sign: a JWT-shaped string whose payload carries the claims plus iat/exp. */
const signFn = vi.fn((payload: object) => {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: 1000, exp: 1000 + TTL })).toString('base64url');
  return `h.${body}.s`;
});

const customer = {
  id: 7, identifier: 'a@b.co', identifier_type: 'email', first_name: 'A', last_name: 'B',
  password_hash: bcrypt.hashSync('secret123', 4), preferred_store_id: null,
};
const staffUser = { id: 3, identifier: 's@b.co', name: 'S', role: 'worker', is_active: 1, password_hash: bcrypt.hashSync('secret123', 4) };

function makeService(over: { customers?: any; staff?: any } = {}) {
  const customers = {
    findByIdentifier: vi.fn().mockResolvedValue(customer),
    findByEmail: vi.fn().mockResolvedValue(null),
    findByPhone: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(customer),
    create: vi.fn().mockResolvedValue(customer),
    update: vi.fn().mockResolvedValue(customer),
    ...over.customers,
  };
  const staff = {
    findByIdentifier: vi.fn().mockResolvedValue(staffUser),
    findById: vi.fn().mockResolvedValue(staffUser),
    getStoreIds: vi.fn().mockResolvedValue([4]),
    ...over.staff,
  };
  const tokens = { issue: vi.fn().mockResolvedValue(undefined), retire: vi.fn().mockResolvedValue(undefined), revoke: vi.fn().mockResolvedValue(undefined) };
  return { service: new AuthService(customers as any, staff as any, tokens as any), tokens, customers, staff };
}

const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

describe('AuthService token issuance', () => {
  it('login registers a customer token under the jti it signed', async () => {
    const { service, tokens } = makeService();
    const result = await service.login('a@b.co', 'secret123', signFn);
    const { jti, sub, role } = claimsOf(result.token);
    expect(jti).toMatch(UUID);
    expect([sub, role]).toEqual([7, 'customer']);
    expect(tokens.issue).toHaveBeenCalledWith(jti, 'customer', 7, TTL);
  });

  it('login registers a staff token under the staff owner type', async () => {
    const { service, tokens } = makeService({ customers: { findByIdentifier: vi.fn().mockResolvedValue(null) } });
    const result = await service.login('s@b.co', 'secret123', signFn);
    const { jti, role } = claimsOf(result.token);
    expect(role).toBe('worker');
    expect(tokens.issue).toHaveBeenCalledWith(jti, 'staff', 3, TTL);
  });

  it('does not hand out a token whose registration failed', async () => {
    const { service, tokens } = makeService();
    tokens.issue.mockRejectedValue(new Error('db down'));
    await expect(service.login('a@b.co', 'secret123', signFn)).rejects.toThrow('db down');
  });

  it('me issues a fresh token and retires the one that was presented', async () => {
    const { service, tokens } = makeService();
    const result = await service.me(7, 'customer', signFn, 'old-jti');
    const { jti } = claimsOf(result.token);
    expect(jti).not.toBe('old-jti');
    expect(tokens.issue).toHaveBeenCalledWith(jti, 'customer', 7, TTL);
    expect(tokens.retire).toHaveBeenCalledWith('old-jti');
    expect(tokens.issue.mock.invocationCallOrder[0]).toBeLessThan(tokens.retire.mock.invocationCallOrder[0]);
  });

  it('me without a presented jti retires nothing', async () => {
    const { service, tokens } = makeService();
    await service.me(7, 'customer', signFn);
    expect(tokens.retire).not.toHaveBeenCalled();
  });

  it('register registers the new customer token', async () => {
    const { service, tokens } = makeService();
    const captcha = service.generateCaptcha();
    const answer = String(captcha.question.match(/\d+/g)!.reduce((s, n) => s + Number(n), 0));
    const result = await service.register(
      { first_name: 'A', last_name: 'B', email: 'a@b.co', phone: '0211234567', password: 'secret123', captcha_id: captcha.captcha_id, captcha_answer: answer },
      signFn,
    );
    expect(tokens.issue).toHaveBeenCalledWith(claimsOf(result.token).jti, 'customer', 7, TTL);
  });
});

describe('AuthService with anonymized (deleted) accounts', () => {
  const tombstone = { ...customer, identifier: 'deleted:7' };

  it('login treats an anonymized account as unknown, even with a valid password', async () => {
    const { service, tokens } = makeService({
      customers: { findByIdentifier: vi.fn().mockResolvedValue(tombstone) },
      staff: { findByIdentifier: vi.fn().mockResolvedValue(null) },
    });
    await expect(service.login('deleted:7', 'secret123', signFn)).rejects.toThrow('Invalid credentials');
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('me refuses an anonymized account', async () => {
    const { service, tokens } = makeService({ customers: { findById: vi.fn().mockResolvedValue(tombstone) } });
    await expect(service.me(7, 'customer', signFn, 'old-jti')).rejects.toThrow('User not found');
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('revokes a token issued while the account was being deleted, and returns nothing', async () => {
    // me reads an active customer, then the deletion commits before the token insert lands.
    const findById = vi.fn().mockResolvedValueOnce(customer).mockResolvedValue(tombstone);
    const { service, tokens } = makeService({ customers: { findById } });
    await expect(service.me(7, 'customer', signFn, 'old-jti')).rejects.toThrow();
    const issuedJti = tokens.issue.mock.calls[0][0];
    expect(tokens.revoke).toHaveBeenCalledWith(issuedJti);
    expect(tokens.retire).not.toHaveBeenCalled();
  });

  it('login revokes likewise when the account is deleted mid-login', async () => {
    const findById = vi.fn().mockResolvedValue(tombstone);
    const { service, tokens } = makeService({ customers: { findById } });
    await expect(service.login('a@b.co', 'secret123', signFn)).rejects.toThrow();
    expect(tokens.revoke).toHaveBeenCalledWith(tokens.issue.mock.calls[0][0]);
  });

  it('an admin password reset cannot revive an anonymized customer', async () => {
    const { service, customers } = makeService({ customers: { findById: vi.fn().mockResolvedValue(tombstone) } });
    await expect(service.adminResetPassword(1, 7, 'newpassword1', 'customer')).rejects.toThrow('Customer not found');
    expect(customers.update).not.toHaveBeenCalled();
  });

  it('an admin password reset still works for a live customer', async () => {
    const { service, customers } = makeService();
    await service.adminResetPassword(1, 7, 'newpassword1', 'customer');
    expect(customers.update).toHaveBeenCalledWith(7, { password_hash: expect.stringMatching(/^\$2/) });
  });
});
