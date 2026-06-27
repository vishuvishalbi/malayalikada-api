import { FastifyRequest, FastifyReply } from 'fastify';
import { CategoryService } from '../../application/categories/CategoryService';
import { createCategorySchema, updateCategorySchema } from '../schemas/category.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class CategoryController {
  constructor(private service: CategoryService) {}

  list = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.list());
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createCategorySchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.create(parsed.data));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateCategorySchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.update(Number(id), parsed.data));
  };

  softDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.softDelete(Number(id));
    reply.status(204).send();
  };

  uploadImage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();
    if (!data) throw new ValidationError('No file uploaded');
    const buffer = await data.toBuffer();
    reply.send(await this.service.uploadImage(Number(id), buffer, data.filename));
  };

  removeImage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.removeImage(Number(id));
    reply.status(204).send();
  };
}
