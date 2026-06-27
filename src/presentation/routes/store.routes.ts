import { FastifyInstance } from 'fastify';
import { StoreController } from '../controllers/store.controller';
import { StoreService } from '../../application/stores/StoreService';
import { StoreMysqlRepository } from '../../infrastructure/repositories/StoreMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function storeRoutes(app: FastifyInstance) {
  const service = new StoreService(new StoreMysqlRepository());
  const ctrl = new StoreController(service);

  app.get('/stores', ctrl.list);
  app.get('/stores/:id', ctrl.getById);
  app.post('/stores', { preHandler: [authenticate, requireRole('admin')] }, ctrl.create);
  app.put('/stores/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.update);
  app.post('/stores/:id/logo', { preHandler: [authenticate, requireRole('admin')] }, ctrl.uploadLogo);
  app.delete('/stores/:id/logo', { preHandler: [authenticate, requireRole('admin')] }, ctrl.removeLogo);
}
