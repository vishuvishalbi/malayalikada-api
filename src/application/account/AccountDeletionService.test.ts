import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { AccountDeletionService } from './AccountDeletionService';
import { ValidationError } from '../../shared/errors/AppError';

const hash = bcrypt.hashSync('correct-pw', 4);
const activeCustomer = { id: 7, identifier: 'a@b.co', password_hash: hash };

function makeService(customer: any = activeCustomer, anonymized = true) {
  const customers = { findById: vi.fn().mockResolvedValue(customer) };
  const deletion = { anonymizeCustomer: vi.fn().mockResolvedValue(anonymized) };
  const tokens = { evictUser: vi.fn() };
  return { service: new AccountDeletionService(customers as any, deletion as any, tokens as any), customers, deletion, tokens };
}

describe('AccountDeletionService.deleteAccount', () => {
  it('anonymizes the account and drops its cached tokens when the password is right', async () => {
    const { service, deletion, tokens } = makeService();
    expect(await service.deleteAccount(7, 'correct-pw')).toBe(true);
    expect(deletion.anonymizeCustomer).toHaveBeenCalledWith(7);
    expect(tokens.evictUser).toHaveBeenCalledWith('customer', 7);
  });

  it('rejects a wrong password with a validation error and changes nothing', async () => {
    const { service, deletion, tokens } = makeService();
    await expect(service.deleteAccount(7, 'wrong')).rejects.toBeInstanceOf(ValidationError);
    expect(deletion.anonymizeCustomer).not.toHaveBeenCalled();
    expect(tokens.evictUser).not.toHaveBeenCalled();
  });

  it('is a no-op for an account that no longer exists', async () => {
    const { service, deletion } = makeService(null);
    expect(await service.deleteAccount(7, 'correct-pw')).toBe(false);
    expect(deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('is a no-op for an account that was already anonymized, without checking the password', async () => {
    const { service, deletion } = makeService({ id: 7, identifier: 'deleted:7', password_hash: 'x' });
    expect(await service.deleteAccount(7, 'anything')).toBe(false);
    expect(deletion.anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('does not treat a real identifier that merely starts with "deleted" as anonymized', async () => {
    const { service, deletion } = makeService({ id: 7, identifier: 'deleted-items@shop.co', password_hash: hash });
    expect(await service.deleteAccount(7, 'correct-pw')).toBe(true);
    expect(deletion.anonymizeCustomer).toHaveBeenCalledWith(7);
  });

  it('keeps tokens untouched when the anonymization fails', async () => {
    const { service, deletion, tokens } = makeService();
    deletion.anonymizeCustomer.mockRejectedValue(new Error('db down'));
    await expect(service.deleteAccount(7, 'correct-pw')).rejects.toThrow('db down');
    expect(tokens.evictUser).not.toHaveBeenCalled();
  });
});
