import { describe, it, expect, vi, beforeEach } from 'vitest';

const isActive = vi.fn();
vi.mock('../../infrastructure/auth/tokenRegistry', () => ({
  tokenService: { isActive: (...args: any[]) => isActive(...args) },
}));

import { optionalAuthenticate } from './optionalAuthenticate';

function makeRequest(user: any, verifyFails = false) {
  const request: any = {
    user: null,
    jwtVerify: vi.fn(async () => {
      if (verifyFails) throw new Error('bad signature');
      request.user = { ...user };
    }),
  };
  return request;
}

beforeEach(() => {
  isActive.mockReset();
});

describe('optionalAuthenticate', () => {
  it('keeps request.user for a registered token', async () => {
    isActive.mockResolvedValue(true);
    const request = makeRequest({ sub: 7, role: 'customer', storeIds: [], jti: 'j1' });
    await optionalAuthenticate(request, {} as any);
    expect(request.user).toMatchObject({ sub: 7 });
  });

  it('treats a revoked token as a guest', async () => {
    isActive.mockResolvedValue(false);
    const request = makeRequest({ sub: 7, role: 'customer', storeIds: [], jti: 'j1' });
    await optionalAuthenticate(request, {} as any);
    expect(request.user).toBeNull();
  });

  it('treats a token without a jti as a guest', async () => {
    const request = makeRequest({ sub: 7, role: 'customer', storeIds: [] });
    await optionalAuthenticate(request, {} as any);
    expect(request.user).toBeNull();
    expect(isActive).not.toHaveBeenCalled();
  });

  it('treats a registry failure as a guest rather than failing a public route', async () => {
    isActive.mockRejectedValue(new Error('db down'));
    const request = makeRequest({ sub: 7, role: 'customer', storeIds: [], jti: 'j1' });
    await expect(optionalAuthenticate(request, {} as any)).resolves.toBeUndefined();
    expect(request.user).toBeNull();
  });

  it('leaves an unverifiable token as a guest', async () => {
    const request = makeRequest({}, true);
    await optionalAuthenticate(request, {} as any);
    expect(request.user).toBeNull();
  });
});
