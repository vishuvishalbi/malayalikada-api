import { FastifyRequest, FastifyReply } from 'fastify';
import { BrandService } from '../../application/brands/BrandService';
import { createBrandSchema, updateBrandSchema } from '../schemas/brand.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class BrandController {
  constructor(private service: BrandService) {}

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.list());
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBrandSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.create(parsed.data));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateBrandSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.update(Number(id), parsed.data));
  };

  softDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.softDelete(Number(id));
    reply.status(204).send();
  };
}
