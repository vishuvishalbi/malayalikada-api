import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('customers', (t) => {
    t.string('address', 255).nullable().defaultTo(null);
    t.string('phone', 30).nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('customers', (t) => {
    t.dropColumn('address');
    t.dropColumn('phone');
  });
}
