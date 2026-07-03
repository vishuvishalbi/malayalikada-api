import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('delivery_slabs', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.decimal('min_weight_kg', 8, 3).notNullable();
    t.decimal('max_weight_kg', 8, 3).nullable();
    t.decimal('fee_nzd', 10, 2).notNullable();
    t.boolean('is_active').defaultTo(true).notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.table('orders', (t) => {
    t.decimal('delivery_fee_nzd', 10, 2).notNullable().defaultTo(0).after('total_nzd');
    t.decimal('total_weight_kg', 10, 3).notNullable().defaultTo(0).after('delivery_fee_nzd');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('orders', (t) => {
    t.dropColumn('delivery_fee_nzd');
    t.dropColumn('total_weight_kg');
  });
  await knex.schema.dropTableIfExists('delivery_slabs');
}
