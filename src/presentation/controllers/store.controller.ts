import { FastifyRequest, FastifyReply } from 'fastify';
import { StoreService } from '../../application/stores/StoreService';
import { createStoreSchema, updateStoreSchema } from '../schemas/store.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class StoreController {
  constructor(private service: StoreService) {}

  list = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.list());
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(await this.service.getById(Number(id)));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createStoreSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.create(parsed.data));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateStoreSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.update(Number(id), parsed.data));
  };

  uploadLogo = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();
    if (!data) throw new ValidationError('No file uploaded');
    const buffer = await data.toBuffer();
    reply.send(await this.service.uploadLogo(Number(id), buffer, data.filename));
  };

  removeLogo = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.removeLogo(Number(id));
    reply.status(204).send();
  };
}
