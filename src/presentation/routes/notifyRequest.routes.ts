import { FastifyInstance } from 'fastify';
import { NotifyRequestController } from '../controllers/notifyRequest.controller';
import { NotifyRequestService } from '../../application/notifyRequests/NotifyRequestService';
import { NotifyRequestMysqlRepository } from '../../infrastructure/repositories/NotifyRequestMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function notifyRequestRoutes(app: FastifyInstance) {
  const ctrl = new NotifyRequestController(new NotifyRequestService(new NotifyRequestMysqlRepository()));

  app.post('/notify-me', { preHandler: [authenticate, requireRole('customer')] }, ctrl.create);
}
