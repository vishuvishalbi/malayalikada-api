import { describe, it, expect, vi } from 'vitest';

vi.mock('../../infrastructure/database/connection', () => ({
  db: { query: vi.fn().mockResolvedValue([[], undefined]) },
}));

import { CartService } from './CartService';

function makeRepo(overrides: Partial<any> = {}) {
  return {
    findByCustomer: vi.fn().mockResolvedValue({ customer_id: 1, store_id: 5, updated_at: new Date() }),
    findItems: vi.fn().mockResolvedValue([]),
    expireAndFindItems: vi.fn().mockResolvedValue([]),
    reserveItem: vi.fn(),
    releaseItem: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}
function makeDelivery() {
  return { feeForWeight: vi.fn().mockResolvedValue(5) } as any;
}

describe('CartService.addItem', () => {
  it('adds requested quantity on top of existing cart quantity', async () => {
    const repo = makeRepo({
      findItems: vi.fn().mockResolvedValue([{ id: 1, cart_id: 1, product_id: 9, store_id: 5, quantity: 2, reserved_at: new Date() }]),
    });
    const service = new CartService(repo, makeDelivery());
    await service.addItem(1, 9, 3);
    expect(repo.reserveItem).toHaveBeenCalledWith(1, 5, 9, 5);
  });

  it('rejects zero or negative quantity', async () => {
    const repo = makeRepo();
    const service = new CartService(repo, makeDelivery());
    await expect(service.addItem(1, 9, 0)).rejects.toThrow();
  });
});

describe('CartService.setItem', () => {
  it('removes the item when quantity is 0', async () => {
    const repo = makeRepo();
    const service = new CartService(repo, makeDelivery());
    await service.setItem(1, 9, 0);
    expect(repo.releaseItem).toHaveBeenCalledWith(1, 9);
    expect(repo.reserveItem).not.toHaveBeenCalled();
  });

  it('sets absolute quantity via reserveItem otherwise', async () => {
    const repo = makeRepo();
    const service = new CartService(repo, makeDelivery());
    await service.setItem(1, 9, 4);
    expect(repo.reserveItem).toHaveBeenCalledWith(1, 5, 9, 4);
  });
});
