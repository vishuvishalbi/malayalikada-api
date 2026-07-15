import { FastifyRequest, FastifyReply } from 'fastify';
import { CartService } from '../../application/cart/CartService';
import { addItemSchema, setItemSchema } from '../schemas/cart.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class CartController {
  constructor(private service: CartService) {}

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.get(request.user.sub));
  };

  addItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = addItemSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    await this.service.addItem(request.user.sub, parsed.data.product_id, parsed.data.quantity);
    reply.status(201).send(await this.service.get(request.user.sub));
  };

  setItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = request.params as { productId: string };
    const parsed = setItemSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    await this.service.setItem(request.user.sub, Number(productId), parsed.data.quantity);
    reply.send(await this.service.get(request.user.sub));
  };

  removeItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = request.params as { productId: string };
    await this.service.removeItem(request.user.sub, Number(productId));
    reply.status(204).send();
  };

  clear = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.clear(request.user.sub);
    reply.status(204).send();
  };
}
