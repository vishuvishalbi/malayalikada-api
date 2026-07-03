import { FastifyRequest, FastifyReply } from 'fastify';
import { NotifyRequestService } from '../../application/notifyRequests/NotifyRequestService';
import { createNotifyRequestSchema } from '../schemas/notifyRequest.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class NotifyRequestController {
  constructor(private service: NotifyRequestService) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createNotifyRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    await this.service.create(request.user.sub, parsed.data.product_id, parsed.data.store_id);
    reply.send({ success: true });
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const storeId = (request.query as any).store_id
      ? Number((request.query as any).store_id)
      : undefined;
    const rows = await this.service.list(storeId);
    reply.send({ items: rows, total: rows.length });
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.remove(Number(id));
    reply.status(204).send();
  };
}
