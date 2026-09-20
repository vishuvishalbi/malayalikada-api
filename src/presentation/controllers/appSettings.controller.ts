import { FastifyRequest, FastifyReply } from 'fastify';
import { AppSettingsService } from '../../application/appSettings/AppSettingsService';
import { updateAppSettingsSchema } from '../schemas/appSettings.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class AppSettingsController {
  constructor(private service: AppSettingsService) {}

  get = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.get());
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = updateAppSettingsSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.update(parsed.data));
  };
}
