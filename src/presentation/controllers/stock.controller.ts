import { FastifyRequest, FastifyReply } from 'fastify';
import { StockService } from '../../application/stock/StockService';
import { stockQuerySchema, setStockSchema } from '../schemas/stock.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class StockController {
  constructor(private service: StockService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = stockQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    reply.send(await this.service.list(parsed.data));
  };

  set = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = setStockSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.set(
      parsed.data.product_id,
      parsed.data.store_id,
      parsed.data.quantity,
      parsed.data.low_stock_threshold,
    ));
  };
}
