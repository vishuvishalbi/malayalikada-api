import { FastifyInstance } from 'fastify';
import { AppSettingsController } from '../controllers/appSettings.controller';
import { AppSettingsService } from '../../application/appSettings/AppSettingsService';
import { AppSettingsMysqlRepository } from '../../infrastructure/repositories/AppSettingsMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function appSettingsRoutes(app: FastifyInstance) {
  const service = new AppSettingsService(new AppSettingsMysqlRepository());
  const ctrl = new AppSettingsController(service);

  app.get('/settings', ctrl.get);
  app.put('/settings', { preHandler: [authenticate, requireRole('admin')] }, ctrl.update);
}
