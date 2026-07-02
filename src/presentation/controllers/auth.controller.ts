import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../../application/auth/AuthService';
import { registerSchema, loginSchema, resetPasswordSchema } from '../schemas/auth.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class AuthController {
  constructor(private service: AuthService) {}

  getCaptcha = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send(this.service.generateCaptcha());
  };

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    const result = await this.service.register(
      parsed.data,
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

  setPreferredStore = async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.body as { store_id: number };
    if (!store_id || typeof store_id !== 'number') throw new ValidationError('store_id is required');
    const result = await this.service.setPreferredStore(request.user.sub, store_id);
    reply.send(result);
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

  updateMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const { first_name, last_name, address, phone } = request.body as {
      first_name?: string; last_name?: string; address?: string; phone?: string;
    };
    const user = await this.service.updateProfile(request.user.sub, { first_name, last_name, address, phone });
    reply.send({ user });
  };

  changePassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const { old_password, new_password } = request.body as { old_password: string; new_password: string };
    await this.service.changePassword(request.user.sub, old_password, new_password);
    reply.send({ message: 'Password updated' });
  };
}
