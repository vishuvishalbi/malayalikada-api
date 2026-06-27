import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_items', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('order_id').unsigned().notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products');
    t.integer('quantity').notNullable();
    t.decimal('unit_price_nzd', 10, 2).notNullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_items');
}
