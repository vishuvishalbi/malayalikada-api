import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('item_requests', (t) => {
    t.integer('quantity').unsigned().notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('item_requests', (t) => {
    t.dropColumn('quantity');
  });
}
