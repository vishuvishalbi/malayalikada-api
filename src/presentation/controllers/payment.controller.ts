import { FastifyRequest, FastifyReply } from 'fastify';
import { PaymentService } from '../../application/payments/PaymentService';
import { createIntentSchema } from '../schemas/payment.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class PaymentController {
  constructor(private service: PaymentService) {}

  createIntent = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createIntentSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.createIntent(parsed.data.order_id, parsed.data.amount_nzd));
  };

  webhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const sig = (request.headers['stripe-signature'] as string) || '';
    await this.service.handleWebhook(request.body as Buffer, sig);
    reply.send({ received: true });
  };
}
