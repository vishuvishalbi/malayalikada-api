import { FastifyRequest, FastifyReply } from 'fastify';
import { FavoriteService } from '../../application/favorites/FavoriteService';
import { addFavoriteSchema } from '../schemas/favorite.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class FavoriteController {
  constructor(private service: FavoriteService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.list(request.user.sub));
  };

  add = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = addFavoriteSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.add(request.user.sub, parsed.data.product_id));
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = request.params as { productId: string };
    await this.service.remove(request.user.sub, Number(productId));
    reply.status(204).send();
  };
}
