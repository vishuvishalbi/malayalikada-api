import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('order_id').unsigned().notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('payment_channel', 20).notNullable();
    t.string('payment_method', 20).notNullable();
    t.string('status', 20).notNullable();
    t.decimal('amount_nzd', 10, 2).notNullable();
    t.string('provider_ref', 100).nullable();
    t.datetime('created_at').notNullable();
    t.index(['order_id']);
    t.index(['provider_ref']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transactions');
}
