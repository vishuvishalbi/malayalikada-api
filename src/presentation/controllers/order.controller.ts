import { FastifyRequest, FastifyReply } from 'fastify';
import { OrderService } from '../../application/orders/OrderService';
import { rejectOrderSchema, adminOrderQuerySchema, customerOrderQuerySchema, exportQuerySchema } from '../schemas/order.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class OrderController {
  constructor(private service: OrderService) {}

  submit = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(201).send(await this.service.submit(request.user.sub));
  };

  customerHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = customerOrderQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    reply.send(await this.service.customerHistory(request.user.sub, parsed.data.page, parsed.data.limit));
  };

  customerDetail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(await this.service.customerDetail(request.user.sub, Number(id)));
  };

  workerQueue = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.workerQueue(request.user.storeIds));
  };

  approve = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(await this.service.approve(Number(id), request.user.sub));
  };

  reject = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = rejectOrderSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.reject(Number(id), request.user.sub, parsed.data.reason));
  };

  adminList = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = adminOrderQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    reply.send(await this.service.adminList(parsed.data));
  };

  adminExportCsv = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const csv = await this.service.adminExportCsv(parsed.data);
    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="orders.csv"')
      .send(csv);
  };
}
