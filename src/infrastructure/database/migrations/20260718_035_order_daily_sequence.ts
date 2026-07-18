import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_daily_sequences', (t) => {
    t.date('seq_date').primary();
    t.integer('next_seq').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_daily_sequences');
}
