import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('store_pricing', (t) => {
    t.decimal('cost_nzd', 10, 2).nullable().after('price_nzd');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('store_pricing', (t) => {
    t.dropColumn('cost_nzd');
  });
}
