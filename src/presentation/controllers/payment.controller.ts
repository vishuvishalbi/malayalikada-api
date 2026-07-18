import { FastifyRequest, FastifyReply } from 'fastify';
import { PaymentService } from '../../application/payments/PaymentService';

export class PaymentController {
  constructor(private service: PaymentService) {}

  webhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const sig = (request.headers['stripe-signature'] as string) || '';
    await this.service.handleWebhook(request.body as Buffer, sig);
    reply.send({ received: true });
  };
}
