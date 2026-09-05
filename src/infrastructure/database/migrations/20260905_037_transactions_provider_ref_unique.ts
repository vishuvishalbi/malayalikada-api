import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('transactions', (t) => {
    t.dropIndex(['provider_ref']);
    t.unique(['provider_ref']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('transactions', (t) => {
    t.dropUnique(['provider_ref']);
    t.index(['provider_ref']);
  });
}
