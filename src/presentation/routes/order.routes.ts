import { FastifyInstance } from 'fastify';
import { OrderController } from '../controllers/order.controller';
import { OrderService } from '../../application/orders/OrderService';
import { OrderMysqlRepository } from '../../infrastructure/repositories/OrderMysqlRepository';
import { CartMysqlRepository } from '../../infrastructure/repositories/CartMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function orderRoutes(app: FastifyInstance) {
  const service = new OrderService(
    new OrderMysqlRepository(),
    new CartMysqlRepository(),
  );
  const ctrl = new OrderController(service);

  // Static paths first (before /:id)
  app.get('/orders/worker/queue', { preHandler: [authenticate, requireRole('worker', 'admin')] }, ctrl.workerQueue);
  app.get('/orders/admin', { preHandler: [authenticate, requireRole('admin')] }, ctrl.adminList);
  app.get('/orders/admin/export', { preHandler: [authenticate, requireRole('admin')] }, ctrl.adminExportCsv);

  // Customer routes
  app.post('/orders', { preHandler: [authenticate, requireRole('customer')] }, ctrl.submit);
  app.get('/orders', { preHandler: [authenticate, requireRole('customer')] }, ctrl.customerHistory);
  app.get('/orders/:id', { preHandler: [authenticate, requireRole('customer')] }, ctrl.customerDetail);

  // Worker/admin action routes
  app.put('/orders/:id/approve', { preHandler: [authenticate, requireRole('worker', 'admin')] }, ctrl.approve);
  app.put('/orders/:id/reject', { preHandler: [authenticate, requireRole('worker', 'admin')] }, ctrl.reject);
}
