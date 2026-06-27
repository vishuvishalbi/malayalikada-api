import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../../application/auth/AuthService';
import { CustomerMysqlRepository } from '../../infrastructure/repositories/CustomerMysqlRepository';
import { StaffMysqlRepository } from '../../infrastructure/repositories/StaffMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function authRoutes(app: FastifyInstance) {
  const service = new AuthService(
    new CustomerMysqlRepository(),
    new StaffMysqlRepository(),
  );
  const controller = new AuthController(service);

  app.post('/auth/register', controller.register);
  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, controller.login);
  app.get('/auth/me', { preHandler: [authenticate] }, controller.me);
  app.post('/auth/refresh', { preHandler: [authenticate] }, controller.refresh);
  app.post('/auth/admin/reset-password', { preHandler: [authenticate, requireRole('admin')] }, controller.adminResetPassword);
}
