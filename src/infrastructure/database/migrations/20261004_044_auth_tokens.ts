import type { Knex } from 'knex';

/** Registry of issued JWTs (by jti). A token is honoured only while its row exists, so deleting a user's rows revokes every session. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('auth_tokens', (t) => {
    t.specificType('jti', 'CHAR(36)').primary();
    t.enu('user_type', ['customer', 'staff']).notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.dateTime('expires_at').notNullable();
    t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_type', 'user_id'], 'idx_auth_tokens_user');
    t.index(['expires_at'], 'idx_auth_tokens_expires');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_tokens');
}
