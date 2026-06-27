import { FastifyRequest, FastifyReply } from 'fastify';
import { BannerService } from '../../application/banners/BannerService';
import { createBannerSchema, updateBannerSchema } from '../schemas/banner.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class BannerController {
  constructor(private service: BannerService) {}

  list = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.list());
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBannerSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.create(parsed.data));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateBannerSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.update(Number(id), parsed.data));
  };

  uploadImage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();
    if (!data) throw new ValidationError('No file uploaded');
    const buffer = await data.toBuffer();
    reply.send(await this.service.uploadImage(Number(id), buffer, data.filename));
  };

  deactivate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.deactivate(Number(id));
    reply.status(204).send();
  };
}
