import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('stores', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('name', 150).notNullable();
    t.text('address').notNullable();
    t.string('phone', 20).notNullable();
    t.string('bank_account', 50).nullable();
    t.string('icon', 100).nullable();
    t.string('logo_filename', 255).nullable();
    t.tinyint('is_active').defaultTo(1).notNullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stores');
}
