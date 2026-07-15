import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_items', (t) => {
    t.datetime('reserved_at').nullable();
  });

  await knex.raw(
    "ALTER TABLE orders MODIFY status ENUM('pending_approval', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending_approval'"
  );
  await knex.raw(
    "ALTER TABLE orders MODIFY payment_status ENUM('unpaid', 'partially_paid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid'"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE orders MODIFY payment_status ENUM('unpaid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid'"
  );
  await knex.raw(
    "ALTER TABLE orders MODIFY status ENUM('pending_approval', 'approved', 'rejected') NOT NULL DEFAULT 'pending_approval'"
  );
  await knex.schema.alterTable('order_items', (t) => {
    t.dropColumn('reserved_at');
  });
}
