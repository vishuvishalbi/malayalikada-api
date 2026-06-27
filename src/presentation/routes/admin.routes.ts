import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { AdminService } from '../../application/admin/AdminService';
import { StaffMysqlRepository } from '../../infrastructure/repositories/StaffMysqlRepository';
import { CustomerMysqlRepository } from '../../infrastructure/repositories/CustomerMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function adminRoutes(app: FastifyInstance) {
  const service = new AdminService(
    new StaffMysqlRepository(),
    new CustomerMysqlRepository(),
  );
  const ctrl = new AdminController(service);

  const adminOnly = [authenticate, requireRole('admin')];

  app.get('/admin/dashboard', { preHandler: adminOnly }, ctrl.dashboard);
  app.get('/admin/staff', { preHandler: adminOnly }, ctrl.listStaff);
  app.post('/admin/staff', { preHandler: adminOnly }, ctrl.createStaff);
  app.put('/admin/staff/:id', { preHandler: adminOnly }, ctrl.updateStaff);
  app.get('/admin/customers', { preHandler: adminOnly }, ctrl.listCustomers);
  app.get('/admin/customers/:id', { preHandler: adminOnly }, ctrl.getCustomer);
}
