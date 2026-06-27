import { FastifyInstance } from 'fastify';
import { PricingController } from '../controllers/pricing.controller';
import { PricingService } from '../../application/pricing/PricingService';
import { PricingMysqlRepository } from '../../infrastructure/repositories/PricingMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function pricingRoutes(app: FastifyInstance) {
  const service = new PricingService(new PricingMysqlRepository());
  const ctrl = new PricingController(service);

  app.get('/pricing', { preHandler: [authenticate, requireRole('admin')] }, ctrl.list);
  app.post('/pricing', { preHandler: [authenticate, requireRole('admin')] }, ctrl.set);
  app.put('/pricing/:productId/:storeId', { preHandler: [authenticate, requireRole('admin')] }, ctrl.update);
}
