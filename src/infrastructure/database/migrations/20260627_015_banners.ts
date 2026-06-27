import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('banners', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('title', 200).notNullable();
    t.text('subtitle').nullable();
    t.string('cta_label', 100).nullable();
    t.string('cta_route', 200).nullable();
    t.string('image_filename', 255).nullable();
    t.tinyint('is_active').defaultTo(1).notNullable();
    t.integer('sort_order').defaultTo(0).notNullable();
    t.timestamps(true, true);
  });

  await knex('banners').insert({
    title: 'Pure Spices, Freshly Ground.',
    subtitle: 'Straight from the fertile soils of the Western Ghats to your kitchen table.',
    cta_label: 'Explore the Harvest',
    cta_route: '/search',
    image_filename: null,
    is_active: 1,
    sort_order: 0,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('banners');
}
