import type { Knex } from 'knex';

/// Denormalized product count per category, shown as the "N Items" badge on
/// category cards. Recalculated on product write (see CategoryCountService)
/// rather than joined per request — the catalog changes far less often than
/// the category list is read.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', table => {
    table.integer('product_count').unsigned().notNullable().defaultTo(0);
  });

  // Seed from the current catalog.
  await knex.raw(`
    UPDATE categories c
    SET product_count = (
      SELECT COUNT(DISTINCT pc.product_id)
      FROM product_categories pc
      JOIN products p ON p.id = pc.product_id
      WHERE pc.category_id = c.id
        AND p.deleted_at IS NULL
        AND p.is_active = 1
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', table => {
    table.dropColumn('product_count');
  });
}
