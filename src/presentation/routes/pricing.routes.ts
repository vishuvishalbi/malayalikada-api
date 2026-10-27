import { FastifyInstance } from 'fastify';
import { PricingController } from '../controllers/pricing.controller';
import { PricingService } from '../../application/pricing/PricingService';
import { PricingMysqlRepository } from '../../infrastructure/repositories/PricingMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';

export async function pricingRoutes(app: FastifyInstance) {
  const service = new PricingService(new PricingMysqlRepository());
  const ctrl = new PricingController(service);

  app.get('/pricing', { preHandler: [authenticate, requirePermission('pricing:read')] }, ctrl.list);
  app.post('/pricing', { preHandler: [authenticate, requirePermission('pricing:write')] }, ctrl.set);
  app.put('/pricing/:productId/:storeId', { preHandler: [authenticate, requirePermission('pricing:write')] }, ctrl.update);
}
