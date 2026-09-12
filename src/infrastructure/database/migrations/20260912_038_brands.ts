import type { Knex } from 'knex';

// Brand becomes a first-class entity. products.brand (free text) is kept as a
// denormalised display name so existing search/import code keeps working; the
// canonical link is products.brand_id.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('brands', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('name', 100).notNullable().unique();
    t.string('logo_filename', 255).nullable();
    t.datetime('deleted_at').nullable();
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('products', (t) => {
    t.bigInteger('brand_id').unsigned().nullable().references('id').inTable('brands').onDelete('SET NULL');
    t.index(['brand_id']);
  });
  await knex.raw(`INSERT IGNORE INTO brands (name)
                  SELECT DISTINCT TRIM(brand) FROM products
                  WHERE brand IS NOT NULL AND TRIM(brand) <> ''`);
  await knex.raw(`UPDATE products p JOIN brands b ON b.name = TRIM(p.brand) SET p.brand_id = b.id`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (t) => {
    t.dropForeign(['brand_id']);
    t.dropIndex(['brand_id']);
    t.dropColumn('brand_id');
  });
  await knex.schema.dropTableIfExists('brands');
}
