import { describe, it, expect, vi } from 'vitest';
import { TokenService } from './TokenService';

function makeRepo(findActive: any = null) {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findActive: vi.fn().mockResolvedValue(findActive),
    expireSoon: vi.fn().mockResolvedValue(undefined),
    purgeExpired: vi.fn().mockResolvedValue(undefined),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
}

describe('TokenService.issue', () => {
  it('registers the token and purges expired rows', async () => {
    const repo = makeRepo();
    await new TokenService(repo).issue('jti-1', 'customer', 7, 2592000);
    expect(repo.save).toHaveBeenCalledWith('jti-1', 'customer', 7, 2592000);
    expect(repo.purgeExpired).toHaveBeenCalledTimes(1);
  });
});

describe('TokenService.isActive', () => {
  it('is false for an unregistered token and does not cache the miss', async () => {
    const repo = makeRepo(null);
    const service = new TokenService(repo);
    expect(await service.isActive('jti-1', 'customer', 7)).toBe(false);
    expect(await service.isActive('jti-1', 'customer', 7)).toBe(false);
    expect(repo.findActive).toHaveBeenCalledTimes(2);
  });

  it('is true for a registered token and serves repeats from the cache', async () => {
    const repo = makeRepo({ user_type: 'customer', user_id: 7 });
    const service = new TokenService(repo);
    expect(await service.isActive('jti-1', 'customer', 7)).toBe(true);
    expect(await service.isActive('jti-1', 'customer', 7)).toBe(true);
    expect(repo.findActive).toHaveBeenCalledTimes(1);
  });

  it('is false when the token is registered to a different user', async () => {
    const repo = makeRepo({ user_type: 'customer', user_id: 8 });
    const service = new TokenService(repo);
    expect(await service.isActive('jti-1', 'customer', 7)).toBe(false);
    expect(await service.isActive('jti-1', 'customer', 8)).toBe(true);
  });

  it('is false when the id matches but the user type does not', async () => {
    const repo = makeRepo({ user_type: 'staff', user_id: 7 });
    expect(await new TokenService(repo).isActive('jti-1', 'customer', 7)).toBe(false);
  });

  it('propagates repository errors instead of reporting the token as inactive', async () => {
    const repo = makeRepo();
    repo.findActive.mockRejectedValue(new Error('db down'));
    await expect(new TokenService(repo).isActive('jti-1', 'customer', 7)).rejects.toThrow('db down');
  });
});

describe('TokenService.evictUser', () => {
  it('forces the next check for that user back to the repository', async () => {
    const repo = makeRepo({ user_type: 'customer', user_id: 7 });
    const service = new TokenService(repo);
    await service.isActive('jti-1', 'customer', 7);
    service.evictUser('customer', 7);
    repo.findActive.mockResolvedValue(null);
    expect(await service.isActive('jti-1', 'customer', 7)).toBe(false);
    expect(repo.findActive).toHaveBeenCalledTimes(2);
  });

  it('leaves other users cached', async () => {
    const repo = makeRepo({ user_type: 'customer', user_id: 8 });
    const service = new TokenService(repo);
    await service.isActive('jti-2', 'customer', 8);
    service.evictUser('customer', 7);
    await service.isActive('jti-2', 'customer', 8);
    expect(repo.findActive).toHaveBeenCalledTimes(1);
  });
});

describe('TokenService.retire', () => {
  it('shortens the old token to a short grace period', async () => {
    const repo = makeRepo();
    await new TokenService(repo).retire('jti-old');
    expect(repo.expireSoon).toHaveBeenCalledWith('jti-old', 600);
  });
});

describe('TokenService.revoke', () => {
  it('deletes the token row', async () => {
    const repo = makeRepo();
    await new TokenService(repo).revoke('jti-1');
    expect(repo.revoke).toHaveBeenCalledWith('jti-1');
  });
});
