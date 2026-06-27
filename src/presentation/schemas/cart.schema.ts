import { z } from 'zod';

export const addItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

export const setItemSchema = z.object({
  quantity: z.number().int().min(0),
});
