import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('favorites');
  if (!exists) {
    await knex.schema.createTable('favorites', (t) => {
      t.bigIncrements('id').primary();
      t.bigInteger('customer_id').unsigned().notNullable().references('id').inTable('customers').onDelete('CASCADE');
      t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.unique(['customer_id', 'product_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('favorites');
}
