import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('product_reviews', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.bigInteger('customer_id').unsigned().notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.tinyint('rating').notNullable().checkBetween([1, 5]);
    t.text('comment').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['product_id', 'customer_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('product_reviews');
}
