import { z } from 'zod';

export const createDeliverySlabSchema = z.object({
  min_weight_kg: z.number().nonnegative(),
  max_weight_kg: z.number().positive().nullable().default(null),
  fee_nzd: z.number().nonnegative(),
  is_active: z.boolean().optional(),
});

export const updateDeliverySlabSchema = createDeliverySlabSchema.partial();
