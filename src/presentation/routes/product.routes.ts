import { FastifyInstance } from 'fastify';
import { ProductController } from '../controllers/product.controller';
import { ProductService } from '../../application/products/ProductService';
import { ProductMysqlRepository } from '../../infrastructure/repositories/ProductMysqlRepository';
import { CsvImportService } from '../../application/products/CsvImportService';
import { CsvImportLogRepository } from '../../infrastructure/repositories/CsvImportLogRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError';

export async function productRoutes(app: FastifyInstance) {
  const service = new ProductService(new ProductMysqlRepository());
  const ctrl = new ProductController(service);

  // Public — barcode must come BEFORE /:id
  app.get('/products/barcode/:barcode', ctrl.getByBarcode);
  app.get('/products', ctrl.list);
  app.get('/products/:id', ctrl.getById);

  // Admin
  app.post('/products', { preHandler: [authenticate, requireRole('admin')] }, ctrl.create);
  app.put('/products/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.update);
  app.delete('/products/:id', { preHandler: [authenticate, requireRole('admin')] }, ctrl.softDelete);
  app.post('/products/:id/images', { preHandler: [authenticate, requireRole('admin')] }, ctrl.uploadImage);
  app.delete('/products/:id/images/:imageId', { preHandler: [authenticate, requireRole('admin')] }, ctrl.removeImage);

  // CSV import routes
  const csvService = new CsvImportService();
  const csvLogs = new CsvImportLogRepository();

  app.post('/products/import/csv', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError('No file uploaded');
    const buffer = await file.toBuffer();
    reply.send(await csvService.importFile(buffer, file.filename, request.user.sub));
  });

  app.get('/products/import/logs', { preHandler: [authenticate, requireRole('admin')] }, async (_req, reply) => {
    reply.send(await csvLogs.findAll());
  });

  app.get('/products/import/:importId/errors', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const log = await csvLogs.findById(Number(importId));
    if (!log || !log.error_report_filename) throw new NotFoundError('Error report not found');
    reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="${log.error_report_filename}"`);
    const fs = await import('fs/promises');
    const path = await import('path');
    const content = await fs.readFile(path.resolve(process.cwd(), 'uploads', log.error_report_filename));
    reply.send(content);
  });
}
