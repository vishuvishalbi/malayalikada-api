import { z } from 'zod';

export const submitRequestSchema = z.object({
  product_name: z.string().min(1).max(200),
  barcode: z.string().max(50).optional(),
  notes: z.string().optional(),
});

export const adminUpdateSchema = z.object({
  status: z.enum(['new', 'sourced', 'declined']),
  admin_notes: z.string().optional(),
});

export const adminListQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['new', 'sourced', 'declined']).optional(),
});
