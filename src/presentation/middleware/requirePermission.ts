import { FastifyRequest, FastifyReply } from 'fastify';

/** Staff permissions are loaded per request by `authenticate`; customers never carry any. */
export function requirePermission(code: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user.permissions?.includes(code)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}
