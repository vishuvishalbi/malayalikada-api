import type { Knex } from 'knex';

/// Global, app-wide contact + social settings shown in the customer app drawer.
/// SINGLETON: exactly one row, fixed id = 1. The migration seeds that row so the
/// public GET /settings never has to 404 or return an empty body. All value
/// columns are nullable — NULL means "not configured yet".
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('app_settings', table => {
    table.integer('id').unsigned().primary();
    table.string('support_email', 255).nullable();
    table.string('support_phone', 40).nullable();
    table.string('support_hours', 120).nullable();
    table.string('contact_address', 255).nullable();
    table.string('facebook_url', 500).nullable();
    table.string('instagram_url', 500).nullable();
    table.string('whatsapp_url', 500).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Singleton guard: only id = 1 may ever exist.
  await knex.raw('ALTER TABLE app_settings ADD CONSTRAINT chk_app_settings_singleton CHECK (id = 1)');

  await knex('app_settings').insert({ id: 1 });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_settings');
}
