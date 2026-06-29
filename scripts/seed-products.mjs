import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env manually (no dotenv dep needed)
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const { default: mysql } = await import('mysql2/promise');

const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ── 1. Add more categories ────────────────────────────────────────────────────
const newCategories = [
  { name: 'Nuts & Dry Fruits', icon: 'eco', sort: 4 },
  { name: 'Pantry', icon: 'kitchen', sort: 5 },
  { name: 'Essentials', icon: 'shopping_basket', sort: 6 },
  { name: 'Preserves', icon: 'jar', sort: 7 },
  { name: 'Beverages', icon: 'local_cafe', sort: 8 },
];

const [existingCats] = await db.query('SELECT name FROM categories');
const existingNames = new Set(existingCats.map(r => r.name));

for (const c of newCategories) {
  if (!existingNames.has(c.name)) {
    await db.query(
      'INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)',
      [c.name, c.icon, c.sort]
    );
    console.log(`  + Category: ${c.name}`);
  }
}

// ── 2. Fetch all category IDs ─────────────────────────────────────────────────
const [cats] = await db.query('SELECT id, name FROM categories');
const catId = {};
for (const c of cats) catId[c.name] = c.id;
console.log('Categories:', catId);

// ── 3. Products data ──────────────────────────────────────────────────────────
const products = [
  // RICE
  {
    name: 'Jeerakasala Rice',
    desc: 'Fragrant short-grain rice native to Kerala, perfect for biriyani and special feasts.',
    barcode: '8901234567001', unit: '1 kg', weight: '1.000',
    brand: 'Kerala Harvest', supplier: 'Palakkad Organic Farms', cat: 'Rice', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=600&q=80',
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&q=80',
      'https://images.unsplash.com/photo-1506368249639-73a05d6f6488?w=600&q=80',
    ],
  },
  {
    name: 'Palakkadan Matta Rice',
    desc: 'Earthy red-husked rice from Palakkad with a nutty taste and high fibre.',
    barcode: '8901234567002', unit: '5 kg', weight: '5.000',
    brand: 'Palakkad Mills', supplier: 'Palakkad Organic Farms', cat: 'Rice', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1607532941433-304659e8198a?w=600&q=80',
      'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=600&q=80',
      'https://images.unsplash.com/photo-1516684732162-798a0062be99?w=600&q=80',
    ],
  },
  {
    name: 'Ponni Boiled Rice',
    desc: 'Double-boiled long grain rice, soft and fluffy — the everyday South Indian staple.',
    barcode: '8901234567003', unit: '2 kg', weight: '2.000',
    brand: 'Tamil Nadu Mills', supplier: 'Coimbatore Agro', cat: 'Rice', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1516684732162-798a0062be99?w=600&q=80',
      'https://images.unsplash.com/photo-1607532941433-304659e8198a?w=600&q=80',
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&q=80',
    ],
  },
  // SPICES
  {
    name: 'Cloves (Whole)',
    desc: 'Premium sun-dried clove buds from the spice gardens of Thrissur with intense aroma.',
    barcode: '8901234567004', unit: '50 g', weight: '0.050',
    brand: 'Western Ghats', supplier: 'Thrissur Spice Co.', cat: 'Spices', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?w=600&q=80',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&q=80',
      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80',
    ],
  },
  {
    name: 'Cinnamon Sticks',
    desc: 'True Ceylon cinnamon quills with a sweet, delicate bark flavour for curries and chai.',
    barcode: '8901234567005', unit: '100 g', weight: '0.100',
    brand: 'Western Ghats', supplier: 'Idukki Spice Growers', cat: 'Spices', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1545158535-c3f7168c28b6?w=600&q=80',
      'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?w=600&q=80',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&q=80',
    ],
  },
  {
    name: 'Star Anise',
    desc: 'Beautiful star-shaped dried spice from the hills of Wayanad for biriyani and chai.',
    barcode: '8901234567006', unit: '50 g', weight: '0.050',
    brand: 'Wayanad Spice Trail', supplier: 'Wayanad Hills Farms', cat: 'Spices', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&q=80',
      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80',
      'https://images.unsplash.com/photo-1545158535-c3f7168c28b6?w=600&q=80',
    ],
  },
  {
    name: 'Coriander Seeds',
    desc: 'Aromatic whole coriander seeds harvested from organic farms of the Malabar coast.',
    barcode: '8901234567007', unit: '200 g', weight: '0.200',
    brand: 'Malabar Spices', supplier: 'Kozhikode Agro', cat: 'Spices', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80',
      'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?w=600&q=80',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&q=80',
    ],
  },
  {
    name: 'Kashmiri Red Chili',
    desc: 'Deep crimson dried chilies with mild heat and vibrant colour — perfect for visual curries.',
    barcode: '8901234567008', unit: '100 g', weight: '0.100',
    brand: 'Kashmir Valley', supplier: 'Kashmir Agro', cat: 'Spices', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=600&q=80',
      'https://images.unsplash.com/photo-1526040652367-ac003a0475fe?w=600&q=80',
      'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?w=600&q=80',
    ],
  },
  {
    name: 'Curry Leaves (Dried)',
    desc: 'Sun-dried Kerala curry leaves retaining their bold, aromatic essential oils.',
    barcode: '8901234567009', unit: '25 g', weight: '0.025',
    brand: 'Kerala Harvest', supplier: 'Ernakulam Farms', cat: 'Spices', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&q=80',
      'https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=600&q=80',
      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80',
    ],
  },
  // OILS
  {
    name: 'Sesame Oil (Cold-Pressed)',
    desc: 'Traditional cold-pressed gingelly oil — rich, nutty, ideal for tempering and medicine.',
    barcode: '8901234567010', unit: '500 ml', weight: '0.500',
    brand: 'Naatu Maavu', supplier: 'Thrissur Cold Press Mill', cat: 'Oils', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80',
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    ],
  },
  {
    name: 'Mustard Oil',
    desc: 'Pungent and aromatic mustard oil for authentic pickles and Bengali-style preparations.',
    barcode: '8901234567011', unit: '1 L', weight: '1.000',
    brand: 'Rajasthan Mills', supplier: 'Punjab Agro', cat: 'Oils', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&q=80',
      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    ],
  },
  {
    name: 'Pure Ghee (A2)',
    desc: 'Handcrafted A2 cow ghee from free-range cows, slow-cooked to golden perfection.',
    barcode: '8901234567012', unit: '250 ml', weight: '0.300',
    brand: 'Nandini Dairy', supplier: 'Wayanad Dairy Co-op', cat: 'Oils', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1598524374912-10bd4f5ea694?w=600&q=80',
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&q=80',
      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80',
    ],
  },
  // SNACKS
  {
    name: 'Jackfruit Chips',
    desc: 'Thin, crispy jackfruit slices fried in pure coconut oil — a tropical Kerala delight.',
    barcode: '8901234567013', unit: '200 g', weight: '0.200',
    brand: 'Kozhikode Snacks', supplier: 'Kozhikode Snack Factory', cat: 'Snacks', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1621956838481-ae82571a11d3?w=600&q=80',
      'https://images.unsplash.com/photo-1559054663-e8d23213f55c?w=600&q=80',
      'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80',
    ],
  },
  {
    name: 'Tapioca Chips (Kappa)',
    desc: 'Traditional paper-thin cassava chips seasoned with sea salt and turmeric.',
    barcode: '8901234567014', unit: '300 g', weight: '0.300',
    brand: 'Trivandrum Bites', supplier: 'South Kerala Snacks', cat: 'Snacks', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80',
      'https://images.unsplash.com/photo-1621956838481-ae82571a11d3?w=600&q=80',
      'https://images.unsplash.com/photo-1559054663-e8d23213f55c?w=600&q=80',
    ],
  },
  {
    name: 'Murukku (Rice Spirals)',
    desc: 'Classic crunchy spiral snack made from rice flour and black sesame seeds.',
    barcode: '8901234567015', unit: '250 g', weight: '0.250',
    brand: 'Ammachi Kitchen', supplier: 'Palakkad Home Foods', cat: 'Snacks', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1559054663-e8d23213f55c?w=600&q=80',
      'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80',
      'https://images.unsplash.com/photo-1621956838481-ae82571a11d3?w=600&q=80',
    ],
  },
  {
    name: 'Coconut Ladoo',
    desc: 'Soft handmade balls of freshly grated coconut and jaggery — a festive Kerala sweet.',
    barcode: '8901234567016', unit: '200 g', weight: '0.200',
    brand: 'Ammachi Kitchen', supplier: 'Thrissur Sweet House', cat: 'Snacks', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
      'https://images.unsplash.com/photo-1559054663-e8d23213f55c?w=600&q=80',
      'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80',
    ],
  },
  // NUTS & DRY FRUITS
  {
    name: 'Dried Mango Slices',
    desc: 'Sun-dried Alphonso mango strips bursting with concentrated tropical sweetness.',
    barcode: '8901234567017', unit: '150 g', weight: '0.150',
    brand: 'Goa Tropics', supplier: 'Ratnagiri Farms', cat: 'Nuts & Dry Fruits', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&q=80',
      'https://images.unsplash.com/photo-1601493700631-2851e9e34e00?w=600&q=80',
      'https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=600&q=80',
    ],
  },
  {
    name: 'Walnuts (Premium Halves)',
    desc: 'Crunchy Kashmiri walnut halves packed with omega-3 fatty acids and antioxidants.',
    barcode: '8901234567018', unit: '500 g', weight: '0.500',
    brand: 'Kashmir Valley', supplier: 'Srinagar Nut House', cat: 'Nuts & Dry Fruits', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1563412019-7b81a4f7d10d?w=600&q=80',
      'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&q=80',
      'https://images.unsplash.com/photo-1601493700631-2851e9e34e00?w=600&q=80',
    ],
  },
  {
    name: 'Almonds (Raw)',
    desc: 'Whole raw almonds — a daily dose of protein, fibre, and healthy fats.',
    barcode: '8901234567019', unit: '250 g', weight: '0.250',
    brand: 'Nutri Fresh', supplier: 'Mumbai Dry Fruit Co.', cat: 'Nuts & Dry Fruits', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=600&q=80',
      'https://images.unsplash.com/photo-1563412019-7b81a4f7d10d?w=600&q=80',
      'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&q=80',
    ],
  },
  {
    name: 'Dried Figs',
    desc: 'Naturally sun-ripened figs with a honey-sweet flavour and chewy texture.',
    barcode: '8901234567020', unit: '200 g', weight: '0.200',
    brand: 'Mediterranean Select', supplier: 'Mumbai Dry Fruit Co.', cat: 'Nuts & Dry Fruits', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1601493700631-2851e9e34e00?w=600&q=80',
      'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=600&q=80',
      'https://images.unsplash.com/photo-1563412019-7b81a4f7d10d?w=600&q=80',
    ],
  },
  // PANTRY
  {
    name: 'Urad Dal (Split)',
    desc: 'Creamy split black gram essential for idli batter, dal makhani, and crispy vadas.',
    barcode: '8901234567021', unit: '1 kg', weight: '1.000',
    brand: 'Pavithra Foods', supplier: 'Madhya Pradesh Agro', cat: 'Pantry', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1614251056798-0a63eda2bb25?w=600&q=80',
      'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=600&q=80',
      'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&q=80',
    ],
  },
  {
    name: 'Toor Dal (Yellow Lentils)',
    desc: 'Split pigeon peas — the backbone of South Indian sambar and rasam recipes.',
    barcode: '8901234567022', unit: '1 kg', weight: '1.000',
    brand: 'Pavithra Foods', supplier: 'Karnataka Agro', cat: 'Pantry', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=600&q=80',
      'https://images.unsplash.com/photo-1614251056798-0a63eda2bb25?w=600&q=80',
      'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&q=80',
    ],
  },
  {
    name: 'Coconut Sugar',
    desc: 'Low-GI natural sweetener from evaporated coconut flower sap, rich in minerals.',
    barcode: '8901234567023', unit: '500 g', weight: '0.500',
    brand: 'Organic Kerala', supplier: 'Alappuzha Organics', cat: 'Pantry', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&q=80',
      'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=600&q=80',
      'https://images.unsplash.com/photo-1614251056798-0a63eda2bb25?w=600&q=80',
    ],
  },
  // ESSENTIALS
  {
    name: 'Tamarind Block',
    desc: 'Seedless compressed tamarind — the sour soul of sambar, rasam, and fish curries.',
    barcode: '8901234567024', unit: '200 g', weight: '0.200',
    brand: 'South Spice', supplier: 'Madurai Farms', cat: 'Essentials', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
      'https://images.unsplash.com/photo-1614251056798-0a63eda2bb25?w=600&q=80',
      'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=600&q=80',
    ],
  },
  {
    name: 'Coconut Milk Powder',
    desc: 'Spray-dried premium coconut milk — dissolve in warm water for rich, creamy gravies.',
    barcode: '8901234567025', unit: '150 g', weight: '0.150',
    brand: 'Coco Lanka', supplier: 'Alappuzha Coco Mill', cat: 'Essentials', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1559181567-c3190b6a3c79?w=600&q=80',
      'https://images.unsplash.com/photo-1598524374912-10bd4f5ea694?w=600&q=80',
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
    ],
  },
  {
    name: 'Rice Flour (Fine)',
    desc: 'Stone-ground fine rice flour for puttu, idiappam, and crispy dosas.',
    barcode: '8901234567026', unit: '1 kg', weight: '1.000',
    brand: 'Naatu Maavu', supplier: 'Palakkad Flour Mills', cat: 'Essentials', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=600&q=80',
      'https://images.unsplash.com/photo-1559181567-c3190b6a3c79?w=600&q=80',
      'https://images.unsplash.com/photo-1598524374912-10bd4f5ea694?w=600&q=80',
    ],
  },
  // PRESERVES
  {
    name: 'Mango Pickle (Kadumanga)',
    desc: 'Fiery Kerala-style raw mango pickle in sesame oil — timeless with plain rice.',
    barcode: '8901234567027', unit: '300 g', weight: '0.350',
    brand: 'Mathrukam', supplier: 'Thrissur Home Foods', cat: 'Preserves', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1589135233689-5171c1dd0672?w=600&q=80',
      'https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=600&q=80',
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
    ],
  },
  {
    name: 'Lime Pickle',
    desc: 'Sun-dried whole limes pickled with chili, fenugreek, and mustard — tangy punch.',
    barcode: '8901234567028', unit: '250 g', weight: '0.300',
    brand: 'Mathrukam', supplier: 'Ernakulam Home Foods', cat: 'Preserves', featured: 0,
    images: [
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
      'https://images.unsplash.com/photo-1589135233689-5171c1dd0672?w=600&q=80',
      'https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=600&q=80',
    ],
  },
  // BEVERAGES
  {
    name: 'Kerala Cardamom Tea',
    desc: 'High-grown CTC black tea from Munnar estates blended with crushed cardamom pods.',
    barcode: '8901234567029', unit: '250 g', weight: '0.250',
    brand: 'Munnar Tea', supplier: 'High Range Tea Estate', cat: 'Beverages', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
      'https://images.unsplash.com/photo-1519682577862-22b62b24e493?w=600&q=80',
    ],
  },
  {
    name: 'Roasted Coffee (Filter)',
    desc: 'Dark-roasted Arabica + Robusta blend from Coorg hills — brewed for the South Indian filter.',
    barcode: '8901234567030', unit: '250 g', weight: '0.250',
    brand: 'Coorg Hills', supplier: 'Coorg Coffee Estate', cat: 'Beverages', featured: 1,
    images: [
      'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&q=80',
      'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    ],
  },
];

