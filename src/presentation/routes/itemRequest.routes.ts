import { FastifyInstance } from 'fastify';
import { ItemRequestController } from '../controllers/itemRequest.controller';
import { ItemRequestService } from '../../application/itemRequests/ItemRequestService';
import { ItemRequestMysqlRepository } from '../../infrastructure/repositories/ItemRequestMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function itemRequestRoutes(app: FastifyInstance) {
  const service = new ItemRequestService(new ItemRequestMysqlRepository());
  const ctrl = new ItemRequestController(service);

  app.post('/item-requests', { preHandler: [authenticate, requireRole('customer')] }, ctrl.submit);
  app.get('/item-requests', { preHandler: [authenticate, requireRole('customer')] }, ctrl.customerList);
  app.get('/item-requests/admin', { preHandler: [authenticate, requireRole('admin')] }, ctrl.adminList);
  app.put('/item-requests/:id/status', { preHandler: [authenticate, requireRole('admin')] }, ctrl.updateStatus);
}
