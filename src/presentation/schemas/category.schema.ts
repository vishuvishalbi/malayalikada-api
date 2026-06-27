import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(100).optional(),
  parent_id: z.number().int().positive().optional(),
  sort_order: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();
