import { Knex } from 'knex';

// Backfill url + path for seed product images using stable public image URLs.
// These map by filename since the seed always inserts the same filenames.
const IMAGE_URLS: Record<string, string> = {
  'matta-rice.jpg':
    'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&q=80',
  'green-cardamom.jpg':
    'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80',
  'virgin-coconut-oil.jpg':
    'https://images.unsplash.com/photo-1611075384418-0f9d5e8e0f98?w=600&q=80',
  'banana-chips.jpg':
    'https://images.unsplash.com/photo-1621956838481-ae82571a11d3?w=600&q=80',
};

export async function up(knex: Knex): Promise<void> {
  for (const [filename, url] of Object.entries(IMAGE_URLS)) {
    await knex('product_images')
      .where({ filename })
      .update({ url, path: `/uploads/${filename}` });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('product_images')
    .whereIn('filename', Object.keys(IMAGE_URLS))
    .update({ url: null, path: null });
}
