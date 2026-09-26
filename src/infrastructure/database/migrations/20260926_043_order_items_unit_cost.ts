import type { Knex } from 'knex';

/** Snapshot the unit cost at order time so profit can be computed even after store_pricing.cost_nzd changes. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_items', (t) => {
    t.decimal('unit_cost_nzd', 10, 2).nullable().after('unit_price_nzd');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_items', (t) => {
    t.dropColumn('unit_cost_nzd');
  });
}
