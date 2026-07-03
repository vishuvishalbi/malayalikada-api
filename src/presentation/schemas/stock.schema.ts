import { z } from 'zod';

export const stockQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  product_id: z.coerce.number().int().positive().optional(),
  low_stock: z.coerce.boolean().optional(),
});

export const setStockSchema = z.object({
  product_id: z.number().int().positive(),
  store_id: z.number().int().positive(),
  quantity: z.number().int().min(0),
  low_stock_threshold: z.number().int().min(0).default(10),
});
