import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('store_pricing', (t) => {
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.decimal('price_nzd', 10, 2).notNullable();
    t.date('effective_date').notNullable();
    t.primary(['product_id', 'store_id']);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('store_pricing');
}