// ── 4. Insert products + images ───────────────────────────────────────────────
const [existingProds] = await db.query('SELECT barcode FROM products');
const existingBarcodes = new Set(existingProds.map(r => r.barcode));

let inserted = 0;
for (const p of products) {
  if (existingBarcodes.has(p.barcode)) {
    console.log(`  - Skip (exists): ${p.name}`);
    continue;
  }
  const cid = catId[p.cat];
  if (!cid) {
    console.log(`  ! Missing category "${p.cat}" — skipping ${p.name}`);
    continue;
  }

  const [result] = await db.query(
    `INSERT INTO products (barcode, name, description, category_id, brand, unit, weight, supplier, is_active, is_featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [p.barcode, p.name, p.desc, cid, p.brand, p.unit, p.weight, p.supplier, p.featured]
  );
  const productId = result.insertId;

  for (let i = 0; i < p.images.length; i++) {
    const url = p.images[i];
    const filename = `${productId}-img${i}.jpg`;
    await db.query(
      `INSERT INTO product_images (product_id, filename, url, path, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [productId, filename, url, `/uploads/${filename}`, i]
    );
  }

  console.log(`  + [${p.cat}] ${p.name} (${p.images.length} imgs)`);
  inserted++;
}

console.log(`\nDone. Inserted ${inserted} new products.`);
await db.end();
