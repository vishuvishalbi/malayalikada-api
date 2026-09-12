import type { Knex } from 'knex';

// A product can belong to many categories. products.category_id remains the
// PRIMARY category (breadcrumb / related products); the join table holds the
// full set and always contains the primary.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('product_categories', (t) => {
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.bigInteger('category_id').unsigned().notNullable().references('id').inTable('categories').onDelete('CASCADE');
    t.primary(['product_id', 'category_id']);
    t.index(['category_id']);
  });
  await knex.raw(`INSERT IGNORE INTO product_categories (product_id, category_id)
                  SELECT id, category_id FROM products WHERE category_id IS NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('product_categories');
}
