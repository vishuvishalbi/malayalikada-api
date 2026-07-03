import { FastifyInstance } from 'fastify';
import { CartController } from '../controllers/cart.controller';
import { CartService } from '../../application/cart/CartService';
import { CartMysqlRepository } from '../../infrastructure/repositories/CartMysqlRepository';
import { DeliveryService } from '../../application/delivery/DeliveryService';
import { DeliverySlabMysqlRepository } from '../../infrastructure/repositories/DeliverySlabMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function cartRoutes(app: FastifyInstance) {
  const deliveryService = new DeliveryService(new DeliverySlabMysqlRepository());
  const service = new CartService(new CartMysqlRepository(), deliveryService);
  const ctrl = new CartController(service);

  const preHandler = [authenticate, requireRole('customer')];

  app.get('/cart', { preHandler }, ctrl.get);
  app.post('/cart/items', { preHandler }, ctrl.addItem);
  app.put('/cart/items/:productId', { preHandler }, ctrl.setItem);
  app.delete('/cart/items/:productId', { preHandler }, ctrl.removeItem);
  app.delete('/cart', { preHandler }, ctrl.clear);
}
