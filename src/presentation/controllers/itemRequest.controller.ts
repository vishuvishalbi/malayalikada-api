import { FastifyRequest, FastifyReply } from 'fastify';
import { ItemRequestService } from '../../application/itemRequests/ItemRequestService';
import { adminUpdateSchema, adminListQuerySchema } from '../schemas/itemRequest.schema';
import { ValidationError } from '../../shared/errors/AppError';
import { z } from 'zod';

const submitSchema = z.object({
  item_name: z.string().min(1).max(200),
  barcode: z.string().max(50).optional(),
  description: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  store_id: z.number().int().positive().optional(),
});

const STATUS_MAP: Record<string, 'pending' | 'approved' | 'rejected'> = {
  new: 'pending',
  sourced: 'approved',
  declined: 'rejected',
};

function toUiRequest(r: any, includeAdmin = false) {
  const base = {
    id: r.id,
    item_name: r.product_name,
    barcode: r.barcode ?? null,
    description: r.notes ?? null,
    quantity: r.quantity ?? 1,
    status: STATUS_MAP[r.status] ?? r.status,
    created_at: r.created_at,
  };
  if (!includeAdmin) return base;
  return {
    ...base,
    store_id: r.store_id ?? null,
    customer_id: r.customer_id ?? null,
    customer_name: r.customer_name ?? null,
    admin_notes: r.admin_notes ?? null,
  };
}

export class ItemRequestController {
  constructor(private service: ItemRequestService) {}

  submit = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = submitSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    const { item_name, barcode, description, quantity } = parsed.data;
    const result = await this.service.submit(request.user.sub, {
      product_name: item_name,
      barcode,
      notes: description,
      quantity,
    });
    reply.status(201).send(toUiRequest(result));
  };

  customerList = async (request: FastifyRequest, reply: FastifyReply) => {
    const rows = await this.service.customerList(request.user.sub);
    reply.send({ requests: rows.map((r) => toUiRequest(r)) });
  };

  adminList = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = adminListQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const rows = await this.service.adminList(parsed.data.store_id, parsed.data.status);
    reply.send({ requests: rows.map((r) => toUiRequest(r, true)) });
  };

  updateStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = adminUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    const updated = await this.service.updateStatus(Number(id), parsed.data.status, parsed.data.admin_notes);
    reply.send(toUiRequest(updated, true));
  };
}
