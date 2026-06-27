import { FastifyRequest, FastifyReply } from 'fastify';
import { PricingService } from '../../application/pricing/PricingService';
import { pricingQuerySchema, setPricingSchema, updatePricingSchema } from '../schemas/pricing.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class PricingController {
  constructor(private service: PricingService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = pricingQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    reply.send(await this.service.list(parsed.data));
  };

  set = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = setPricingSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.upsert(
      parsed.data.product_id, parsed.data.store_id,
      parsed.data.price_nzd, parsed.data.effective_date,
    ));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId, storeId } = request.params as { productId: string; storeId: string };
    const parsed = updatePricingSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.upsert(
      Number(productId), Number(storeId),
      parsed.data.price_nzd, parsed.data.effective_date,
    ));
  };
}
