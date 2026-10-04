import { FastifyRequest, FastifyReply } from 'fastify';
import { tokenService } from '../../infrastructure/auth/tokenRegistry';
import { tokenUserTypeFor } from '../../domain/entities/AuthToken';

export async function optionalAuthenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return; // unauthenticated is fine
  }
  try {
    const { sub, role, jti } = request.user;
    if (jti && (await tokenService.isActive(jti, tokenUserTypeFor(role), sub))) return;
  } catch {
    // registry unavailable: serve the public route as a guest rather than fail it
  }
  request.user = null as never; // revoked, legacy or unverifiable token: guest
}
