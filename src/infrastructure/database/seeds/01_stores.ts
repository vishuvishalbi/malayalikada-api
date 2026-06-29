import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('stores').del();

  await knex('stores').insert([
    {
      name: 'Malayali Kada - Main Branch',
      address: '123 Main Street, Thrissur, Kerala 680001',
      phone: '+919876543210',
      bank_account: null,
      icon: null,
      logo_filename: null,
      is_active: 1,
      lat: 10.7867,
      lng: 76.6548,
    },
  ]);
}
