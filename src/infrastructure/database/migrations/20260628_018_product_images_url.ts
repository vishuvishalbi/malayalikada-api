import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('product_images', (t) => {
    t.string('url', 2048).nullable().after('filename');
    t.string('path', 512).nullable().after('url');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('product_images', (t) => {
    t.dropColumn('url');
    t.dropColumn('path');
  });
}
