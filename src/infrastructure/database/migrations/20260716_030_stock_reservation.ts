import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('product_stock', (t) => {
    t.integer('reserved_quantity').defaultTo(0).notNullable();
    t.integer('max_reserve_qty').defaultTo(10).notNullable();
  });

  await knex.schema.createTable('cart_items', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('cart_id').unsigned().notNullable().references('customer_id').inTable('carts').onDelete('CASCADE');
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores');
    t.integer('quantity').notNullable();
    t.datetime('reserved_at').notNullable();
    t.timestamps(true, true);
    t.unique(['cart_id', 'product_id']);
  });

  await knex('carts').del();
  await knex.schema.alterTable('carts', (t) => {
    t.dropColumn('items');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('carts', (t) => {
    t.json('items').notNullable().defaultTo(JSON.stringify([]));
  });
  await knex.schema.dropTableIfExists('cart_items');
  await knex.schema.alterTable('product_stock', (t) => {
    t.dropColumn('reserved_quantity');
    t.dropColumn('max_reserve_qty');
  });
}
