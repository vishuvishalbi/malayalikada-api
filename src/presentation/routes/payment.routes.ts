import { FastifyInstance } from 'fastify';
import { PaymentController } from '../controllers/payment.controller';
import { PaymentService } from '../../application/payments/PaymentService';

export async function paymentRoutes(app: FastifyInstance) {
  const service = new PaymentService();
  const ctrl = new PaymentController(service);

  app.post('/payments/webhook', {
    config: { rateLimit: { max: 200, timeWindow: '1 minute' } },
  }, ctrl.webhook);
}
