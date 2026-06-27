import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('product_images', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.string('filename', 255).notNullable();
    t.integer('sort_order').defaultTo(0).notNullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('product_images');
}
