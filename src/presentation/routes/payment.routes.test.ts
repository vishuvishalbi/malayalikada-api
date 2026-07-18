import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { paymentRoutes } from './payment.routes';

describe('payment routes', () => {
  it('does not expose POST /payments/create-intent', async () => {
    const app = Fastify();
    // Minimal jwt decorator stub so the plugin registers without a secret.
    app.decorateRequest('user', null);
    await app.register(paymentRoutes, { prefix: '/api/v1' });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/api/v1/payments/create-intent', payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
