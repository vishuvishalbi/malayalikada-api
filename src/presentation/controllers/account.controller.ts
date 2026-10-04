import { FastifyRequest, FastifyReply } from 'fastify';
import { AccountDeletionService } from '../../application/account/AccountDeletionService';
import { deleteAccountSchema } from '../schemas/auth.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class AccountController {
  constructor(private service: AccountDeletionService) {}

  deleteAccount = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = deleteAccountSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    // The target is always the authenticated caller; there is no way to name another account.
    const customerId = request.user.sub;
    const deleted = await this.service.deleteAccount(customerId, parsed.data.password);
    if (deleted) request.log.info({ event: 'account_deleted', customerId }, 'Customer account anonymized');
    reply.send({ deleted: true });
  };
}
