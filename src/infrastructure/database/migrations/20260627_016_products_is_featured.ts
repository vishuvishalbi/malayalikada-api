import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (t) => {
    t.tinyint('is_featured').defaultTo(0).notNullable().after('is_active');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (t) => {
    t.dropColumn('is_featured');
  });
}
