import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Store
  const [storeId] = await knex('stores').insert({
    name: 'Malayali Kada — Kozhikode',
    address: 'MG Road, Kozhikode, Kerala 673001',
    phone: '+91 9876543210',
    bank_account: null,
    icon: 'storefront',
    logo_filename: null,
    is_active: 1,
  });

  // Categories
  const [riceCatId] = await knex('categories').insert({ name: 'Rice', icon: 'grain', sort_order: 0 });
  const [spicesCatId] = await knex('categories').insert({ name: 'Spices', icon: 'pip', sort_order: 1 });
  const [oilsCatId] = await knex('categories').insert({ name: 'Oils', icon: 'oil_barrel', sort_order: 2 });
  const [snacksCatId] = await knex('categories').insert({ name: 'Snacks', icon: 'fastfood', sort_order: 3 });

  // Products
  const [rice] = await knex('products').insert({
    barcode: '8901234567890',
    name: 'Premium Matta Rice',
    description: 'Ancient nutrient-rich grain sourced from the organic farms of Palakkad.',
    category_id: riceCatId,
    brand: 'Kerala Harvest',
    unit: '1 kg',
    weight: 1.0,
    supplier: 'Palakkad Organic Farms',
    is_active: 1,
    is_featured: 1,
  });

  const [cardamom] = await knex('products').insert({
    barcode: '8901234567891',
    name: 'Green Cardamom',
    description: 'Hand-picked Grade A cardamom pods from Idukki mountains.',
    category_id: spicesCatId,
    brand: 'Western Ghats',
    unit: '100 g',
    weight: 0.1,
    supplier: 'Idukki Spice Growers',
    is_active: 1,
    is_featured: 0,
  });

  const [coconutOil] = await knex('products').insert({
    barcode: '8901234567892',
    name: 'Virgin Coconut Oil',
    description: 'Cold-pressed from the freshest coconuts, preserving natural aroma.',
    category_id: oilsCatId,
    brand: 'Kerala Pure',
    unit: '500 ml',
    weight: 0.5,
    supplier: 'Thrissur Coconut Mill',
    is_active: 1,
    is_featured: 0,
  });

  const [bananaChips] = await knex('products').insert({
    barcode: '8901234567893',
    name: 'Crispy Banana Chips',
    description: 'Thinly sliced Nendran bananas fried in pure coconut oil.',
    category_id: snacksCatId,
    brand: 'Kozhikode Snacks',
    unit: '200 g',
    weight: 0.2,
    supplier: 'Kozhikode Snack Factory',
    is_active: 1,
    is_featured: 1,
  });

  // Product images (placeholder filenames — replace with real uploads)
  await knex('product_images').insert([
    { product_id: rice, filename: 'matta-rice.jpg', sort_order: 0 },
    { product_id: cardamom, filename: 'green-cardamom.jpg', sort_order: 0 },
    { product_id: coconutOil, filename: 'virgin-coconut-oil.jpg', sort_order: 0 },
    { product_id: bananaChips, filename: 'banana-chips.jpg', sort_order: 0 },
  ]);

  // Stock — cardamom is out of stock, others have healthy stock
  await knex('product_stock').insert([
    { product_id: rice, store_id: storeId, quantity: 150, low_stock_threshold: 10 },
    { product_id: cardamom, store_id: storeId, quantity: 0, low_stock_threshold: 5 },
    { product_id: coconutOil, store_id: storeId, quantity: 80, low_stock_threshold: 10 },
    { product_id: bananaChips, store_id: storeId, quantity: 200, low_stock_threshold: 20 },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('product_stock').del();
  await knex('product_images').del();
  await knex('products').del();
  await knex('categories').del();
  await knex('stores').del();
}
