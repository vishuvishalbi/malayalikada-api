import { FastifyInstance } from 'fastify';
import { FavoriteController } from '../controllers/favorite.controller';
import { FavoriteService } from '../../application/favorites/FavoriteService';
import { FavoriteMysqlRepository } from '../../infrastructure/repositories/FavoriteMysqlRepository';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export async function favoriteRoutes(app: FastifyInstance) {
  const ctrl = new FavoriteController(new FavoriteService(new FavoriteMysqlRepository()));

  app.get('/favorites', { preHandler: [authenticate, requireRole('customer')] }, ctrl.list);
  app.post('/favorites', { preHandler: [authenticate, requireRole('customer')] }, ctrl.add);
  app.delete('/favorites/:productId', { preHandler: [authenticate, requireRole('customer')] }, ctrl.remove);
}
