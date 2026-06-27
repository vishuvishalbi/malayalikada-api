import { FastifyInstance } from 'fastify';
import { BannerController } from '../controllers/banner.controller';
import { BannerService } from '../../application/banners/BannerService';
import { BannerMysqlRepository } from '../../infrastructure/repositories/BannerMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function bannerRoutes(app: FastifyInstance) {
  const service = new BannerService(new BannerMysqlRepository());
  const ctrl = new BannerController(service);

  app.get('/banners', ctrl.list);
  app.post('/banners', { preHandler: [authenticate, requireRole('admin')] }, ctrl.create);
  app.put('/banners/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.update);
  app.post('/banners/:id/image', { preHandler: [authenticate, requireRole('admin')] }, ctrl.uploadImage);
  app.delete('/banners/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.deactivate);
}
