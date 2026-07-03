import bcrypt from 'bcrypt';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const adminExists = await knex('staff_users')
    .where({ identifier: 'admin@demo.malayalikada' })
    .first();
  if (!adminExists) {
    const adminHash = await bcrypt.hash('DemoAdmin@1234', 10);
    await knex('staff_users').insert({
      identifier: 'admin@demo.malayalikada',
      identifier_type: 'email',
      password_hash: adminHash,
      name: 'Demo Admin',
      role: 'admin',
      is_active: 1,
    });
  }

  const workerExists = await knex('staff_users')
    .where({ identifier: 'worker@demo.malayalikada' })
    .first();
  if (!workerExists) {
    const workerHash = await bcrypt.hash('DemoWorker@1234', 10);
    const [workerId] = await knex('staff_users').insert({
      identifier: 'worker@demo.malayalikada',
      identifier_type: 'email',
      password_hash: workerHash,
      name: 'Demo Worker',
      role: 'worker',
      is_active: 1,
    });

    const store = await knex('stores').first('id');
    if (store) {
      await knex('staff_stores').insert({ staff_id: workerId, store_id: store.id });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('staff_users')
    .whereIn('identifier', ['admin@demo.malayalikada', 'worker@demo.malayalikada'])
    .del();
}
