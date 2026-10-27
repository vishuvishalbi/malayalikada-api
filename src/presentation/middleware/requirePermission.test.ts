import { describe, it, expect, vi } from 'vitest';
import { requirePermission } from './requirePermission';

async function run(permissions: string[] | undefined) {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn(() => reply);
  await requirePermission('stock:write')({ user: { permissions } } as any, reply);
  return reply;
}

describe('requirePermission', () => {
  it('lets a user holding the permission through', async () => {
    expect((await run(['stock:read', 'stock:write'])).status).not.toHaveBeenCalled();
  });

  it.each([[['stock:read']], [[]], [undefined]])('rejects %j with 403', async (perms) => {
    expect((await run(perms as string[] | undefined)).status).toHaveBeenCalledWith(403);
  });
});
