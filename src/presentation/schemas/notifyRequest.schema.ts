import { z } from 'zod';

export const createNotifyRequestSchema = z.object({
  product_id: z.number().int().positive(),
  store_id: z.number().int().positive(),
});
