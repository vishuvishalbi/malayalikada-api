import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('customers', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('identifier', 100).unique().notNullable();
    t.enu('identifier_type', ['email', 'mobile']).notNullable();
    t.string('password_hash', 255).notNullable();
    t.string('first_name', 80).notNullable();
    t.string('last_name', 80).notNullable();
    t.bigInteger('preferred_store_id').unsigned().nullable().references('id').inTable('stores').onDelete('SET NULL');
    t.datetime('deleted_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customers');
}
