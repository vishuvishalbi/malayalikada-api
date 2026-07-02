import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('customers', (t) => {
    // Dedicated unique columns per Requirements v5 signup; nullable so
    // pre-existing identifier-only rows survive.
    t.string('email', 191).unique().nullable().defaultTo(null);
    t.string('phone_number', 30).unique().nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('customers', (t) => {
    t.dropColumn('email');
    t.dropColumn('phone_number');
  });
}
