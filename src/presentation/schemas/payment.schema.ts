import { z } from 'zod';

export const createIntentSchema = z.object({
  order_id: z.number().int().positive(),
  amount_nzd: z.number().positive(),
});
