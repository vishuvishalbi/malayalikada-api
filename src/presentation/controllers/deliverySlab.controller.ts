import { FastifyRequest, FastifyReply } from 'fastify';
import { DeliveryService } from '../../application/delivery/DeliveryService';
import { createDeliverySlabSchema, updateDeliverySlabSchema } from '../schemas/deliverySlab.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class DeliverySlabController {
  constructor(private service: DeliveryService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const all = (request.query as any).all === 'true';
    // activeOnly = true for public requests; admin can pass ?all=true
    const activeOnly = !all;
    const slabs = await this.service.list(activeOnly);
    reply.send({ slabs });
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createDeliverySlabSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.create(parsed.data));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateDeliverySlabSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.update(Number(id), parsed.data));
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.remove(Number(id));
    reply.status(204).send();
  };
}
