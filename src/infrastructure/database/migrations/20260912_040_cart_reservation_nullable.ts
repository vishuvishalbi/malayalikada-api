import type { Knex } from 'knex';

// Stale cart holds now lapse (reserved_at = NULL) instead of deleting the
// cart line, so a customer who returns after 15 minutes still has their cart.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cart_items', (t) => {
    t.datetime('reserved_at').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('UPDATE cart_items SET reserved_at = NOW() WHERE reserved_at IS NULL');
  await knex.schema.alterTable('cart_items', (t) => {
    t.datetime('reserved_at').notNullable().alter();
  });
}
