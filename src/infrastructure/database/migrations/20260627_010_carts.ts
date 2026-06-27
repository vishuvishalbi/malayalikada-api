import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('carts', (t) => {
    t.bigInteger('customer_id').unsigned().primary().references('id').inTable('customers').onDelete('CASCADE');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.json('items').notNullable();
    t.datetime('updated_at').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('carts');
}
