import { FastifyRequest, FastifyReply } from 'fastify';
import { AdminService } from '../../application/admin/AdminService';
import { createStaffSchema, updateStaffSchema, customerListQuerySchema } from '../schemas/admin.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class AdminController {
  constructor(private service: AdminService) {}

  dashboard = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.dashboard());
  };

  listStaff = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.listStaff());
  };

  createStaff = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createStaffSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.createStaff(parsed.data));
  };

  updateStaff = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateStaffSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.updateStaff(Number(id), parsed.data));
  };

  listCustomers = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = customerListQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    reply.send(await this.service.listCustomers(parsed.data.search, parsed.data.page, parsed.data.limit));
  };

  getCustomer = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(await this.service.getCustomer(Number(id)));
  };
}
