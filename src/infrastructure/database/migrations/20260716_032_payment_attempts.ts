import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payment_attempts', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('order_id').unsigned().notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('stripe_payment_intent_id', 100).nullable();
    t.string('status', 50).notNullable();
    t.text('error_message').nullable();
    t.datetime('attempted_at').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payment_attempts');
}
