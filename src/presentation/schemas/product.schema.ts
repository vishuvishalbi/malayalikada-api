import { z } from 'zod';

export const createProductSchema = z.object({
  barcode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category_id: z.number().int().positive(),
  brand: z.string().max(100).optional(),
  unit: z.string().max(50).optional(),
  weight: z.number().positive().optional(),
  supplier: z.string().max(150).optional(),
  is_featured: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
});

export const productQuerySchema = z.object({
  category_id: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  store_id: z.coerce.number().int().positive().optional(),
  featured: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort: z.enum(['newest']).optional(),
  include_inactive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
