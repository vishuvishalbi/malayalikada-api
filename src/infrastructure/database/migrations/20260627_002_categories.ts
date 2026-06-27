import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('categories', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('name', 100).notNullable();
    t.string('icon', 100).nullable();
    t.string('image_filename', 255).nullable();
    t.bigInteger('parent_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL');
    t.integer('sort_order').defaultTo(0).notNullable();
    t.datetime('deleted_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('categories');
}
