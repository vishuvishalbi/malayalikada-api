import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('products', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('barcode', 50).unique().notNullable();
    t.string('name', 200).notNullable();
    t.text('description').nullable();
    t.bigInteger('category_id').unsigned().notNullable().references('id').inTable('categories');
    t.string('brand', 100).nullable();
    t.string('unit', 50).nullable();
    t.decimal('weight', 10, 3).nullable();
    t.string('supplier', 150).nullable();
    t.tinyint('is_active').defaultTo(1).notNullable();
    t.datetime('deleted_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('products');
}
