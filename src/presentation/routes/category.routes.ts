import { FastifyInstance } from 'fastify';
import { CategoryController } from '../controllers/category.controller';
import { CategoryService } from '../../application/categories/CategoryService';
import { CategoryMysqlRepository } from '../../infrastructure/repositories/CategoryMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function categoryRoutes(app: FastifyInstance) {
  const service = new CategoryService(new CategoryMysqlRepository());
  const ctrl = new CategoryController(service);

  app.get('/categories', ctrl.list);
  app.post('/categories', { preHandler: [authenticate, requireRole('admin')] }, ctrl.create);
  app.put('/categories/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.update);
  app.delete('/categories/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.softDelete);
  app.post('/categories/:id/image', { preHandler: [authenticate, requireRole('admin')] }, ctrl.uploadImage);
  app.delete('/categories/:id/image', { preHandler: [authenticate, requireRole('admin')] }, ctrl.removeImage);
}
