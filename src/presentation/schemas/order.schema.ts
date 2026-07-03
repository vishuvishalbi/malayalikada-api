import { z } from 'zod';

export const rejectOrderSchema = z.object({
  reason: z.string().min(1),
});

export const adminOrderQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending_approval', 'approved', 'rejected']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const customerOrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const exportQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const workerCompletedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
