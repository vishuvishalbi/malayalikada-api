import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex('staff_users').where({ identifier: 'admin@malayalikada.com' }).first();
  if (existing) return;

  const password_hash = await bcrypt.hash('Admin@1234', 10);
  await knex('staff_users').insert({
    identifier: 'admin@malayalikada.com',
    identifier_type: 'email',
    password_hash,
    name: 'Admin',
    role: 'admin',
    is_active: 1,
  });
}
