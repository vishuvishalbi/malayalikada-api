import { FastifyInstance } from 'fastify';
import { PaymentController } from '../controllers/payment.controller';
import { PaymentService } from '../../application/payments/PaymentService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function paymentRoutes(app: FastifyInstance) {
  const service = new PaymentService();
  const ctrl = new PaymentController(service);

  app.post('/payments/create-intent', { preHandler: [authenticate, requireRole('customer')] }, ctrl.createIntent);
  app.post('/payments/webhook', ctrl.webhook);
}
