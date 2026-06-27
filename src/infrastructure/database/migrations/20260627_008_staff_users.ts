import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('staff_users', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('identifier', 100).unique().notNullable();
    t.enu('identifier_type', ['email', 'mobile']).notNullable();
    t.string('password_hash', 255).notNullable();
    t.string('name', 150).notNullable();
    t.enu('role', ['worker', 'admin']).notNullable();
    t.tinyint('is_active').defaultTo(1).notNullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('staff_users');
}
