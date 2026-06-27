import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('reference_no', 20).unique().notNullable();
    t.bigInteger('customer_id').unsigned().notNullable().references('id').inTable('customers');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores');
    t.enu('status', ['pending_approval', 'approved', 'rejected']).defaultTo('pending_approval').notNullable();
    t.decimal('total_nzd', 10, 2).notNullable();
    t.string('stripe_payment_intent_id', 100).nullable();
    t.enu('payment_status', ['unpaid', 'paid', 'refunded']).defaultTo('unpaid').notNullable();
    t.text('rejection_reason').nullable();
    t.bigInteger('actioned_by').unsigned().nullable().references('id').inTable('staff_users');
    t.datetime('actioned_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('orders');
}
