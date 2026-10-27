import { describe, it, expect, vi, beforeEach } from 'vitest';

const isActive = vi.fn();
const staffFindById = vi.fn();
const staffPermissions = vi.fn();
vi.mock('../../infrastructure/auth/tokenRegistry', () => ({
  tokenService: { isActive: (...args: any[]) => isActive(...args) },
}));
vi.mock('../../infrastructure/repositories/StaffMysqlRepository', () => ({
  StaffMysqlRepository: class {
    findById = (...args: any[]) => staffFindById(...args);
    getPermissions = (...args: any[]) => staffPermissions(...args);
  },
}));

import { authenticate } from './authenticate';

function makeRequest(user: any, verifyFails = false) {
  const request: any = {
    user: undefined,
    jwtVerify: vi.fn(async () => {
      if (verifyFails) throw new Error('bad signature');
      request.user = { ...user };
    }),
  };
  return request;
}

function makeReply() {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn(() => reply);
  return reply;
}

beforeEach(() => {
  isActive.mockReset();
  staffFindById.mockReset();
  staffPermissions.mockReset().mockResolvedValue([]);
});

describe('authenticate', () => {
  it('rejects a token whose signature or expiry fails verification', async () => {
    const reply = makeReply();
    await authenticate(makeRequest({}, true), reply);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(isActive).not.toHaveBeenCalled();
  });

  it('rejects a token that carries no jti (issued before the registry existed)', async () => {
    const reply = makeReply();
    await authenticate(makeRequest({ sub: 7, role: 'customer', storeIds: [] }), reply);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(isActive).not.toHaveBeenCalled();
  });

  it('rejects a token that is not registered to its user', async () => {
    isActive.mockResolvedValue(false);
    const reply = makeReply();
    await authenticate(makeRequest({ sub: 7, role: 'customer', storeIds: [], jti: 'j1' }), reply);
    expect(isActive).toHaveBeenCalledWith('j1', 'customer', 7);
    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('lets a registered customer token through without a staff lookup', async () => {
    isActive.mockResolvedValue(true);
    const reply = makeReply();
    await authenticate(makeRequest({ sub: 7, role: 'customer', storeIds: [], jti: 'j1' }), reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(staffFindById).not.toHaveBeenCalled();
  });

  it('checks admin and worker tokens against the staff owner type', async () => {
    isActive.mockResolvedValue(true);
    staffFindById.mockResolvedValue({ is_active: 1, store_ids: [4] });
    const request = makeRequest({ sub: 3, role: 'admin', storeIds: [], jti: 'j2' });
    await authenticate(request, makeReply());
    expect(isActive).toHaveBeenCalledWith('j2', 'staff', 3);
    expect(request.user.storeIds).toEqual([4]);
  });

  it('takes role and permissions from the database, not the token', async () => {
    isActive.mockResolvedValue(true);
    staffFindById.mockResolvedValue({ is_active: 1, role: 'catalog_manager', store_ids: [] });
    staffPermissions.mockResolvedValue(['products:create']);
    const request = makeRequest({ sub: 3, role: 'admin', storeIds: [], jti: 'j2' });
    await authenticate(request, makeReply());
    expect(staffPermissions).toHaveBeenCalledWith('catalog_manager');
    expect(request.user.role).toBe('catalog_manager');
    expect(request.user.permissions).toEqual(['products:create']);
  });

  it('still rejects a registered staff token once the staff member is deactivated', async () => {
    isActive.mockResolvedValue(true);
    staffFindById.mockResolvedValue({ is_active: 0, store_ids: [] });
    const reply = makeReply();
    await authenticate(makeRequest({ sub: 3, role: 'worker', storeIds: [], jti: 'j2' }), reply);
    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('surfaces registry failures as errors, not as 401s that would log the user out', async () => {
    isActive.mockRejectedValue(new Error('db down'));
    await expect(
      authenticate(makeRequest({ sub: 7, role: 'customer', storeIds: [], jti: 'j1' }), makeReply()),
    ).rejects.toThrow('db down');
  });
});
