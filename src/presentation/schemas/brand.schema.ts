import { z } from 'zod';

export const createBrandSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const updateBrandSchema = createBrandSchema.partial();
