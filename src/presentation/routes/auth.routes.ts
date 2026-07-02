import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../../application/auth/AuthService';
import { CustomerMysqlRepository } from '../../infrastructure/repositories/CustomerMysqlRepository';
import { StaffMysqlRepository } from '../../infrastructure/repositories/StaffMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { registerSchema, loginSchema, resetPasswordSchema } from '../schemas/auth.schema';
import { toSchema } from '../../infrastructure/plugins/swagger';

export async function authRoutes(app: FastifyInstance) {
  const service = new AuthService(
    new CustomerMysqlRepository(),
    new StaffMysqlRepository(),
  );
  const controller = new AuthController(service);

  app.get('/auth/captcha', {
    schema: { tags: ['Auth'] },
  }, controller.getCaptcha);

  app.post('/auth/register', {
    schema: { body: toSchema(registerSchema), tags: ['Auth'] },
  }, controller.register);

  app.post('/auth/login', {
    schema: { body: toSchema(loginSchema), tags: ['Auth'] },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, controller.login);

  app.get('/auth/me', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    preHandler: [authenticate],
  }, controller.me);

  app.post('/auth/refresh', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    preHandler: [authenticate],
  }, controller.refresh);

  app.put('/auth/preferred-store', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    preHandler: [authenticate, requireRole('customer')],
  }, controller.setPreferredStore);

  app.post('/auth/admin/reset-password', {
    schema: { body: toSchema(resetPasswordSchema), security: [{ bearerAuth: [] }], tags: ['Auth'] },
    preHandler: [authenticate, requireRole('admin')],
  }, controller.adminResetPassword);

  app.put('/auth/me', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    preHandler: [authenticate, requireRole('customer')],
  }, controller.updateMe);

  app.put('/auth/password', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    preHandler: [authenticate, requireRole('customer')],
  }, controller.changePassword);
}
