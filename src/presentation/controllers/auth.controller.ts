import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../../application/auth/AuthService';
import { registerSchema, loginSchema, resetPasswordSchema } from '../schemas/auth.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class AuthController {
  constructor(private service: AuthService) {}

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    const result = await this.service.register(
      parsed.data.identifier,
      parsed.data.identifier_type,
      parsed.data.password,
      parsed.data.first_name,
      parsed.data.last_name,
      (payload) => (request.server.jwt.sign as (p: object) => string)(payload),
    );
    reply.status(201).send(result);
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    const result = await this.service.login(
      parsed.data.identifier,
      parsed.data.password,
      (payload) => request.server.jwt.sign(payload as Parameters<typeof request.server.jwt.sign>[0]),
    );
    reply.send(result);
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.me(
      request.user.sub,
      request.user.role,
      (payload) => (request.server.jwt.sign as (p: object) => string)(payload),
    );
    reply.send(result);
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.server.jwt.sign({
      sub: request.user.sub,
      role: request.user.role,
      storeIds: request.user.storeIds,
    });
    reply.send({ token });
  };

  adminResetPassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    await this.service.adminResetPassword(
      request.user.sub,
      parsed.data.target_id,
      parsed.data.new_password,
      parsed.data.target_type,
    );
    reply.send({ message: 'Password reset successful' });
  };
}
