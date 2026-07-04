import { FastifyRequest, FastifyReply } from 'fastify';

export async function optionalAuthenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    // unauthenticated is fine
  }
}
