import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('csv_import_logs', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('filename', 255).notNullable();
    t.bigInteger('imported_by').unsigned().notNullable().references('id').inTable('staff_users');
    t.integer('rows_total').notNullable();
    t.integer('rows_ok').notNullable();
    t.integer('rows_failed').notNullable();
    t.string('error_report_filename', 255).nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('csv_import_logs');
}
