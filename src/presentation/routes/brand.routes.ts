import { FastifyInstance } from 'fastify';
import { BrandController } from '../controllers/brand.controller';
import { BrandService } from '../../application/brands/BrandService';
import { BrandMysqlRepository } from '../../infrastructure/repositories/BrandMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function brandRoutes(app: FastifyInstance) {
  const ctrl = new BrandController(new BrandService(new BrandMysqlRepository()));
  const admin = { preHandler: [authenticate, requireRole('admin')] };

  app.get('/brands', ctrl.list);
  app.post('/brands', admin, ctrl.create);
  app.put('/brands/:id', admin, ctrl.update);
  app.delete('/brands/:id', admin, ctrl.softDelete);
}
