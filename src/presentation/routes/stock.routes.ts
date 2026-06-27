import { FastifyInstance } from 'fastify';
import { StockController } from '../controllers/stock.controller';
import { StockService } from '../../application/stock/StockService';
import { StockMysqlRepository } from '../../infrastructure/repositories/StockMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function stockRoutes(app: FastifyInstance) {
  const service = new StockService(new StockMysqlRepository());
  const ctrl = new StockController(service);

  app.get('/stock', { preHandler: [authenticate, requireRole('admin')] }, ctrl.list);
  app.put('/stock', { preHandler: [authenticate, requireRole('admin')] }, ctrl.set);
}
