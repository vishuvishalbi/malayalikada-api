import { FastifyRequest, FastifyReply } from 'fastify';
import { ProductReviewService } from '../../application/reviews/ProductReviewService';
import { createReviewSchema } from '../schemas/review.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class ReviewController {
  constructor(private service: ProductReviewService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(await this.service.list(Number(id)));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = createReviewSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(
      await this.service.create(request.user.sub, Number(id), parsed.data.rating, parsed.data.comment)
    );
  };
}
