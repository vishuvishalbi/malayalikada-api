import { z } from 'zod';

export const addFavoriteSchema = z.object({
  product_id: z.number().int().positive(),
});
