import { z } from 'zod';

export const createBannerSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().optional(),
  cta_label: z.string().max(100).optional(),
  cta_route: z.string().max(200).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateBannerSchema = createBannerSchema.partial().extend({
  is_active: z.boolean().optional(),
});
