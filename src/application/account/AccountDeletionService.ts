import bcrypt from 'bcrypt';
import { isAnonymizedCustomer } from '../../domain/entities/Customer';
import { ICustomerRepository } from '../../domain/repositories/ICustomerRepository';
import { IAccountDeletionRepository } from '../../domain/repositories/IAccountDeletionRepository';
import { ValidationError } from '../../shared/errors/AppError';
import { TokenService } from '../auth/TokenService';

export class AccountDeletionService {
  constructor(
    private customers: ICustomerRepository,
    private deletion: IAccountDeletionRepository,
    private tokens: TokenService,
  ) {}

  /** Returns true if the account was anonymized now, false if there was nothing left to do (idempotent). */
  async deleteAccount(customerId: number, password: string): Promise<boolean> {
    const customer = await this.customers.findById(customerId);
    if (!customer || isAnonymizedCustomer(customer)) return false;

    // A wrong password is a 422, never a 401: the app logs the user out on any 401.
    if (!(await bcrypt.compare(password, customer.password_hash))) throw new ValidationError('Password is incorrect');

    const anonymized = await this.deletion.anonymizeCustomer(customerId);
    this.tokens.evictUser('customer', customerId);
    return anonymized;
  }
}
