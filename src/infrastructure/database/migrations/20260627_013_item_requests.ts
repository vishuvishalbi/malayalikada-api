import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('item_requests', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('customer_id').unsigned().notNullable().references('id').inTable('customers');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores');
    t.string('product_name', 200).notNullable();
    t.string('barcode', 50).nullable();
    t.text('notes').nullable();
    t.enu('status', ['new', 'sourced', 'declined']).defaultTo('new').notNullable();
    t.text('admin_notes').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('item_requests');
}
