import { z } from 'zod';

export const createProductSchema = z.object({
  barcode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category_id: z.number().int().positive(),
  /** Additional categories; the primary category_id is always included. */
  category_ids: z.array(z.number().int().positive()).max(20).optional(),
  brand: z.string().max(100).nullable().optional(),
  brand_id: z.number().int().positive().nullable().optional(),
  unit: z.string().max(50).optional(),
  weight: z.number().positive().optional(),
  supplier: z.string().max(150).optional(),
  is_featured: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
});

/**
 * Comma-separated list of positive ints ("3,7,12"), as sent by the filter
 * sheet. Bounded to keep the generated `IN (...)` predicate sane.
 */
const idList = (max: number) =>
  z
    .string()
    .transform(v => v.split(',').map(s => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^\d+$/, 'expected a numeric id')).min(1).max(max))
    .transform(ids => ids.map(Number).filter(n => n > 0))
    .refine(ids => ids.length > 0, { message: 'expected at least one id' })
    .optional();

export const productQuerySchema = z
  .object({
    category_ids: idList(50),
    brand_ids: idList(50),
    search: z.string().optional(),
    store_id: z.coerce.number().int().positive().optional(),
    featured: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
    in_stock: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
    min_price: z.coerce.number().nonnegative().optional(),
    max_price: z.coerce.number().nonnegative().optional(),
    sort: z
      .enum(['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'])
      .optional(),
    include_inactive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine(
    q => q.min_price === undefined || q.max_price === undefined || q.min_price <= q.max_price,
    { message: 'min_price must not exceed max_price', path: ['min_price'] }
  );
