import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('orders', (t) => {
    t.datetime('stock_deducted_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('stock_deducted_at');
  });
}
