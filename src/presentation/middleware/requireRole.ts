import { FastifyRequest, FastifyReply } from 'fastify';

export function requireRole(...roles: Array<'customer' | 'worker' | 'admin'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}
