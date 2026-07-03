import { FastifyRequest, FastifyReply } from 'fastify';
import { OrderService } from '../../application/orders/OrderService';
import {
  rejectOrderSchema,
  adminOrderQuerySchema,
  customerOrderQuerySchema,
  exportQuerySchema,
  workerCompletedQuerySchema,
} from '../schemas/order.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class OrderController {
  constructor(private service: OrderService) {}

  submit = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(201).send(await this.service.submit(request.user.sub));
  };

  customerHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = customerOrderQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const { orders, total } = await this.service.customerHistory(request.user.sub, parsed.data.page, parsed.data.limit);
    reply.send({ orders, total });
  };

  customerDetail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const order = await this.service.customerDetail(request.user.sub, Number(id));
    const { orderItems, ...rest } = order as any;
    reply.send({ ...rest, items: orderItems ?? [] });
  };

  workerQueue = async (request: FastifyRequest, reply: FastifyReply) => {
    const orders = await this.service.workerQueue(request.user.storeIds);
    reply.send(orders);
  };

  workerCompleted = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = workerCompletedQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    // admins get all stores (null); workers get their storeIds
    const storeIds = request.user.role === 'admin' ? null : request.user.storeIds;
    const { orders, total } = await this.service.workerCompleted(storeIds, parsed.data.page, parsed.data.limit);
    reply.send({ orders, total });
  };

  approve = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(await this.service.approve(Number(id), request.user.sub, request.user.role, request.user.storeIds));
  };

  reject = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = rejectOrderSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.reject(Number(id), request.user.sub, parsed.data.reason, request.user.role, request.user.storeIds));
  };

  adminList = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = adminOrderQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const { orders, total } = await this.service.adminList(parsed.data);
    reply.send({ orders, total });
  };

  adminDetail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const order = await this.service.adminDetail(Number(id), request.user.role, request.user.storeIds);
    reply.send(order);
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
