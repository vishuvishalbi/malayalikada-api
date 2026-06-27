import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('staff_stores', (t) => {
    t.bigInteger('staff_id').unsigned().notNullable().references('id').inTable('staff_users').onDelete('CASCADE');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.primary(['staff_id', 'store_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('staff_stores');
}
