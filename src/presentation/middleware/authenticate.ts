import { FastifyRequest, FastifyReply } from 'fastify';
import { StaffMysqlRepository } from '../../infrastructure/repositories/StaffMysqlRepository';
import { tokenService } from '../../infrastructure/auth/tokenRegistry';
import { tokenUserTypeFor } from '../../domain/entities/AuthToken';

const staffRepo = new StaffMysqlRepository();

// Every token must still be registered to the user it names (TokenService);
// that is what makes a deleted account's 30-day JWTs useless. Registry errors
// propagate as 500s, not 401s, so a DB blip doesn't log the app out.
//
// Staff/admin JWTs carry is_active and storeIds as of login/refresh time and
// are valid for 30 days — deactivating a staff member or reassigning their
// stores does nothing to an already-issued token unless this per-request
// check catches it. Customers have no is_active/storeIds concept, so only
// staff/admin pay this extra lookup.
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const { sub, role, jti } = request.user;
  if (!jti || !(await tokenService.isActive(jti, tokenUserTypeFor(role), sub))) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (role === 'worker' || role === 'admin') {
    const staff = await staffRepo.findById(sub);
    if (!staff || !staff.is_active) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    request.user.storeIds = staff.store_ids ?? [];
  }
}
