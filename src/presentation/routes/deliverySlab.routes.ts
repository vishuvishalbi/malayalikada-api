import { FastifyInstance } from 'fastify';
import { DeliverySlabController } from '../controllers/deliverySlab.controller';
import { DeliveryService } from '../../application/delivery/DeliveryService';
import { DeliverySlabMysqlRepository } from '../../infrastructure/repositories/DeliverySlabMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function deliverySlabRoutes(app: FastifyInstance) {
  const service = new DeliveryService(new DeliverySlabMysqlRepository());
  const ctrl = new DeliverySlabController(service);

  app.get('/delivery-slabs', ctrl.list);
  app.post('/delivery-slabs', { preHandler: [authenticate, requireRole('admin')] }, ctrl.create);
  app.put('/delivery-slabs/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.update);
  app.delete('/delivery-slabs/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.remove);
}
