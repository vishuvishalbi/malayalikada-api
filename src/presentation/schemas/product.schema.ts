import { z } from 'zod';

/**
 * Canonical units offered by the admin product form. Advisory only — see the
 * note on `unit` below for why this is not enforced as a Zod enum.
 */
export const PRODUCT_UNITS = ['kg', 'g', 'ml', 'L', 'pcs'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const createProductSchema = z.object({
  barcode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category_id: z.number().int().positive(),
  /** Additional categories; the primary category_id is always included. */
  category_ids: z.array(z.number().int().positive()).max(20).optional(),
  brand: z.string().max(100).nullable().optional(),
  brand_id: z.number().int().positive().nullable().optional(),
  /**
   * Unit of sale. The admin UI offers the canonical set in {@link PRODUCT_UNITS},
   * but this stays free-text on purpose: ~2900 catalog rows carry legacy
   * values ("500g", "1 L", junk) and an enum here would make every edit of
   * those products fail. Validation is length-only; normalisation is a
   * separate data migration.
   */
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

/** Query params for `GET /products/export/csv`. */
export const productExportQuerySchema = z.object({
  /** When given, the export includes that store's price and stock columns. */
  store_id: z.coerce.number().int().positive().optional(),
});
