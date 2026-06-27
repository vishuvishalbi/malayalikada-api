import { z } from 'zod';

export const createStaffSchema = z.object({
  identifier: z.string().min(1),
  identifier_type: z.enum(['email', 'mobile']),
  password: z.string().min(8),
  name: z.string().min(1).max(150),
  role: z.enum(['worker', 'admin']),
  store_ids: z.array(z.number().int().positive()).optional(),
});

export const updateStaffSchema = z.object({
  name: z.string().max(150).optional(),
  role: z.enum(['worker', 'admin']).optional(),
  is_active: z.boolean().optional(),
  store_ids: z.array(z.number().int().positive()).optional(),
});

export const customerListQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
