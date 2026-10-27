import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; role: string; storeIds: number[]; jti?: string };
    user: { sub: number; role: string; storeIds: number[]; jti?: string; permissions?: string[] };
  }
}
