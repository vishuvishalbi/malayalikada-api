import type { Knex } from 'knex';

// The base migration made barcode globally UNIQUE, which collides with
// soft-deleted rows. Move uniqueness to a generated column that is NULL for
// deleted rows (MySQL treats multiple NULLs as distinct in a unique index).
export async function up(knex: Knex): Promise<void> {
  // Drop the original unique index (Knex names it `products_barcode_unique`).
  await knex.raw('ALTER TABLE products DROP INDEX products_barcode_unique');
  await knex.raw(
    `ALTER TABLE products
       ADD COLUMN barcode_active VARCHAR(50)
       GENERATED ALWAYS AS (IF(deleted_at IS NULL, barcode, NULL)) STORED`
  );
  await knex.raw(
    'ALTER TABLE products ADD UNIQUE INDEX products_barcode_active_unique (barcode_active)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE products DROP INDEX products_barcode_active_unique');
  await knex.raw('ALTER TABLE products DROP COLUMN barcode_active');
  await knex.raw('ALTER TABLE products ADD UNIQUE INDEX products_barcode_unique (barcode)');
}
