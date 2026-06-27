import { FastifyRequest, FastifyReply } from 'fastify';
import { ItemRequestService } from '../../application/itemRequests/ItemRequestService';
import { submitRequestSchema, adminUpdateSchema, adminListQuerySchema } from '../schemas/itemRequest.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class ItemRequestController {
  constructor(private service: ItemRequestService) {}

  submit = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = submitRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.submit(request.user.sub, parsed.data));
  };

  customerList = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.customerList(request.user.sub));
  };

  adminList = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = adminListQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    reply.send(await this.service.adminList(parsed.data.store_id, parsed.data.status));
  };

  updateStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = adminUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    await this.service.updateStatus(Number(id), parsed.data.status, parsed.data.admin_notes);
    reply.send({ message: 'Status updated' });
  };
}
