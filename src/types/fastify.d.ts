import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; role: 'customer' | 'worker' | 'admin'; storeIds: number[] };
    user: { sub: number; role: 'customer' | 'worker' | 'admin'; storeIds: number[] };
  }
}
