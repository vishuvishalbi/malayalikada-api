import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notify_requests', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('customer_id').unsigned().notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('notified_at').nullable();
    t.unique(['customer_id', 'product_id', 'store_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notify_requests');
}
