import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { AccountController } from '../controllers/account.controller';
import { AuthService } from '../../application/auth/AuthService';
import { AccountDeletionService } from '../../application/account/AccountDeletionService';
import { CustomerMysqlRepository } from '../../infrastructure/repositories/CustomerMysqlRepository';
import { StaffMysqlRepository } from '../../infrastructure/repositories/StaffMysqlRepository';
import { AccountDeletionMysqlRepository } from '../../infrastructure/repositories/AccountDeletionMysqlRepository';
import { tokenService } from '../../infrastructure/auth/tokenRegistry';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { registerSchema, loginSchema, resetPasswordSchema } from '../schemas/auth.schema';
import { toSchema } from '../../infrastructure/plugins/swagger';

export async function authRoutes(app: FastifyInstance) {
  const customers = new CustomerMysqlRepository();
  const service = new AuthService(customers, new StaffMysqlRepository(), tokenService);
  const controller = new AuthController(service);
  const accountController = new AccountController(
    new AccountDeletionService(customers, new AccountDeletionMysqlRepository(), tokenService),
  );

  app.get('/auth/captcha', {
    schema: { tags: ['Auth'] },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, controller.getCaptcha);

  app.post('/auth/register', {
    schema: { body: toSchema(registerSchema), tags: ['Auth'] },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
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
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    preHandler: [authenticate, requireRole('admin')],
  }, controller.adminResetPassword);

  app.put('/auth/me', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    preHandler: [authenticate, requireRole('customer', 'worker', 'admin')],
  }, controller.updateMe);

  // POST, not DELETE: a body (the password) must survive every proxy on the way.
  app.post('/auth/delete-account', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    preHandler: [authenticate, requireRole('customer')],
  }, accountController.deleteAccount);

  app.put('/auth/password', {
    schema: { security: [{ bearerAuth: [] }], tags: ['Auth'] },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    preHandler: [authenticate, requireRole('customer', 'worker', 'admin')],
  }, controller.changePassword);
}
