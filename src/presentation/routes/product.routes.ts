import { FastifyInstance } from 'fastify';
import { ProductController } from '../controllers/product.controller';
import { ProductService } from '../../application/products/ProductService';
import { ProductMysqlRepository } from '../../infrastructure/repositories/ProductMysqlRepository';
import { CsvImportService } from '../../application/products/CsvImportService';
import { CsvImportLogRepository } from '../../infrastructure/repositories/CsvImportLogRepository';
import { authenticate } from '../middleware/authenticate';
import { optionalAuthenticate } from '../middleware/optionalAuthenticate';
import { requireRole } from '../middleware/requireRole';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError';

export async function productRoutes(app: FastifyInstance) {
  const service = new ProductService(new ProductMysqlRepository());
  const ctrl = new ProductController(service);

  // Public — static segments must come BEFORE /:id
  app.get('/products/brands', { preHandler: [optionalAuthenticate] }, ctrl.brands);
  app.get('/products/barcode/:barcode', { preHandler: [optionalAuthenticate] }, ctrl.getByBarcode);
  app.get('/products/trending', { preHandler: [optionalAuthenticate] }, ctrl.trending);
  app.get('/products', { preHandler: [optionalAuthenticate] }, ctrl.list);
  app.get('/products/:id', { preHandler: [optionalAuthenticate] }, ctrl.getById);

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

  // Shopify CSV import
  const { ShopifyCsvImportService } = await import('../../application/products/ShopifyCsvImportService');
  const shopifyImportService = new ShopifyCsvImportService();

  app.post('/products/import/shopify-csv', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (request, reply) => {
    const { store_id } = request.query as { store_id?: string };
    if (!store_id || isNaN(Number(store_id))) {
      throw new ValidationError('store_id query param is required');
    }
    const storeId = Number(store_id);

    const parts = request.parts();
    let productBuffer: Buffer | null = null;
    let productFilename = 'shopify-products.csv';
    let inventoryBuffer: Buffer | undefined;

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'products') {
        productBuffer = await part.toBuffer();
        productFilename = part.filename || productFilename;
      } else if (part.type === 'file' && part.fieldname === 'inventory') {
        inventoryBuffer = await part.toBuffer();
      }
    }

    if (!productBuffer) {
      throw new ValidationError('products file is required');
    }

    const log = await shopifyImportService.importProducts(
      productBuffer,
      productFilename,
      storeId,
      request.user.sub,
      inventoryBuffer,
    );

    reply.send(log);
  });

  // Reviews
  const { ProductReviewService } = await import('../../application/reviews/ProductReviewService');
  const { ProductReviewMysqlRepository } = await import('../../infrastructure/repositories/ProductReviewMysqlRepository');
  const { ReviewController } = await import('../controllers/review.controller');
  const reviewCtrl = new ReviewController(new ProductReviewService(new ProductReviewMysqlRepository()));

  app.get('/products/:id/reviews', reviewCtrl.list);
  app.post('/products/:id/reviews', { preHandler: [authenticate, requireRole('customer')] }, reviewCtrl.create);
}
