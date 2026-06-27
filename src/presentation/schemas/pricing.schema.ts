import { z } from 'zod';

export const pricingQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  product_id: z.coerce.number().int().positive().optional(),
});

export const setPricingSchema = z.object({
  product_id: z.number().int().positive(),
  store_id: z.number().int().positive(),
  price_nzd: z.number().positive(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

export const updatePricingSchema = setPricingSchema.omit({ product_id: true, store_id: true });
