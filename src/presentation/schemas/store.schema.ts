import { z } from 'zod';

export const createStoreSchema = z.object({
  name: z.string().min(1).max(150),
  address: z.string().min(1),
  phone: z.string().min(1).max(20),
  bank_account: z.string().max(50).optional(),
  icon: z.string().max(100).optional(),
});

export const updateStoreSchema = createStoreSchema.partial().extend({
  is_active: z.boolean().optional(),
});
