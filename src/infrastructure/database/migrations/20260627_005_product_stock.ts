import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('product_stock', (t) => {
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.integer('quantity').defaultTo(0).notNullable();
    t.integer('low_stock_threshold').defaultTo(10).notNullable();
    t.primary(['product_id', 'store_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('product_stock');
}
