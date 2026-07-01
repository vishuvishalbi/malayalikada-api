import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import { config } from './shared/config';
import { AppError } from './shared/errors/AppError';
import swaggerPlugin from './infrastructure/plugins/swagger';
import { authRoutes } from './presentation/routes/auth.routes';
import { storeRoutes } from './presentation/routes/store.routes';
import { categoryRoutes } from './presentation/routes/category.routes';
import { productRoutes } from './presentation/routes/product.routes';
import { stockRoutes } from './presentation/routes/stock.routes';
import { pricingRoutes } from './presentation/routes/pricing.routes';
import { cartRoutes } from './presentation/routes/cart.routes';
import { orderRoutes } from './presentation/routes/order.routes';
import { paymentRoutes } from './presentation/routes/payment.routes';
import { itemRequestRoutes } from './presentation/routes/itemRequest.routes';
import { adminRoutes } from './presentation/routes/admin.routes';
import { bannerRoutes } from './presentation/routes/banner.routes';
import { notifyRequestRoutes } from './presentation/routes/notifyRequest.routes';
import { favoriteRoutes } from './presentation/routes/favorite.routes';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino/file',
      options: { destination: './logs/app.log', mkdir: true },
    },
  },
});

app.register(swaggerPlugin);
app.register(cors, { origin: config.corsOrigin });
app.register(jwt, { secret: config.jwtSecret });
app.register(rateLimit, { global: false });
app.register(multipart);
app.register(staticFiles, {
  root: path.resolve(process.cwd(), 'uploads'),
  prefix: '/uploads/',
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      ...(error.data !== undefined && { data: error.data }),
    });
  }
  app.log.error(error);
  return reply.status(500).send({ error: 'Internal server error' });
});

app.register(authRoutes, { prefix: '/api/v1' });
app.register(storeRoutes, { prefix: '/api/v1' });
app.register(categoryRoutes, { prefix: '/api/v1' });
app.register(productRoutes, { prefix: '/api/v1' });
app.register(stockRoutes, { prefix: '/api/v1' });
app.register(pricingRoutes, { prefix: '/api/v1' });
app.register(cartRoutes, { prefix: '/api/v1' });
app.register(orderRoutes, { prefix: '/api/v1' });
app.register(paymentRoutes, { prefix: '/api/v1' });
app.register(itemRequestRoutes, { prefix: '/api/v1' });
app.register(adminRoutes, { prefix: '/api/v1' });
app.register(bannerRoutes, { prefix: '/api/v1' });
app.register(notifyRequestRoutes, { prefix: '/api/v1' });
app.register(favoriteRoutes, { prefix: '/api/v1' });

app.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
